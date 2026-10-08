#!/usr/bin/env python3
"""過去検証用に、IRBank の四半期業績ページ（https://irbank.net/<コード>/quarter）から
四半期ごとの売上（営業収益）と営業利益の実績を取得し、data/quarterly/<コード>.json に保存する（標準ライブラリのみ）。

使い方:
  python3 stock-analysis/fetch_quarterly.py <コード一覧ファイル>

アクセス間隔は1秒以上。保存済みの銘柄はスキップする。値は IRBank の表示どおり（兆・億など）を円に直したもので、有効数字は3桁程度。
screen_select.py からは load()・growth()・two_quarter_growth() を使う。
"""

import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "quarterly")
URL = "https://irbank.net/{code}/quarter"
UNIT = {"兆": 1e12, "億": 1e8, "万": 1e4}


def num(s):
    s = s.split()[0] if s.strip() else ""
    if s in ("", "-"):
        return None
    m = re.match(r"(-?[\d.]+)(兆|億|万)?(?:([\d.]+)(億|万))?", s.replace(",", ""))
    if not m:
        return None
    v = float(m.group(1)) * UNIT.get(m.group(2), 1)
    if m.group(3):
        v += float(m.group(3)) * UNIT[m.group(4)] * (1 if v >= 0 else -1)
    return v


def parse(page):
    tab = re.search(r"<table.*?</table>", page, re.S)
    if not tab:
        return {}
    out, metric = {}, None
    for tr in re.findall(r"<tr.*?</tr>", tab.group(0), re.S):
        cells = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", c))).strip()
                 for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", tr, re.S)]
        if not cells or cells[0] == "科目":
            continue
        if not re.match(r"\d{4}/\d{2}", cells[0]):
            metric = cells[0]
            cells = cells[1:]
        if metric and len(cells) >= 5 and re.match(r"\d{4}/\d{2}", cells[0]):
            out.setdefault(metric, {})[cells[0]] = [num(c) for c in cells[1:5]]
    return out


def fetch(code):
    """IRBank から取得して保存し、解析結果を返す。"""
    req = urllib.request.Request(URL.format(code=code), headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = parse(r.read().decode("utf-8", "replace"))
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f"{code}.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return data


def load(code, max_age_days=7):
    """保存済みで max_age_days 日以内ならそれを、なければ取得して返す。戻り値 (data, 取得したか)。"""
    path = os.path.join(OUT, f"{code}.json")
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < max_age_days * 86400:
        with open(path, encoding="utf-8") as f:
            return json.load(f), False
    return fetch(code), True


SALES_KEYS = ("売上高", "営業収益", "売上収益", "経常収益")


def quarters(data):
    """[(四半期末, 発表済みとみなす日, 売上, 営業利益)] を古い順に返す。変則決算の期は使わない。"""
    smet = next((k for k in data if k in SALES_KEYS), None)
    if "営業利益" not in data or not smet:
        return []
    out = []
    for fy, vals in data["営業利益"].items():
        if not re.fullmatch(r"\d{4}/\d{2}", fy):
            continue
        y, m = map(int, fy.split("/"))
        sv = data[smet].get(fy, [None] * 4)
        for k in range(4):
            mm, yy = m - (3 - k) * 3, y
            while mm <= 0:
                mm, yy = mm + 12, yy - 1
            end = dt.date(yy, mm, 28)
            out.append((end, end + dt.timedelta(days=55 if k == 3 else 50), sv[k], vals[k]))
    out.sort()
    return out


def _yoy(a, b):
    if a is None or b is None:
        return None
    if b > 0:
        return a / b - 1
    return 1.0 if a > 0 else -1.0  # 前年が赤字・ゼロ：黒字ならプラス、赤字ならマイナスとして扱う


def growth(data, asof=None):
    """直近四半期と1つ前の四半期の営業利益の前年同期比などを返す。データ不足なら None。
    asof（date）を渡すと、その日までに発表済みとみなせる四半期だけを使う（過去検証用）。"""
    qs = [q for q in quarters(data) if q[3] is not None and (asof is None or q[1] <= asof)]
    if len(qs) < 5:
        return None

    def ago(q):
        return next((x for x in qs if x[0].year == q[0].year - 1 and x[0].month == q[0].month), None)

    last, prev = qs[-1], qs[-2]
    ya, yp = ago(last), ago(prev)
    return {
        "四半期末": last[0].strftime("%Y-%m"), "営業利益": last[3],
        "営業増益率": _yoy(last[3], ya[3]) if ya else None,
        "売上増収率": _yoy(last[2], ya[2]) if ya else None,
        "前四半期の営業増益率": _yoy(prev[3], yp[3]) if yp else None,
    }


def two_quarter_growth(g):
    """直近2四半期とも営業増益なら True、どちらかが減益なら False、判定できなければ None。"""
    if not g or g["営業増益率"] is None or g["前四半期の営業増益率"] is None:
        return None
    return g["営業増益率"] > 0 and g["前四半期の営業増益率"] > 0


def main():
    os.makedirs(OUT, exist_ok=True)
    codes = [c.strip() for c in open(sys.argv[1]) if c.strip()]
    todo = [c for c in codes if not os.path.exists(os.path.join(OUT, f"{c}.json"))]
    print(f"取得対象 {len(todo)} / {len(codes)}", flush=True)
    failed = 0
    for n, code in enumerate(todo, 1):
        t0 = time.time()
        try:
            fetch(code)
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  {code} 失敗 {e}", flush=True)
        if n % 200 == 0:
            print(f"  {n}/{len(todo)} 失敗{failed}", flush=True)
        time.sleep(max(0, 1.1 - (time.time() - t0)))
    print(f"完了 失敗{failed}")


if __name__ == "__main__":
    main()

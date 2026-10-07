#!/usr/bin/env python3
"""過去検証用に、IRBank の四半期業績ページ（https://irbank.net/<コード>/quarter）から
四半期ごとの売上（営業収益）と営業利益の実績を取得し、data/quarterly/<コード>.json に保存する（標準ライブラリのみ）。

使い方:
  python3 stock-analysis/fetch_quarterly.py <コード一覧ファイル>

アクセス間隔は1秒以上。保存済みの銘柄はスキップする。値は IRBank の表示どおり（兆・億など）を円に直したもので、有効数字は3桁程度。
"""

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


def main():
    os.makedirs(OUT, exist_ok=True)
    codes = [c.strip() for c in open(sys.argv[1]) if c.strip()]
    todo = [c for c in codes if not os.path.exists(os.path.join(OUT, f"{c}.json"))]
    print(f"取得対象 {len(todo)} / {len(codes)}", flush=True)
    failed = 0
    for n, code in enumerate(todo, 1):
        t0 = time.time()
        try:
            req = urllib.request.Request(URL.format(code=code), headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = parse(r.read().decode("utf-8", "replace"))
            with open(os.path.join(OUT, f"{code}.json"), "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  {code} 失敗 {e}", flush=True)
        if n % 200 == 0:
            print(f"  {n}/{len(todo)} 失敗{failed}", flush=True)
        time.sleep(max(0, 1.1 - (time.time() - t0)))
    print(f"完了 失敗{failed}")


if __name__ == "__main__":
    main()

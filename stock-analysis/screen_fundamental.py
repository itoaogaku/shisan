#!/usr/bin/env python3
"""② stage1 上位銘柄の決算取得とファンダ採点（標準ライブラリのみ）。

使い方:
  python3 stock-analysis/screen_fundamental.py [--stage1 screening/stage1_YYYYMMDD.csv] [--limit 10]

- 株探の決算ページ（https://kabutan.jp/stock/finance?code=XXXX）から
  時価総額・通期実績と会社予想・単独四半期・累計実績を取得する。
- 株探の適時開示一覧（https://kabutan.jp/stock/news?code=XXXX&nmode=3）の
  過去約15か月の表題から「継続企業の前提に関する注記」を探す。
- アクセス間隔は1秒以上。取得元URLと取得日時を記録する。
- 除外：時価総額50億円未満、今期赤字予想、継続企業の注記あり。
- fund_template.json の形式に変換して score.fundamental() で採点し、
  総合点ランキングを screening/ranking_<日付>.csv に保存する。
- 取得できなかった項目は推定せず「評価不能」のままにする。
"""

import argparse
import csv
import glob
import html
import json
import os
import re
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from score import fundamental, rank, total  # noqa: E402

SCREEN_DIR = os.path.join(HERE, "screening")
FIN_URL = "https://kabutan.jp/stock/finance?code={code}"
NEWS_URL = "https://kabutan.jp/stock/news?code={code}&nmode=3&page={page}"
INTERVAL = 1.1
MIN_CAP = 50e8
GC_LOOKBACK_DAYS = 460
ZEN = str.maketrans("０１２３４５６７８９", "0123456789")
KEYS = ("sales", "op", "ord", "net")


# ---------------------------------------------------------------- 取得

class Client:
    def __init__(self):
        self.last = 0.0

    def get(self, url):
        wait = INTERVAL - (time.time() - self.last)
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        finally:
            self.last = time.time()


# ---------------------------------------------------------------- HTML解析

def text(s):
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).replace("　", " ").strip()


def num(s):
    s = text(s).replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None  # 「－」「‐」など非開示・未定


def table_after(page, marker):
    """marker の位置から最初の <table> を [(行見出し, [セル...]), ...] で返す。"""
    i = page.find(marker) if isinstance(marker, str) else (marker.end() if marker else -1)
    if i < 0:
        return None
    m = re.search(r"<table.*?</table>", page[i:], re.S)
    if not m:
        return None
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", m.group(0), re.S):
        th = re.search(r'<th[^>]*scope="row"[^>]*>(.*?)</th>', tr, re.S)
        if th:
            rows.append((text(th.group(1)), re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)))
    return rows


def parse_cap(page):
    t = text(page)
    m = re.search(r"時価総額\s*((?:[\d,]+\s*兆\s*)?(?:[\d,]+\s*億)?)\s*円", t)
    if not m or not m.group(1).strip():
        return None
    s = m.group(1).replace(",", "").replace(" ", "")
    cho = re.search(r"(\d+)兆", s)
    oku = re.search(r"(\d+)億", s)
    return (int(cho.group(1)) * 1e12 if cho else 0) + (int(oku.group(1)) * 1e8 if oku else 0)


def period(label, short=False):
    """'2027.03' → (2027, 3)、'26.04-06' → (2026, 6)（期末の年月）。"""
    if short:
        m = re.search(r"(\d{2})\.(\d{2})-(\d{2})", label)
        if not m:
            return None
        y, m1, m2 = 2000 + int(m.group(1)), int(m.group(2)), int(m.group(3))
        return (y + 1 if m2 < m1 else y, m2)
    m = re.search(r"(\d{4})\.(\d{2})", label)
    return (int(m.group(1)), int(m.group(2))) if m else None


def months(p):
    return p[0] * 12 + p[1]


def row_vals(cells, eps=False):
    d = {k: num(cells[i]) for i, k in enumerate(KEYS)}
    if eps:
        d["eps"] = num(cells[4])
    return d


def parse_finance(page):
    """株探の決算ページから fund_template 形式の dict と、取得できなかった項目のリストを返す。"""
    missing, notes = [], []
    fund = {"annual": {}, "quarter": {}, "progress": {}}

    # 通期（業績推移）：最初の「予」行が今期予想、その直前の実績行が前期
    rows = table_after(page, '<div class="fin_year_t0_d fin_year_result_d">') or []
    fc_i = next((i for i, (lab, _) in enumerate(rows) if "予" in lab), None)
    fy_end = None
    if fc_i is None:
        missing.append("今期会社予想")
    else:
        lab, cells = rows[fc_i]
        fy_end = period(lab)
        fund["annual"]["forecast"] = row_vals(cells, eps=True)
        fund["annual"]["forecast_label"] = lab
        prev = [(lb, c) for lb, c in rows[:fc_i] if period(lb)]
        if prev and fy_end and months(fy_end) - months(period(prev[-1][0])) == 12:
            fund["annual"]["prev"] = row_vals(prev[-1][1], eps=True)
            fund["annual"]["prev_label"] = prev[-1][0]
        else:
            missing.append("前期実績（直前12か月の通期）")
        if "I" in lab.split()[0:1]:
            notes.append("IFRS：経常益は税引前利益")
        if all(v is None for v in fund["annual"]["forecast"].values()):
            missing.append("今期会社予想（非開示）")
        elif any(v is None for v in fund["annual"]["forecast"].values()):
            missing.append("今期会社予想の一部項目（非開示）")
    if not fund["annual"].get("forecast") or "prev" not in fund["annual"]:
        fund["annual"] = {}

    # 3か月決算：最新行と、1年前の同じ期間
    rows = table_after(page, '<div class="fin_quarter_t0_d fin_quarter_result_d">') or []
    qrows = [(lb, c) for lb, c in rows if period(lb, short=True)]
    q_end = None
    if qrows:
        lab, cells = qrows[-1]
        q_end = period(lab, short=True)
        ago = next(((lb, c) for lb, c in qrows if months(period(lb, short=True)) == months(q_end) - 12
                    and re.search(r"\.(\d{2})-", lb).group(1) == re.search(r"\.(\d{2})-", lab).group(1)), None)
        if ago:
            fund["quarter"] = {"label": f"{lab.split()[-1]} 単独（前年同期 {ago[0].split()[-1]}）",
                               "current": row_vals(cells), "year_ago": row_vals(ago[1]), "one_off": None}
        else:
            missing.append("前年同期の単独四半期")
    else:
        missing.append("単独四半期")

    # 累計：第N四半期累計決算の最新行。今期予想と同じ事業年度で、最新の3か月決算と期末が一致する場合だけ使う
    m = re.search(r"<h3>第([１２３123])四半期累計決算", page)
    if m and fy_end:
        qn = int(m.group(1).translate(ZEN))
        rows = table_after(page, m) or []
        crows = [(lb, c) for lb, c in rows if period(lb, short=True)]
        if crows:
            lab, cells = crows[-1]
            c_end = period(lab, short=True)
            gap = months(fy_end) - months(c_end)
            if 0 < gap < 12 and gap == 12 - qn * 3 and (q_end is None or q_end == c_end):
                v = row_vals(cells)
                fund["progress"] = {"quarter": qn, "label": lab.split()[-1],
                                    "cumulative": {"sales": v["sales"], "op": v["op"]}}
            else:
                notes.append(f"累計（{lab.split()[-1]}）が今期予想の期と一致しないため進捗率は評価不能")
    elif fy_end:
        notes.append("累計決算なし（本決算直後の可能性）")
    return fund, missing, notes


def check_gc(client, code):
    """適時開示の表題から継続企業の前提に関する注記を探す。戻り値 (状態, 該当表題リスト)。"""
    hits, oldest = [], None
    for page_no in (1, 2, 3):
        page = client.get(NEWS_URL.format(code=code, page=page_no))
        found = False
        for tr in re.findall(r"<tr>(.*?)</tr>", page, re.S):
            t = text(tr)
            m = re.match(r"(\d{2})/(\d{2})/(\d{2}) \d{2}:\d{2}", t)
            if not m:
                continue
            found = True
            d = date(2000 + int(m.group(1)), int(m.group(2)), int(m.group(3)))
            oldest = d
            if "継続企業" in t:
                hits.append(f"{d} {t[m.end():].replace('開示', '', 1).strip()}")
        if not found or (oldest and (datetime.now(JST).date() - oldest).days > GC_LOOKBACK_DAYS):
            break
    if not hits:
        return "該当表題なし", hits
    latest = hits[0]
    if "解消" in latest:
        return "解消済み", hits
    if "注記" in latest:
        return "注記あり", hits
    return "重要事象等", hits


# ---------------------------------------------------------------- メイン

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stage1", help="stage1 CSV（省略時は最新のもの）")
    ap.add_argument("--limit", type=int, help="先頭N銘柄だけ処理する（動作確認用）")
    args = ap.parse_args()

    path = args.stage1 or max(glob.glob(os.path.join(SCREEN_DIR, "stage1_*[0-9].csv")))
    with open(path, encoding="utf-8") as f:
        stage1 = list(csv.DictReader(f))
    if args.limit:
        stage1 = stage1[:args.limit]
    tag = re.search(r"stage1_(\d{8})", path).group(1)
    fund_dir = os.path.join(SCREEN_DIR, f"fund_{tag}")
    os.makedirs(fund_dir, exist_ok=True)

    client = Client()
    ranked, excluded, unknown_count = [], [], {}
    for n, s in enumerate(stage1, 1):
        code = s["コード"]
        url = FIN_URL.format(code=code)
        fetched = f"{datetime.now(JST):%Y-%m-%d %H:%M}"
        try:
            page = client.get(url)
            fund, missing, notes = parse_finance(page)
            cap = parse_cap(page)
            gc, gc_hits = check_gc(client, code)
        except Exception as e:  # noqa: BLE001
            excluded.append({"コード": code, "銘柄名": s["銘柄名"], "理由": f"取得失敗 {type(e).__name__}: {e}"})
            print(f"  {code} 取得失敗 {e}", flush=True)
            continue
        if cap is None:
            missing.append("時価総額")
        if gc == "該当表題なし":
            gc_text = "開示表題に該当なし（決算短信本文は未確認）"
        else:
            gc_text = f"{gc}：" + " / ".join(gc_hits[:3])
            if gc == "重要事象等":
                notes.append("継続企業の前提に関する重要事象等の開示あり")

        fund.update({
            "code": code, "name": s["銘柄名"],
            "source": f"株探 決算ページ {url}（取得 {fetched}）。単位：百万円（EPSは円）",
            "price": float(s["終値"]), "industry_per": None, "market_cap": cap, "going_concern": gc_text,
        })
        with open(os.path.join(fund_dir, f"{code}.json"), "w", encoding="utf-8") as f:
            json.dump(fund, f, ensure_ascii=False, indent=1)
        for k in missing:
            unknown_count[k] = unknown_count.get(k, 0) + 1

        fc = fund["annual"].get("forecast") or {}
        reasons = []
        if cap is not None and cap < MIN_CAP:
            reasons.append(f"時価総額{cap / 1e8:,.0f}億円（50億円未満）")
        if any(fc.get(k) is not None and fc[k] < 0 for k in ("op", "net")):
            reasons.append("今期赤字予想")
        if gc == "注記あり":
            reasons.append("継続企業の前提に関する注記あり")
        if reasons:
            excluded.append({"コード": code, "銘柄名": s["銘柄名"], "理由": "、".join(reasons)})
            print(f"  [{n}/{len(stage1)}] {code} 除外：{'、'.join(reasons)}", flush=True)
            continue

        res = fundamental(fund, fund["price"])
        for i in res["items"]:
            if i["score"] is None:
                k = f"評価不能：{i['name']}"
                unknown_count[k] = unknown_count.get(k, 0) + 1
        f_got, _, f_eval = total(res["items"])
        t_got = int(s["テクニカル点"])
        pts = f_got + t_got
        evaluable = f_eval + 55
        grade, label = rank(pts)
        per = res.get("per")
        ranked.append({
            "コード": code, "銘柄名": s["銘柄名"], "市場": s["市場"], "業種": s["業種"],
            "総合点": pts, "ファンダ点": f_got, "テクニカル点": t_got, "ランク": grade, "候補区分": label,
            "評価可能満点": evaluable, "得点率": round(pts / evaluable * 100, 1),
            "評価不能項目": " ".join(i["name"] for i in res["items"] if i["score"] is None),
            "時価総額_億円": round(cap / 1e8) if cap else "不明",
            "予想PER": round(per, 1) if per else "",
            "終値": s["終値"], "出来高倍率": s["出来高倍率"], "RSI": s["RSI"],
            "ファンダ内訳": " ".join(f"{i['name']}={'評価不能' if i['score'] is None else i['score']}"
                               for i in res["items"]),
            "テクニカル内訳": s["内訳"],
            "注意": " / ".join(notes + [i["note"] for i in res["items"] if i["note"]]),
            "継続企業": gc_text, "出典": fund["source"],
        })
        print(f"  [{n}/{len(stage1)}] {code} {s['銘柄名']} 総合{pts}（F{f_got} T{t_got}）", flush=True)

    ranked.sort(key=lambda r: (-r["総合点"], -r["得点率"], -float(r["出来高倍率"])))
    out = os.path.join(SCREEN_DIR, f"ranking_{tag}.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        fields = ["順位"] + (list(ranked[0].keys()) if ranked else [])
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for i, r in enumerate(ranked, 1):
            w.writerow({"順位": i, **r})
    with open(os.path.join(SCREEN_DIR, f"ranking_{tag}_log.json"), "w", encoding="utf-8") as f:
        json.dump({"stage1": os.path.basename(path), "処理銘柄数": len(stage1), "ランキング銘柄数": len(ranked),
                   "除外": excluded, "取得できなかった項目の件数": unknown_count},
                  f, ensure_ascii=False, indent=1)

    print(f"\n{out} に {len(ranked)} 銘柄を保存しました（除外 {len(excluded)}）")
    print("取得できなかった項目：" + ("、".join(f"{k} {v}件" for k, v in unknown_count.items()) or "なし"))
    for r in ranked[:10]:
        print(f"  {r['コード']} {r['銘柄名']} {r['総合点']}点（F{r['ファンダ点']} T{r['テクニカル点']}）{r['ランク']}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""過去の時点で新方式（株価の部分）を再現し、選んだ20銘柄のその後を調べる（標準ライブラリのみ）。

使い方:
  python3 stock-analysis/fetch_long.py                       # 先に5年分の日足を取得
  python3 stock-analysis/backtest_strength.py 2024-10-07 2025-10-06 [--json out.json]

各時点で、その日までの日足だけを使って次の4つを作り、3か月後（63営業日）・6か月後（126営業日）の
終値ベースの騰落率を比べる。
  新方式  強さ上位100 → 過熱（200日線+60%超・RSI80以上）を除外 → 買い時点の上位20
  強さ上位20  強さ点の上位20をそのまま
  旧方式  7項目テクニカル点の上位20（同点は出来高倍率の順）
  比較対象  売買代金1億円以上の全銘柄の平均（等金額）と、TOPIX連動ETF（1306）

再現できないもの（結果を読むときの注意）:
  - 業績（会社予想・決算）による選別。当時の会社予想のデータがないため、強い株スコアは強さ点だけで代用する。
  - 割高（予想PER40倍以上）の除外、TOB・売出し・不正の開示チェック、決算直前の「待ち」。
  - 対象は「いま上場している銘柄」だけ。途中で上場廃止になった銘柄は含まれない（成績が良く出やすい）。
"""

import argparse
import csv
import json
import math
import os
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch_prices  # noqa: E402
from score import load_prices, sma, technical, total  # noqa: E402
from screen_select import HOT_DEV200, HOT_RSI, timing  # noqa: E402
from screen_strength import MIN_BARS, MOM_DAYS  # noqa: E402

DIR = os.path.join(HERE, "data", "prices5y")
H3, H6 = 63, 126


def load_all():
    with open(os.path.join(HERE, "screening", "universe.csv"), encoding="utf-8") as f:
        uni = {r["コード"]: r for r in csv.DictReader(f)}
    data = {}
    for code in uni:
        p = os.path.join(DIR, f"{code}.csv")
        if os.path.exists(p):
            b = load_prices(p)
            if b:
                data[code] = b
    return uni, data


def split_jump(bars):
    return any(not (0.55 < bars[i]["close"] / bars[i - 1]["close"] < 1.9) for i in range(1, len(bars)))


def snapshot(date, uni, data):
    rows = []
    for code, bars in data.items():
        idx = next((i for i, b in enumerate(bars) if str(b["date"]) >= date), None)
        if idx is None or str(bars[idx]["date"]) != date:
            continue
        hist = bars[:idx + 1]
        if len(hist) < MIN_BARS or idx + H6 >= len(bars):
            continue
        if split_jump(hist[-MIN_BARS:]) or split_jump(bars[idx:idx + H6 + 1]):
            continue
        turnover = sum(b["close"] * b["volume"] for b in hist[-25:]) / 25
        if turnover < 1e8:
            continue
        cl = [b["close"] for b in hist]
        c = cl[-1]
        rows.append({
            "code": code, "name": uni[code]["銘柄名"], "hist": hist,
            "mom6": c / cl[-1 - MOM_DAYS] - 1, "high52": c / max(b["high"] for b in hist[-250:]),
            "ma200": sma(cl, 200, len(cl) - 1), "close": c,
            "r3": bars[idx + H3]["close"] / c - 1, "r6": bars[idx + H6]["close"] / c - 1,
        })
    n = len(rows)
    for key in ("mom6", "high52"):
        for r, x in enumerate(sorted(rows, key=lambda x: x[key])):
            x["strength"] = x.get("strength", 0) + r / (n - 1) * 50
    return rows


def pick(rows):
    above = sorted([x for x in rows if x["close"] > x["ma200"]], key=lambda x: -x["strength"])
    pool = above[:100]
    for x in pool:
        t = timing(x["hist"])
        x["timing"], x["dev200"], x["rsi"], x["r20"] = t["score"], t["dev200"], t["rsi"], t["r20"]
        x["hot"] = x["dev200"] > HOT_DEV200 or x["rsi"] >= HOT_RSI
    new = sorted([x for x in pool if not x["hot"]], key=lambda x: (-x["timing"], -x["strength"]))[:20]
    for x in rows:
        tech = technical(x["hist"])
        x["tech"] = total(tech["items"])[0]
        v = [b["volume"] for b in x["hist"]]
        x["vr"] = v[-1] / (sum(v[-26:-1]) / 25) if sum(v[-26:-1]) else 0
    old = sorted(rows, key=lambda x: (-x["tech"], -x["vr"]))[:20]
    return {"新方式（強さ上位100→買い時20）": new, "強さ上位20をそのまま": above[:20],
            "旧方式（7項目テクニカル点上位20）": old, "過熱で外した銘柄": [x for x in pool if x["hot"]]}


def etf(date, code="1306"):
    rows, _ = fetch_prices.download(code, "5y")
    d = [r[0] for r in rows]
    i = d.index(date)
    return rows[i + H3][4] / rows[i][4] - 1, rows[i + H6][4] / rows[i][4] - 1, rows[i + H3][0], rows[i + H6][0]


def stats(g):
    r3 = [x["r3"] for x in g]
    r6 = [x["r6"] for x in g]
    return {"n": len(g), "r3": statistics.mean(r3), "r6": statistics.mean(r6),
            "r3_med": statistics.median(r3), "r6_med": statistics.median(r6),
            "win3": sum(1 for v in r3 if v > 0), "win6": sum(1 for v in r6 if v > 0),
            "worst6": min(r6), "best6": max(r6)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dates", nargs="+")
    ap.add_argument("--json")
    args = ap.parse_args()
    uni, data = load_all()
    out = {}
    for date in args.dates:
        rows = snapshot(date, uni, data)
        groups = pick(rows)
        e3, e6, d3, d6 = etf(date)
        res = {"date": date, "d3": d3, "d6": d6, "universe": len(rows),
               "market": stats(rows), "topix": {"r3": e3, "r6": e6}, "groups": {}}
        print(f"\n===== {date}（比較対象 {len(rows)}銘柄・3か月後 {d3}・6か月後 {d6}）")
        print(f"  市場平均（等金額） 3か月 {res['market']['r3']*100:+.1f}%  6か月 {res['market']['r6']*100:+.1f}%")
        print(f"  TOPIX（1306）      3か月 {e3*100:+.1f}%  6か月 {e6*100:+.1f}%")
        for name, g in groups.items():
            if not g:
                continue
            s = stats(g)
            res["groups"][name] = {"stats": s, "stocks": [
                {k: (round(v, 4) if isinstance(v, float) else v) for k, v in x.items() if k != "hist"} for x in g]}
            print(f"  {name}: {s['n']}銘柄 3か月 平均{s['r3']*100:+.1f}%（中央値{s['r3_med']*100:+.1f}%・上昇{s['win3']}）"
                  f" 6か月 平均{s['r6']*100:+.1f}%（中央値{s['r6_med']*100:+.1f}%・上昇{s['win6']}）"
                  f" 最悪{s['worst6']*100:+.0f}% 最良{s['best6']*100:+.0f}%")
        print("  新方式の20銘柄:")
        for x in groups["新方式（強さ上位100→買い時20）"]:
            print(f"    {x['code']} {x['name'][:12]:12s} 買い時{x['timing']:>3} 強さ{x['strength']:.0f}"
                  f" → 3か月{x['r3']*100:+6.1f}% 6か月{x['r6']*100:+6.1f}%")
        out[date] = res
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1, default=str)


if __name__ == "__main__":
    main()

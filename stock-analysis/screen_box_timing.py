#!/usr/bin/env python3
"""ボックス相場銘柄の「買い時点」（0〜100）。screen_box.py の結果を、ボックス戦略
（下限付近で買い、上限付近で売る）の観点で並べ替える。過去データでの検証はしていない。

- 位置（50点）：ボックス内位置 0% で50点、70% で0点（直線）。0%未満（下抜け）や100%超（上抜け）は別枠。
- 反発の兆し（30点）：終値が5日線より上 10点／5日線が前日より上 10点／
  直近5日の安値が、その前15日の安値を下回っていない（安値更新が止まった）10点。
- 上値の余地（20点）：レジスタンスまでの上昇余地 15%以上 20点／10〜15% 12点／5〜10% 5点／5%未満 0点。
- 別枠：ボックス内位置が −3% 未満（下抜け中）、100% 超（上抜け中）、次回決算まで14日以内（待つ理由）。

使い方: python3 screen_box_timing.py <box.csv> <日足ディレクトリ> <出力csv> [--min-turnover 20] [--min-touches 3]
"""
import argparse, csv, json, os, re, sys, time, urllib.request
from datetime import date

def bars(path):
    rows = list(csv.DictReader(open(path)))
    return [(r["date"], float(r["low"]), float(r["close"])) for r in rows]

def earnings_date(code):
    req = urllib.request.Request(f"https://kabutan.jp/stock/?code={code}", headers={"User-Agent": "Mozilla/5.0"})
    page = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    m = re.search(r"決算発表予定日.{0,200}?(\d{4})/(\d{2})/(\d{2})", page, re.S)
    return date(*map(int, m.groups())) if m else None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("box"); ap.add_argument("prices"); ap.add_argument("out")
    ap.add_argument("--min-turnover", type=float, default=20); ap.add_argument("--min-touches", type=int, default=3)
    ap.add_argument("--start-before", default="2025-04-04")
    a = ap.parse_args()
    rows = [r for r in csv.DictReader(open(a.box, encoding="utf-8"))
            if float(r["turnover"]) >= a.min_turnover and int(r["touches_u"]) >= a.min_touches
            and int(r["touches_l"]) >= a.min_touches and r["start"] <= a.start_before]
    out = []
    for r in rows:
        b = bars(os.path.join(a.prices, f"{r['code']}.csv"))
        c = [x[2] for x in b]; base = date.fromisoformat(b[-1][0])
        S, R, close = float(r["S"]), float(r["R"]), c[-1]
        pos = (close - S) / (R - S) * 100
        ma5, ma5p = sum(c[-5:]) / 5, sum(c[-6:-1]) / 5
        p_pos = max(0.0, 50 * (1 - max(pos, 0) / 70))
        sig = [close > ma5, ma5 > ma5p, min(x[1] for x in b[-5:]) >= min(x[1] for x in b[-20:-5])]
        room = (R / close - 1) * 100
        p_room = 20 if room >= 15 else 12 if room >= 10 else 5 if room >= 5 else 0
        try:
            ed = earnings_date(r["code"]); time.sleep(1.1)
        except Exception:
            ed = None
        days = (ed - base).days if ed else None
        group = "下抜け中" if pos < -3 else "上抜け中" if pos > 100 else "決算待ち" if days is not None and 0 <= days <= 14 else "対象"
        out.append(dict(code=r["code"], name=r["name"], group=group, score=round(p_pos + 10 * sum(sig) + p_room, 1),
                        pos=round(pos, 1), room=round(room, 1), S=round(S), R=round(R), close=close,
                        stop=round(S * 0.97), above_ma5=sig[0], ma5_up=sig[1], no_new_low=sig[2],
                        earnings=str(ed) if ed else "不明", base=b[-1][0], turnover=r["turnover"],
                        period_m=r["period_m"], touches=f"{r['touches_u']}/{r['touches_l']}"))
    order = {"対象": 0, "決算待ち": 1, "下抜け中": 2, "上抜け中": 3}
    out.sort(key=lambda x: (order[x["group"]], -x["score"]))
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0])); w.writeheader(); w.writerows(out)
    for x in out: print(x)

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""自分の売買の成績を記録し、同じお金で投資信託を買っていた場合と比べる（標準ライブラリのみ）。

使い方:
  python3 stock-analysis/trade_tracker.py [--trades stock-analysis/private/trades.csv] [--bench sp500,acwi]

入力（private/ は .gitignore 済み。コミットされない）:
  private/trades.csv          約定日,コード,銘柄,口座,売買,数量,単価,受渡金額
                              売買は 買付・売付・入庫（他社からの移管など。単価を取得単価として扱う）。
                              受渡金額は買付なら手数料込みの支払額、売付なら手数料を引いた受取額（源泉税は含めない）。
  private/holdings_start.csv  コード,口座,数量,取得単価（記録を始める前から持っていた株。分かるものだけでよい）

計算:
  - 確定損益：口座（特定・NISAなど）と銘柄ごとに移動平均法で取得単価を出し、売却額との差を確定損益とする。
    買値が分からない株の売却は「買値不明」として別に表示し、成績と比較からは外す。
  - 含み損益：持っている株を Yahoo! Finance の最新の終値で評価する。
  - 投資信託との比較：買値が分かる売買について、買った日に同じ金額で投資信託を買い、売った日に同じ金額を
    投資信託から引き出したとみなす（同じ日・同じ金額のお金の出入り）。最後に残る投資信託の価値の差が、
    「同じお金を投資信託に入れていたら」との差になる。投資信託の代わりに同じ指数の東証上場ETFの終値を使う
    （sp500=2558 MAXIS米国株式(S&P500)、acwi=2559 MAXIS全世界株式(オール・カントリー)、topix=1306）。
    分配金は含まない（投資信託は再投資するので、実際は年1〜1.5%程度高い）。
  - 税金：特定口座の確定益には20.315%の税金がかかるとして税引き後も出す（年間の損益通算は考慮しない概算）。
    投資信託はNISA（非課税）で持つ想定。
結果は private/tracker_<日付>.md にも保存する。
"""

import argparse
import csv
import datetime as dt
import os
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch_prices  # noqa: E402
from screen_crash import clean_rows  # noqa: E402

PRIVATE = os.path.join(HERE, "private")
BENCH = {"sp500": ("2558", "S&P500"), "acwi": ("2559", "オール・カントリー"), "topix": ("1306", "TOPIX")}
TAX = 0.20315


def adjusted_series(code):
    """日足の終値を {日付: 値} で返す。1日だけの値の飛びを除き、株式分割（値が1/kのまま続く）を調整する。"""
    rows = clean_rows(fetch_prices.download(code, "5y")[0])
    closes = [r[4] for r in rows]
    for i in range(1, len(rows)):
        r = closes[i] / closes[i - 1]
        if not 0.6 < r < 1.6:
            k = round(1 / r) if r < 1 else 1 / round(r)
            for j in range(i):
                closes[j] /= k
    return {rows[i][0]: closes[i] for i in range(len(rows))}


def price_on(series, date):
    keys = [d for d in series if d <= date]
    return series[max(keys)] if keys else None


def num(s):
    s = (s or "").replace(",", "").strip()
    return float(s) if s not in ("", "-") else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--trades", default=os.path.join(PRIVATE, "trades.csv"))
    ap.add_argument("--start", default=os.path.join(PRIVATE, "holdings_start.csv"))
    ap.add_argument("--bench", default="sp500,acwi", help="比べる投資信託（sp500,acwi,topix をカンマ区切り。等分）")
    args = ap.parse_args()

    with open(args.trades, encoding="utf-8") as f:
        trades = sorted(csv.DictReader(f), key=lambda r: r["約定日"])
    pos = defaultdict(lambda: {"qty": 0.0, "cost": 0.0, "name": ""})  # (口座, コード) → 数量・取得額
    if os.path.exists(args.start):
        with open(args.start, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                p = pos[(r["口座"], r["コード"])]
                p["qty"] += num(r["数量"])
                p["cost"] += num(r["数量"]) * num(r["取得単価"])

    benches = [BENCH[b.strip()] for b in args.bench.split(",")]
    series = {code: adjusted_series(code) for code, _ in benches}
    units = defaultdict(float)  # 投資信託の口数（金額÷価格）
    realized, unknown, rows_out = [], [], []
    invested = withdrawn = 0.0

    def bench_flow(date, amount):  # amount>0：投資、<0：引き出し
        for code, _ in benches:
            units[code] += amount / len(benches) / price_on(series[code], date)

    for t in trades:
        key = (t["口座"], t["コード"])
        p = pos[key]
        p["name"] = t["銘柄"]
        qty, unit, amt = num(t["数量"]), num(t["単価"]), num(t["受渡金額"])
        if t["売買"] in ("買付", "入庫"):
            amt = amt if amt is not None else qty * unit
            p["qty"] += qty
            p["cost"] += amt
            bench_flow(t["約定日"], amt)
            invested += amt
        elif t["売買"] == "売付":
            known = min(qty, p["qty"])
            if known < qty:  # 記録より前に買った株の売却（買値不明）
                unknown.append((t["約定日"], t["銘柄"], t["口座"], qty - known, amt * (qty - known) / qty))
            if known > 0:
                avg = p["cost"] / p["qty"]
                proceeds = amt * known / qty
                gain = proceeds - avg * known
                realized.append({"date": t["約定日"], "name": t["銘柄"], "acct": t["口座"], "qty": known,
                                 "cost": avg * known, "proceeds": proceeds, "gain": gain})
                p["qty"] -= known
                p["cost"] -= avg * known
                bench_flow(t["約定日"], -proceeds)
                withdrawn += proceeds

    today = max(max(s) for s in series.values())
    holdings = []
    for (acct, code), p in pos.items():
        if p["qty"] <= 0:
            continue
        try:
            last = fetch_prices.download(code, "1mo")[0][-1]
            value = p["qty"] * last[4]
        except Exception:  # noqa: BLE001
            last, value = None, None
        holdings.append({"code": code, "name": p["name"], "acct": acct, "qty": p["qty"], "cost": p["cost"],
                         "value": value, "date": last[0] if last else "取得できず"})

    real_gain = sum(r["gain"] for r in realized)
    tax = max(0.0, sum(r["gain"] for r in realized if r["acct"] == "特定")) * TAX  # 特定口座内で損益通算した概算
    unreal = sum(h["value"] - h["cost"] for h in holdings if h["value"] is not None)
    bench_value = sum(units[code] * price_on(series[code], today) for code, _ in benches)
    bench_gain = bench_value + withdrawn - invested
    my_gain = real_gain + unreal
    bname = "＋".join(n for _, n in benches)

    L = [f"# 売買の成績（{trades[0]['約定日']}〜{today}）", "",
         f"比較：{bname}（{'等分' if len(benches) > 1 else ''}）に、同じ日に同じ金額を出し入れしていた場合。", "",
         "| | 自分の売買 | 投資信託だったら |", "|---|---|---|",
         f"| 損益（税引き前） | {my_gain:+,.0f}円 | {bench_gain:+,.0f}円 |",
         f"| 　うち確定した売買 | {real_gain:+,.0f}円 | |",
         f"| 　うち持っている株の含み損益（{len(holdings)}銘柄） | {unreal:+,.0f}円 | |",
         f"| 確定益にかかる税金（特定口座・概算） | −{tax:,.0f}円 | 0円（NISAで持つ想定） |",
         f"| 税引き後の損益 | {my_gain - tax:+,.0f}円 | {bench_gain:+,.0f}円 |",
         f"| **差** | **{my_gain - tax - bench_gain:+,.0f}円** | |", "",
         "含み損益にはまだ税金を引いていない（売って利益が出れば、そのときに税金がかかる）。", "",
         f"投資した金額の合計 {invested:,.0f}円・売って受け取った金額の合計 {withdrawn:,.0f}円", "",
         "## 確定した売買", "", "| 売却日 | 銘柄 | 口座 | 数量 | 取得額 | 売却額 | 損益 |", "|---|---|---|---|---|---|---|"]
    for r in realized:
        L.append(f"| {r['date']} | {r['name']} | {r['acct']} | {r['qty']:,.0f} | {r['cost']:,.0f} | {r['proceeds']:,.0f} | "
                 f"{r['gain']:+,.0f}（{r['gain'] / r['cost'] * 100:+.1f}%） |")
    trips = defaultdict(float)  # 同じ日・同じ銘柄・同じ口座の売却は1回の取引として数える
    for r in realized:
        trips[(r["date"], r["name"], r["acct"])] += r["gain"]
    wins = sum(1 for g in trips.values() if g > 0)
    L += ["", f"取引 {len(trips)}回：勝ち {wins} / 負け {len(trips) - wins}", "", "## 持っている株", "",
          "| 銘柄 | 口座 | 数量 | 取得額 | 評価額（日付） | 含み損益 |", "|---|---|---|---|---|---|"]
    for h in sorted(holdings, key=lambda h: h["code"]):
        v = f"{h['value']:,.0f}（{h['date']}）" if h["value"] is not None else "取得できず"
        g = f"{h['value'] - h['cost']:+,.0f}（{(h['value'] / h['cost'] - 1) * 100:+.1f}%）" if h["value"] is not None else "-"
        L.append(f"| {h['name']} | {h['acct']} | {h['qty']:,.0f} | {h['cost']:,.0f} | {v} | {g} |")
    if unknown:
        L += ["", "## 買値不明の売却（成績と比較から除外）", "",
              "記録より前に買った株。holdings_start.csv に取得単価を書くと計算に入る。", "",
              "| 売却日 | 銘柄 | 口座 | 数量 | 売却額 |", "|---|---|---|---|---|"]
        for d, n, a, q, v in unknown:
            L.append(f"| {d} | {n} | {a} | {q:,.0f} | {v:,.0f} |")
    L += ["", "注：投資信託は同じ指数の東証上場ETFの終値で代用し、分配金は含まない。税金は年間の損益通算を考えない概算。"]
    out = os.path.join(PRIVATE, f"tracker_{today.replace('-', '')}.md")
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print("\n".join(L))
    print(f"\n→ {out} に保存しました（コミットされません）")


if __name__ == "__main__":
    main()

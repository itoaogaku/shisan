#!/usr/bin/env python3
"""運用ルール全体のシミュレーション（過去検証・標準ライブラリのみ）。

使い方: python3 stock-analysis/backtest_portfolio.py 2024-01-04 [--capital 3000000]
先に fetch_long.py（5年分の日足）と fetch_quarterly.py（四半期業績）を実行しておく。

ルール（reports/backtest_20261006.md と SCREENING_PLAN.md の運用の目安）:
  - 資金の2/3を通常の運用、1/3を暴落用の現金にする。
  - 通常の運用は6等分し、21営業日ごとに1回分ずつ、その日の新方式の20銘柄（強さ上位→業績フィルター→
    上位100→過熱を除外→買い時点の上位20）を等金額で買う。各回は126営業日（約6か月）後に売り、
    その代金でその日の20銘柄を買い直す。
  - 暴落（TOPIX連動ETF 1306 が60営業日高値から−10%以下、前回から120営業日以上あける）の日に、
    暴落用の現金で20営業日前の強い株上位20（業績フィルター適用）を買い、126営業日後に売って現金に戻す。
再現できないもの：業績の点数（当時の会社予想）、割高（PER）の除外、TOB・決算前・売出しの確認。
手数料・税金・配当は含めない。端数株も買える前提。対象はいま上場している銘柄だけ（成績はやや良く出やすい）。
"""

import argparse
import datetime as dt
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch_prices  # noqa: E402
import fetch_quarterly  # noqa: E402
from backtest_strength import load_all, split_jump  # noqa: E402
from score import sma  # noqa: E402
from screen_select import HOT_DEV200, HOT_RSI, timing  # noqa: E402

HOLD, STEP, TRANCHES = 126, 21, 6

uni, data = load_all()
idx = {c: {str(x["date"]): i for i, x in enumerate(b)} for c, b in data.items()}
QCACHE = {}


def growth_ok(code, date):
    if code not in QCACHE:
        p = os.path.join(fetch_quarterly.OUT, f"{code}.json")
        QCACHE[code] = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None
    d = QCACHE[code]
    if d is None:
        return True
    return fetch_quarterly.two_quarter_growth(fetch_quarterly.growth(d, dt.date.fromisoformat(date))) is not False


def ranked(date):
    rows = []
    for c, b in data.items():
        i = idx[c].get(date)
        if i is None or i < 260:
            continue
        h = b[:i + 1]
        if sum(x["close"] * x["volume"] for x in h[-25:]) / 25 < 1e8 or split_jump(h[-260:]):
            continue
        cl = [x["close"] for x in h]
        rows.append({"c": c, "h": h, "mom6": cl[-1] / cl[-127] - 1,
                     "high52": cl[-1] / max(x["high"] for x in h[-250:]), "above": cl[-1] > sma(cl, 200, len(cl) - 1)})
    n = len(rows)
    for k in ("mom6", "high52"):
        for r, x in enumerate(sorted(rows, key=lambda x: x[k])):
            x["s"] = x.get("s", 0) + r / (n - 1)
    return [x for x in sorted(rows, key=lambda x: -x["s"]) if x["above"] and growth_ok(x["c"], date)]


def normal_picks(date):
    pool = ranked(date)[:100]
    for x in pool:
        t = timing(x["h"])
        x["t"], x["hot"] = t["score"], t["dev200"] > HOT_DEV200 or t["rsi"] >= HOT_RSI
    return [x["c"] for x in sorted([x for x in pool if not x["hot"]], key=lambda x: (-x["t"], -x["s"]))[:20]]


def price(c, date):
    i = idx[c].get(date)
    if i is None:  # その日に値がなければ直前の終値
        b = data[c]
        prev = [k for k, x in enumerate(b) if str(x["date"]) <= date]
        return b[prev[-1]]["close"] if prev else None
    return data[c][i]["close"]


def value(pos, date):
    return sum(sh * (price(c, date) or 0) for c, sh in pos.items())


def buy(codes, amount, date):
    per = amount / len(codes)
    return {c: per / price(c, date) for c in codes}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("start")
    ap.add_argument("--capital", type=float, default=3_000_000)
    args = ap.parse_args()

    dates = [str(b["date"]) for b in data["7203"]]
    dates = [d for d in dates if d >= args.start]
    from screen_crash import topix_rows
    tp = topix_rows()
    tpd = {r[0]: k for k, r in enumerate(tp)}
    tpc = [r[4] for r in tp]
    all_dates = [str(b["date"]) for b in data["7203"]]

    normal_cash = args.capital * 2 / 3
    reserve = args.capital / 3
    tranches = []          # [{"pos":..., "sell": index}]
    crash_pos, crash_sell, last_crash = None, None, -999
    log, curve = [], []
    unit = normal_cash / TRANCHES

    for k, d in enumerate(dates):
        # 満期の売却
        for t in [t for t in tranches if t["sell"] == k]:
            normal_cash += value(t["pos"], d)
            tranches.remove(t)
        if crash_pos is not None and crash_sell == k:
            v = value(crash_pos, d)
            log.append(f"{d} 暴落用の20銘柄を売却 → {v:,.0f}円を現金に戻す")
            reserve += v
            crash_pos = None
        # 通常の購入（21営業日ごと）
        if k % STEP == 0:
            amt = unit if len(tranches) + 0 < TRANCHES and k < STEP * TRANCHES else normal_cash
            amt = min(amt, normal_cash)
            if amt > 1:
                codes = normal_picks(d)
                tranches.append({"pos": buy(codes, amt, d), "sell": k + HOLD, "date": d})
                normal_cash -= amt
                log.append(f"{d} 通常：{amt:,.0f}円で20銘柄を購入（例 {', '.join(codes[:3])}）")
        # 暴落の判定
        ti = tpd.get(d)
        if ti is not None and ti >= 60 and crash_pos is None and k - last_crash > 120:
            hi = max(tpc[ti - 60:ti + 1])
            if tpc[ti] / hi - 1 <= -0.10 and reserve > 1:
                pre = all_dates[all_dates.index(d) - 20]
                codes = [x["c"] for x in ranked(pre) if idx[x["c"]].get(d) is not None][:20]
                crash_pos, crash_sell, last_crash = buy(codes, reserve, d), k + HOLD, k
                log.append(f"{d} 暴落（TOPIX 60日高値から{(tpc[ti] / hi - 1) * 100:.1f}%）：暴落用の{reserve:,.0f}円で暴落前の強い株20銘柄を購入")
                reserve = 0
        if k % 5 == 0 or k == len(dates) - 1:
            total = normal_cash + reserve + sum(value(t["pos"], d) for t in tranches) + (value(crash_pos, d) if crash_pos else 0)
            curve.append((d, total, tpc[ti] if ti is not None else None))

    t0 = tpc[tpd[dates[0]]]
    print(f"開始 {dates[0]}・資金 {args.capital:,.0f}円 → 最終 {curve[-1][0]}")
    for line in log:
        print("  " + line)
    print("\n日付        この運用        TOPIXに全額")
    peak, mdd, tpeak, tmdd = 0, 0, 0, 0
    for d, v, t in curve:
        tv = args.capital * t / t0 if t else None
        peak, tpeak = max(peak, v), max(tpeak, tv or 0)
        mdd, tmdd = min(mdd, v / peak - 1), min(tmdd, (tv / tpeak - 1) if tv else 0)
    for d, v, t in curve[::13] + [curve[-1]]:
        print(f"{d}  {v:>12,.0f}円  {args.capital * t / t0:>12,.0f}円")
    v, t = curve[-1][1], args.capital * curve[-1][2] / t0
    print(f"\n最終：この運用 {v:,.0f}円（{(v / args.capital - 1) * 100:+.1f}%）／TOPIXに全額 {t:,.0f}円（{(t / args.capital - 1) * 100:+.1f}%）")
    print(f"途中の最大の落ち込み：この運用 {mdd * 100:.1f}%／TOPIX {tmdd * 100:.1f}%")


if __name__ == "__main__":
    main()

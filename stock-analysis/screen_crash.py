#!/usr/bin/env python3
"""暴落時ルール：相場全体が暴落したら、暴落前の強い株を一覧にする（標準ライブラリのみ）。

使い方:
  python3 stock-analysis/screen_crash.py                    # いまの相場を判定（日足は screen_strength.py で最新にしておく）
  python3 stock-analysis/screen_crash.py --force            # 暴落でなくても一覧を作る（確認用）
  python3 stock-analysis/screen_crash.py --asof 2025-04-04 --price-dir stock-analysis/data/prices5y   # 過去の再現

■ 暴落の判定
  TOPIX連動ETF（1306）の終値が、直近60営業日の最高値から −10% 以下なら「暴落」。
■ 暴落時の一覧（暴落前の強い株）
  暴落の判定日の20営業日前の時点で、screen_strength.py と同じ強さ点（6か月の上昇率と52週高値への近さ）で
  200日線の上・売買代金1億円以上の銘柄を順位付けし、上位から業績フィルター（直近2四半期とも営業増益。データがなければ残す）を
  通った20銘柄を出す。暴落中の下げ率と、TOPIXより大きく下げた銘柄（個別の悪材料の可能性）も表示する。
  最新の判定では、株探の開示表題で TOB・上場廃止・売出し・不正の開示も確認する（--asof のときは行わない）。
■ 検証（backtest_crash.py、reports/backtest_20261006.md の「7.」）
  2022-10〜2026-03の暴落3回（判定日と翌営業日の5回）で、暴落前の強い株上位20を買うと、6か月後の平均は
  +27.4%（TOPIXは+23.5%）。暴落日に通常の方式（買い時点で選ぶ）で選ぶと+14.0%で、暴落直後には向かない。
  一方、相場が普通なのに個別株だけが高値から−30%以上下げた場合は、6か月後に市場を9%下回った（買わない）。
  暴落は3回だけで、いずれも数か月で回復した急落。長く続く下落相場では、早く買いすぎて損が膨らむおそれがある。
売買の推奨ではない。結果は screening/crash_<日付>.csv。
"""

import argparse
import csv
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch_prices  # noqa: E402
import fetch_quarterly  # noqa: E402
from score import load_prices, sma  # noqa: E402

SCREEN_DIR = os.path.join(HERE, "screening")
TOPIX = "1306"
LOOKBACK = 60      # 暴落判定に使う高値の期間（営業日）
CRASH = -0.10      # 暴落とみなす下落率
PRE = 20           # 暴落前とみなす日数（営業日）
TOP = 20


def market_status(asof=None):
    """TOPIX連動ETFの直近60営業日高値からの下落率を返す。"""
    rows, _ = fetch_prices.download(TOPIX, "5y" if asof else "1y")
    if asof:
        rows = [r for r in rows if r[0] <= asof]
    closes = [r[4] for r in rows]
    hi = max(closes[-LOOKBACK:])
    hi_date = rows[len(rows) - LOOKBACK + closes[-LOOKBACK:].index(hi)][0]
    dd = closes[-1] / hi - 1
    return {"date": rows[-1][0], "close": closes[-1], "high": hi, "high_date": hi_date, "drawdown": dd,
            "crash": dd <= CRASH, "ma200": sma(closes, 200, len(closes) - 1) if len(closes) >= 200 else None}


def strength_ranking(price_dir, universe, date):
    """date の時点での強さ点ランキング（200日線の上・売買代金1億円以上）。"""
    rows = []
    for u in universe:
        p = os.path.join(price_dir, f"{u['コード']}.csv")
        if not os.path.exists(p):
            continue
        bars = load_prices(p)
        i = next((k for k in range(len(bars) - 1, -1, -1) if str(bars[k]["date"]) <= date), None)
        if i is None or i < 260:
            continue
        h = bars[:i + 1]
        if any(not (0.55 < h[k]["close"] / h[k - 1]["close"] < 1.9) for k in range(len(h) - 260, len(h))):
            continue
        if sum(b["close"] * b["volume"] for b in h[-25:]) / 25 < 1e8:
            continue
        cl = [b["close"] for b in h]
        rows.append({"u": u, "bars": bars, "i": i, "mom6": cl[-1] / cl[-127] - 1,
                     "high52": cl[-1] / max(b["high"] for b in h[-250:]), "above": cl[-1] > sma(cl, 200, len(cl) - 1)})
    n = len(rows)
    for key in ("mom6", "high52"):
        for r, x in enumerate(sorted(rows, key=lambda x: x[key])):
            x["s"] = x.get("s", 0) + r / (n - 1) * 50
    return sorted([x for x in rows if x["above"]], key=lambda x: -x["s"])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--asof", help="判定日 YYYY-MM-DD（過去の再現用。省略時は最新）")
    ap.add_argument("--price-dir", default=os.path.join(HERE, "data", "prices"), help="日足のフォルダ")
    ap.add_argument("--force", action="store_true", help="暴落でなくても一覧を作る")
    args = ap.parse_args()

    m = market_status(args.asof)
    print(f"TOPIX連動ETF（{TOPIX}） {m['date']} 終値{m['close']:,.1f} / 直近{LOOKBACK}営業日の高値{m['high']:,.1f}（{m['high_date']}）"
          f" / 下落率{m['drawdown'] * 100:+.1f}%（暴落の目安 {CRASH * 100:.0f}%）")
    if m["ma200"]:
        print(f"  200日線{m['ma200']:,.1f}（{'上' if m['close'] > m['ma200'] else '下'}）")
    if not m["crash"] and not args.force:
        print("→ 暴落ではありません。通常の方式（screen_select.py）を使います。")
        return
    print("→ 暴落です。暴落前の強い株を一覧にします。" if m["crash"] else "→ 確認用（--force）に一覧を作ります。")

    with open(os.path.join(SCREEN_DIR, "universe.csv"), encoding="utf-8") as f:
        universe = list(csv.DictReader(f))
    ref = load_prices(os.path.join(args.price_dir, "7203.csv"))
    dates = [str(b["date"]) for b in ref if str(b["date"]) <= m["date"]]
    if dates[-1] != m["date"]:
        print(f"  ⚠ 日足が {dates[-1]} までしかありません（TOPIXは {m['date']}）。screen_strength.py で更新してください。")
    pre = dates[-1 - PRE]
    ranking = strength_ranking(args.price_dir, universe, pre)
    print(f"  暴落前の基準日 {pre}（{PRE}営業日前）・強さ点の対象 {len(ranking)}銘柄")

    topix_rows, _ = fetch_prices.download(TOPIX, "5y")
    tmap = {r[0]: r[4] for r in topix_rows}
    t_drop = tmap[m["date"]] / tmap[pre] - 1 if pre in tmap and m["date"] in tmap else None

    picks, dropped, last = [], [], 0.0
    live = args.asof is None
    for x in ranking:
        if len(picks) >= TOP:
            break
        code = x["u"]["コード"]
        g = None
        try:
            if live:
                data, fetched = fetch_quarterly.load(code)
                if fetched:
                    time.sleep(max(0, 1.1 - (time.time() - last)))
                    last = time.time()
                g = fetch_quarterly.growth(data)
            else:
                path = os.path.join(fetch_quarterly.OUT, f"{code}.json")
                if os.path.exists(path):
                    import datetime as dt
                    import json
                    with open(path, encoding="utf-8") as f:
                        g = fetch_quarterly.growth(json.load(f), dt.date.fromisoformat(m["date"]))
        except Exception:  # noqa: BLE001
            g = None
        if fetch_quarterly.two_quarter_growth(g) is False:
            dropped.append(code)
            continue
        bars = x["bars"]
        j = next(k for k in range(len(bars) - 1, -1, -1) if str(bars[k]["date"]) <= m["date"])
        drop = bars[j]["close"] / bars[x["i"]]["close"] - 1
        note = ""
        if t_drop is not None and drop <= -0.30 and drop < t_drop * 2:
            note = "TOPIXより大きく下落：個別の悪材料がないか確認"
        picks.append({"順位": len(picks) + 1, "コード": code, "銘柄名": x["u"]["銘柄名"], "業種": x["u"]["業種"],
                      "暴落前の強さ点": round(x["s"], 1), "暴落中の下げ率%": round(drop * 100, 1),
                      "終値": bars[j]["close"], "業績判定": "不明" if g is None else "2四半期連続増益",
                      "注意": note})

    if live:
        from screen_fundamental import Client
        from screen_select import disclosure_events
        import datetime as dt
        client, today = Client(), dt.date.today()
        for p in picks:
            try:
                ev = disclosure_events(client, p["コード"], today)
                if ev:
                    p["注意"] = " / ".join(x for x in [p["注意"]] + [msg for _, msg in ev] if x)
            except Exception:  # noqa: BLE001
                pass

    tag = m["date"].replace("-", "")
    out = os.path.join(SCREEN_DIR, f"crash_{tag}.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(picks[0].keys()))
        w.writeheader()
        w.writerows(picks)
    print(f"\n{out} に保存しました（業績フィルターで外した {len(dropped)}銘柄）。TOPIXの同じ期間の下げ率 "
          f"{t_drop * 100:+.1f}%" if t_drop is not None else "")
    print("■ 暴落前の強い株（暴落前の強さ点の順）")
    for p in picks:
        print(f"  {p['順位']:>2} {p['コード']} {p['銘柄名']} 強さ{p['暴落前の強さ点']} 暴落中{p['暴落中の下げ率%']:+}% {p['注意']}")


if __name__ == "__main__":
    main()

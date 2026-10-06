#!/usr/bin/env python3
"""新方式の20銘柄を、各20万円ずつ買った場合の3か月後・6か月後の資産を計算する（標準ライブラリのみ）。

使い方:
  python3 stock-analysis/backtest_stop.py 2024-10-07 2025-10-06

- 銘柄の選び方は backtest_strength.py の新方式（強さ上位100→過熱を除外→買い時点の上位20）。
- 買い：形成日の終値で、1銘柄20万円ずつ（端数株も買える前提。単元株の制約は考えない）。
- 売りルール：終値が200日線を下回ったら、翌営業日の始値で全部売り、その後は現金で持つ（買い直さない）。
- 比較：売りルールなしでそのまま持ち続けた場合。
- 手数料・税金・配当・貸株料は考えない。
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from backtest_strength import H3, H6, load_all, pick, snapshot  # noqa: E402
from score import sma  # noqa: E402

AMOUNT = 200_000


def simulate(bars, i0, horizon):
    """i0 の終値で買い、i0+horizon 時点の評価額と、売った日・理由を返す。"""
    closes = [b["close"] for b in bars]
    shares = AMOUNT / closes[i0]
    for i in range(i0 + 1, i0 + horizon + 1):
        if closes[i] < sma(closes, 200, i) and i + 1 <= i0 + horizon:
            price = bars[i + 1]["open"]
            return shares * price, str(bars[i + 1]["date"]), price / closes[i0] - 1
    return shares * closes[i0 + horizon], None, None


def main():
    uni, data = load_all()
    for date in sys.argv[1:]:
        rows = snapshot(date, uni, data)
        new = pick(rows)["新方式（強さ上位100→買い時20）"]
        print(f"\n===== {date} に20銘柄 × 20万円 = 400万円")
        tot = {"hold3": 0, "hold6": 0, "stop3": 0, "stop6": 0}
        lines = []
        for x in new:
            bars = data[x["code"]]
            i0 = next(i for i, b in enumerate(bars) if str(b["date"]) == date)
            h3 = AMOUNT * (1 + x["r3"])
            h6 = AMOUNT * (1 + x["r6"])
            s3, d3, _ = simulate(bars, i0, H3)
            s6, d6, r = simulate(bars, i0, H6)
            for k, v in (("hold3", h3), ("hold6", h6), ("stop3", s3), ("stop6", s6)):
                tot[k] += v
            lines.append((x, h3, h6, s3, s6, d6, r))
        print(f"{'銘柄':16s} {'持ち続け3か月':>10s} {'ルール3か月':>10s} {'持ち続け6か月':>10s} {'ルール6か月':>10s}  売った日（売値の損益）")
        for x, h3, h6, s3, s6, d6, r in lines:
            sold = f"{d6}（{r * 100:+.1f}%）" if d6 else "売らずに保有"
            print(f"{x['code']} {x['name'][:10]:10s} {h3:>12,.0f} {s3:>12,.0f} {h6:>12,.0f} {s6:>12,.0f}  {sold}")
        print(f"{'合計':16s} {tot['hold3']:>12,.0f} {tot['stop3']:>12,.0f} {tot['hold6']:>12,.0f} {tot['stop6']:>12,.0f}")
        sold = sum(1 for *_, d6, _ in lines if d6)
        print(f"6か月の間にルールで売った銘柄：{sold}/20")


if __name__ == "__main__":
    main()

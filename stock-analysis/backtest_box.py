#!/usr/bin/env python3
"""ボックス相場の「下限で買う」ルールに業績チェックを足すと成績が変わるかを、過去データで比べる。

- 各月初（2024-10〜2026-07）に、その日までの株価だけで screen_box.analyze() を実行し、
  ボックス内位置が −3〜35% の銘柄を「下限の買いシグナル」とする（売買代金は当時の60日平均）。
- 63営業日後（約3か月）の騰落率から、TOPIX連動ETF（1306）の騰落率を引いた値（超過リターン）と、
  その間にサポート×0.97を終値で割り込んだ割合（ボックス下抜け率）を比べる。
- 業績は IRBank の四半期実績（fetch_quarterly.py）を、四半期末から50日（第4四半期は55日）後に発表済みとみなして使う。
  当時の会社予想・PERは手元にないため検証できない。

使い方: python3 backtest_box.py <日足ディレクトリ(3年)> [--min-turnover 10]
"""
import argparse, csv, glob, os, statistics, sys, datetime as dt
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from screen_box import load, analyze
from fetch_quarterly import load as qload, growth

def fwd(bars, i, n=63):
    return bars[i + n][3] / bars[i][3] - 1 if i + n < len(bars) else None

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("prices"); ap.add_argument("--min-turnover", type=float, default=10)
    ap.add_argument("--fetch", action="store_true", help="シグナル銘柄の四半期業績を IRBank から取得する")
    a = ap.parse_args()
    data = {os.path.basename(p)[:-4]: load(p) for p in glob.glob(os.path.join(a.prices, "*.csv"))}
    topix = data.pop("1306")
    tdates = [b[0] for b in topix]
    months = sorted({d[:7] for d in tdates if "2024-10" <= d[:7] <= "2026-07"})
    starts = [next(d for d in tdates if d[:7] == m) for m in months]
    sig = []
    for d0 in starts:
        ti = tdates.index(d0); tr = fwd(topix, ti)
        if tr is None: continue
        for code, bars in data.items():
            idx = {b[0]: k for k, b in enumerate(bars)}
            if d0 not in idx: continue
            i = idx[d0]; past = bars[:i + 1]
            if len(past) < 370: continue
            if any(abs(past[k][3] / past[k-1][3] - 1) > 0.45 for k in range(1, len(past))): continue
            tv = statistics.mean(b[3] * b[4] for b in past[-60:]) / 1e8
            if tv < a.min_turnover: continue
            r = analyze(past)
            if not r or not (-3 <= r["pos"] <= 35) or r["touches_u"] < 2 or r["touches_l"] < 2: continue
            f = fwd(bars, i)
            if f is None: continue
            brk = any(b[3] < r["S"] * 0.97 for b in bars[i + 1:i + 64])
            sig.append(dict(d0=d0, code=code, ex=f - tr, brk=brk, pos=r["pos"]))
    print("シグナル数", len(sig), "銘柄数", len({s["code"] for s in sig}), "時点数", len({s["d0"] for s in sig}))
    if a.fetch:
        import time
        for c in sorted({s["code"] for s in sig}):
            try: qload(c, max_age_days=30)
            except Exception as e: print("fail", c, e)
    for s in sig:
        try: g = growth(qload(s["code"], max_age_days=10**6)[0], asof=dt.date.fromisoformat(s["d0"]))
        except Exception: g = None
        s["g"] = g
    def rows(name, keep):
        xs = [s for s in sig if keep(s)]
        if not xs: return
        ex = [s["ex"] for s in xs]
        by = {}
        for s in xs: by.setdefault(s["d0"], []).append(s["ex"])
        wins = sum(1 for v in by.values() if statistics.mean(v) > 0)
        print(f"{name:<34} 件数{len(xs):>5}  超過平均{statistics.mean(ex)*100:+6.2f}%  中央値{statistics.median(ex)*100:+6.2f}%  "
              f"−10%以下の割合{sum(1 for e in ex if e <= -0.10)/len(ex)*100:5.1f}%  下抜け率{sum(s['brk'] for s in xs)/len(xs)*100:5.1f}%  "
              f"時点別プラス{wins}/{len(by)}")
    G = lambda s: s["g"]
    rows("A 業績を見ない", lambda s: True)
    rows("  （業績データあり）", lambda s: G(s) is not None)
    rows("B 直近Q営業黒字かつ−10%超の減益なし", lambda s: G(s) and G(s)["営業利益"] > 0 and (G(s)["営業増益率"] is None or G(s)["営業増益率"] > -0.10))
    rows("C 直近2Qの片方以上が営業増益", lambda s: G(s) and ((G(s)["営業増益率"] or 0) > 0 or (G(s)["前四半期の営業増益率"] or 0) > 0))
    rows("D 直近2Qとも営業増益", lambda s: G(s) and (G(s)["営業増益率"] or -1) > 0 and (G(s)["前四半期の営業増益率"] or -1) > 0)
    rows("E B かつ 増収", lambda s: G(s) and G(s)["営業利益"] > 0 and (G(s)["営業増益率"] or 0) > -0.10 and (G(s)["売上増収率"] or 0) > 0)
    rows("× 外れたもの：Bで外れる", lambda s: G(s) and not (G(s)["営業利益"] > 0 and (G(s)["営業増益率"] is None or G(s)["営業増益率"] > -0.10)))
    rows("× 外れたもの：Cで外れる", lambda s: G(s) and not ((G(s)["営業増益率"] or 0) > 0 or (G(s)["前四半期の営業増益率"] or 0) > 0))

if __name__ == "__main__":
    main()

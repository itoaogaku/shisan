#!/usr/bin/env python3
"""① 株価の強さで絞り込む（新方式・標準ライブラリのみ）。

使い方:
  python3 stock-analysis/screen_strength.py [--top 300] [--no-fetch] [--limit 10]

- universe.csv の全銘柄の日足を screen_technical.py と同じ方法で取得する（最新営業日まで保存済みならスキップ）。
- 強さ点 = 6か月（126営業日）の上昇率の順位 と 52週高値への近さの順位 の平均（0〜100）。
  比べる相手は、売買代金1億円以上・日足260本以上の銘柄。
- 終値が200日線より上の銘柄だけを残し、強さ点の上位 --top 銘柄を screening/strength_<日付>.csv に保存する。
- 1週間前（5営業日前）の時点でも上位 --top に入っていた銘柄には「継続」を付ける（1日だけの急騰と区別するため）。
- 日足に前日比 −45%以下・+90%以上の動きがある銘柄は、株式分割の調整漏れの可能性があるため除外し、ログに残す。
- 7項目のテクニカル点（score.technical）は買い時の判断用に計算して一緒に保存する（選別には使わない）。

過去1年の検証（2025-10〜2026-06、1か月おき8時点）では、6か月の上昇率の上位10%は3か月後に全体平均を
+3.2%上回り（8回中6回）、旧方式の7項目テクニカル点の上位10%は+0.3%（8回中3回）だった。
"""

import argparse
import csv
import json
import os
import sys
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from score import load_prices, sma, technical, total  # noqa: E402
from screen_technical import (PRICE_DIR, REFERENCE, SCREEN_DIR, Fetcher, fetch_all,  # noqa: E402
                              last_date, load_universe, volume_ratio)

JST = timezone(timedelta(hours=9))
MIN_TURNOVER = 1e8
MIN_BARS = 260
MOM_DAYS = 126
LAG = 5  # 継続判定に使う日数（1週間前）


def split_suspect(bars):
    return any(not (0.55 < bars[i]["close"] / bars[i - 1]["close"] < 1.9) for i in range(1, len(bars)))


def measures(bars):
    """bars の最終日時点の指標。条件を満たさなければ None。"""
    if len(bars) < MIN_BARS:
        return None
    turnover = sum(b["close"] * b["volume"] for b in bars[-25:]) / 25
    if turnover < MIN_TURNOVER:
        return None
    closes = [b["close"] for b in bars]
    c = closes[-1]
    return {
        "mom6": c / closes[-1 - MOM_DAYS] - 1,
        "high52": c / max(b["high"] for b in bars[-250:]),
        "ma200": sma(closes, 200, len(closes) - 1),
        "close": c,
        "turnover": turnover,
    }


def rank_strength(rows):
    """rows: [(code, measures)] → {code: 強さ点(0〜100)}"""
    n = len(rows)
    out = {c: 0.0 for c, _ in rows}
    for key in ("mom6", "high52"):
        for r, (c, _) in enumerate(sorted(rows, key=lambda x: x[1][key])):
            out[c] += r / (n - 1) * 50 if n > 1 else 25
    return out


def top_codes(rows, strength, n):
    above = [(c, m) for c, m in rows if m["close"] > m["ma200"]]
    return [c for c, _ in sorted(above, key=lambda x: -strength[x[0]])][:n]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--top", type=int, default=300, help="残す銘柄数（既定300）")
    ap.add_argument("--no-fetch", action="store_true", help="取得せず保存済みの日足だけで計算する")
    ap.add_argument("--limit", type=int, help="先頭N銘柄だけ処理する（動作確認用）")
    args = ap.parse_args()

    universe = load_universe()
    if args.limit:
        universe = universe[:args.limit]
    info = {u["コード"]: u for u in universe}
    started = datetime.now(JST)
    failed = {}
    if args.no_fetch:
        latest = last_date(os.path.join(PRICE_DIR, f"{REFERENCE}.csv"))
    else:
        latest, failed = fetch_all(list(info), Fetcher())

    bars_by, excluded = {}, {"取得失敗": [], "最新日の日足なし": [], "分割調整漏れの疑い": []}
    for code in info:
        path = os.path.join(PRICE_DIR, f"{code}.csv")
        if code in failed or not os.path.exists(path):
            excluded["取得失敗"].append(code)
            continue
        bars = load_prices(path)
        if not bars or str(bars[-1]["date"]) != latest:
            excluded["最新日の日足なし"].append(code)
            continue
        if split_suspect(bars[-MIN_BARS:]):
            excluded["分割調整漏れの疑い"].append(code)
            continue
        bars_by[code] = bars

    now_rows = [(c, m) for c, b in bars_by.items() if (m := measures(b))]
    lag_rows = [(c, m) for c, b in bars_by.items() if len(b) > LAG and (m := measures(b[:-LAG]))]
    strength = rank_strength(now_rows)
    strength_lag = rank_strength(lag_rows)
    top = top_codes(now_rows, strength, args.top)
    top_lag = set(top_codes(lag_rows, strength_lag, args.top))
    meas = dict(now_rows)

    out_rows = []
    for n, code in enumerate(top, 1):
        bars, m = bars_by[code], meas[code]
        tech = technical(bars)
        got, _, _ = total(tech["items"])
        u = info[code]
        out_rows.append({
            "順位": n, "コード": code, "銘柄名": u["銘柄名"], "市場": u["市場"], "業種": u["業種"],
            "強さ点": round(strength[code], 1), "継続": "○" if code in top_lag else "",
            "6か月上昇率%": round(m["mom6"] * 100, 1), "52週高値比%": round((m["high52"] - 1) * 100, 1),
            "200日線乖離%": round((m["close"] / m["ma200"] - 1) * 100, 1),
            "テクニカル点": got, "出来高倍率": round(volume_ratio(bars) or 0, 2), "終値": m["close"],
            "25日平均売買代金_億円": round(m["turnover"] / 1e8, 2),
            "RSI": round(tech["rsi"], 1) if tech["rsi"] is not None else "",
            "内訳": " ".join(f"{i['name']}={i['score']}" for i in tech["items"]), "基準日": latest,
        })

    tag = latest.replace("-", "")
    os.makedirs(SCREEN_DIR, exist_ok=True)
    out = os.path.join(SCREEN_DIR, f"strength_{tag}.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out_rows[0].keys()))
        w.writeheader()
        w.writerows(out_rows)
    log = {
        "取得開始": f"{started:%Y-%m-%d %H:%M}", "終了": f"{datetime.now(JST):%Y-%m-%d %H:%M}",
        "出典": "Yahoo! Finance chart API（range=2y, interval=1d）", "データ基準日": latest,
        "対象銘柄数": len(info), "比較対象（売買代金1億円以上・日足260本以上）": len(now_rows),
        "200日線の上": sum(1 for _, m in now_rows if m["close"] > m["ma200"]), "残した銘柄数": len(top),
        "継続（1週間前も上位）": sum(1 for r in out_rows if r["継続"]),
        "除外件数": {k: len(v) for k, v in excluded.items()}, "除外銘柄": excluded, "取得失敗": failed,
    }
    with open(os.path.join(SCREEN_DIR, f"strength_{tag}_log.json"), "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=1)

    print(f"{out} に {len(top)} 銘柄を保存しました（比較対象 {len(now_rows)}・継続 {log['継続（1週間前も上位）']}）")
    print("除外：" + "、".join(f"{k}{len(v)}" for k, v in excluded.items()))
    for r in out_rows[:10]:
        print(f"  {r['コード']} {r['銘柄名']} 強さ{r['強さ点']} 6か月{r['6か月上昇率%']:+}% 高値比{r['52週高値比%']}% {r['継続']}")


if __name__ == "__main__":
    main()

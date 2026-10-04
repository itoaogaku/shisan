#!/usr/bin/env python3
"""① 全銘柄の日足取得とテクニカル採点（標準ライブラリのみ）。

使い方:
  python3 stock-analysis/screen_technical.py [--limit 10] [--top 150] [--no-fetch]

- universe.csv の全銘柄の日足（2年分）を fetch_prices.py と同じ方法で取得し、
  stock-analysis/data/prices/<コード>.csv に保存する。アクセス間隔は1秒以上。
- 最新営業日の分まで保存済みの銘柄はスキップするので、途中で止まっても再実行で再開できる。
- 失敗した銘柄は記録し、最後に1回だけ再試行する。
- 25日平均売買代金1億円未満・日足250本未満を除外し、score.technical() で採点して
  上位銘柄を screening/stage1_<日付>.csv に保存する。
"""

import argparse
import csv
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch_prices  # noqa: E402
from score import MIN_DAYS, load_prices, technical, total  # noqa: E402

PRICE_DIR = os.path.join(HERE, "data", "prices")
SCREEN_DIR = os.path.join(HERE, "screening")
INTERVAL = 1.1
MIN_TURNOVER = 1e8  # 25日平均売買代金（円）
REFERENCE = "7203"  # 最新営業日の判定に使う銘柄


def load_universe():
    with open(os.path.join(SCREEN_DIR, "universe.csv"), encoding="utf-8") as f:
        return list(csv.DictReader(f))


def last_date(path):
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        lines = f.read().strip().splitlines()
    return lines[-1].split(",")[0] if len(lines) > 1 else None


class Fetcher:
    def __init__(self):
        self.last = 0.0

    def get(self, code):
        wait = INTERVAL - (time.time() - self.last)
        if wait > 0:
            time.sleep(wait)
        try:
            rows, _ = fetch_prices.download(code)
        finally:
            self.last = time.time()
        if not rows:
            raise ValueError("日足が空")
        fetch_prices.save(rows, os.path.join(PRICE_DIR, f"{code}.csv"))
        return rows[-1][0]


def fetch_all(codes, fetcher):
    os.makedirs(PRICE_DIR, exist_ok=True)
    latest = fetcher.get(REFERENCE)
    print(f"最新営業日 {latest}（{REFERENCE} で判定）", flush=True)
    todo = [c for c in codes if (last_date(os.path.join(PRICE_DIR, f"{c}.csv")) or "") < latest]
    print(f"取得対象 {len(todo)} 銘柄（取得済み {len(codes) - len(todo)} 銘柄はスキップ）", flush=True)

    failed = {}
    for round_ in (1, 2):
        targets = todo if round_ == 1 else list(failed)
        if round_ == 2 and targets:
            print(f"失敗した {len(targets)} 銘柄を再試行します", flush=True)
        for n, code in enumerate(targets, 1):
            try:
                fetcher.get(code)
                failed.pop(code, None)
            except Exception as e:  # noqa: BLE001
                failed[code] = f"{type(e).__name__}: {e}"
            if n % 100 == 0:
                print(f"  [{round_}回目] {n}/{len(targets)} 失敗{len(failed)}", flush=True)
    return latest, failed


def volume_ratio(bars):
    if len(bars) < 26:
        return None
    avg25 = sum(b["volume"] for b in bars[-26:-1]) / 25
    return bars[-1]["volume"] / avg25 if avg25 > 0 else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, help="先頭N銘柄だけ処理する（動作確認用）")
    ap.add_argument("--top", type=int, default=150, help="stage1 に残す銘柄数（既定150）")
    ap.add_argument("--no-fetch", action="store_true", help="取得せず保存済みの日足だけで採点する")
    args = ap.parse_args()

    universe = load_universe()
    if args.limit:
        universe = universe[:args.limit]
    codes = [u["コード"] for u in universe]
    started = datetime.now(JST)

    failed = {}
    if args.no_fetch:
        latest = last_date(os.path.join(PRICE_DIR, f"{REFERENCE}.csv"))
    else:
        latest, failed = fetch_all(codes, Fetcher())

    scored, excluded = [], {"取得失敗": [], "日足250本未満": [], "売買代金1億円未満": [], "最新日の日足なし": []}
    for u in universe:
        code = u["コード"]
        path = os.path.join(PRICE_DIR, f"{code}.csv")
        if code in failed or not os.path.exists(path):
            excluded["取得失敗"].append(code)
            continue
        bars = load_prices(path)
        if not bars or str(bars[-1]["date"]) != latest:
            excluded["最新日の日足なし"].append(code)
            continue
        if len(bars) < MIN_DAYS:
            excluded["日足250本未満"].append(code)
            continue
        turnover = sum(b["close"] * b["volume"] for b in bars[-25:]) / 25
        if turnover < MIN_TURNOVER:
            excluded["売買代金1億円未満"].append(code)
            continue
        tech = technical(bars)
        got, _, _ = total(tech["items"])
        scored.append({
            "コード": code, "銘柄名": u["銘柄名"], "市場": u["市場"], "業種": u["業種"],
            "テクニカル点": got, "出来高倍率": round(volume_ratio(bars) or 0, 2),
            "終値": bars[-1]["close"], "25日平均売買代金_億円": round(turnover / 1e8, 2),
            "RSI": round(tech["rsi"], 1) if tech["rsi"] is not None else "",
            "内訳": " ".join(f"{i['name']}={i['score']}" for i in tech["items"]),
            "基準日": tech["base_date"],
        })

    scored.sort(key=lambda r: (-r["テクニカル点"], -r["出来高倍率"]))
    top = scored[:args.top]
    tag = latest.replace("-", "")
    os.makedirs(SCREEN_DIR, exist_ok=True)
    out = os.path.join(SCREEN_DIR, f"stage1_{tag}.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["順位"] + list(scored[0].keys()) if scored else ["順位"])
        w.writeheader()
        for n, r in enumerate(top, 1):
            w.writerow({"順位": n, **r})

    log = {
        "取得開始": f"{started:%Y-%m-%d %H:%M}", "取得終了": f"{datetime.now(JST):%Y-%m-%d %H:%M}",
        "出典": "Yahoo! Finance chart API（range=2y, interval=1d）", "データ基準日": latest,
        "対象銘柄数": len(universe), "採点銘柄数": len(scored), "stage1銘柄数": len(top),
        "除外件数": {k: len(v) for k, v in excluded.items()},
        "取得失敗": failed, "除外銘柄": excluded,
    }
    with open(os.path.join(SCREEN_DIR, f"stage1_{tag}_log.json"), "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=1)

    print(f"{out} に上位 {len(top)} 銘柄を保存しました（採点 {len(scored)} / 対象 {len(universe)}）")
    print("除外：" + "、".join(f"{k}{len(v)}" for k, v in excluded.items()))
    for r in top[:10]:
        print(f"  {r['コード']} {r['銘柄名']} {r['テクニカル点']}点 出来高{r['出来高倍率']}倍")


if __name__ == "__main__":
    main()

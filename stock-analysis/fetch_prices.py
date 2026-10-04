#!/usr/bin/env python3
"""Yahoo! Finance の chart API から日本株の日足（約2年分）を取得して CSV に保存する。

使い方:
  python3 stock-analysis/fetch_prices.py 7203

ネットワーク設定で query1.finance.yahoo.com が許可されていないと失敗する。
その場合は証券会社などから日足CSVを用意して stock-analysis/data/<コード>.csv に置く。
"""

import csv
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

URL = "https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=2y&interval=1d"


def download(code):
    """Yahoo! Finance から日足を取得し、[日付, 始値, 高値, 安値, 終値, 出来高] の行リストを返す。"""
    sym = code if "." in code else f"{code}.T"
    req = urllib.request.Request(URL.format(sym=sym), headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.load(r)
    result = data["chart"]["result"][0]
    tz = timezone(timedelta(seconds=result["meta"].get("gmtoffset", 32400)))
    q = result["indicators"]["quote"][0]
    rows = []
    for i, ts in enumerate(result.get("timestamp") or []):
        vals = [q[k][i] for k in ("open", "high", "low", "close", "volume")]
        if any(v is None for v in vals):
            continue
        rows.append([datetime.fromtimestamp(ts, tz).strftime("%Y-%m-%d")] + vals)
    return rows, tz


def save(rows, out):
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["日付", "始値", "高値", "安値", "終値", "出来高"])
        w.writerows(rows)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("使い方: fetch_prices.py <銘柄コード>")
    code = sys.argv[1]
    try:
        rows, tz = download(code)
    except Exception as e:  # noqa: BLE001
        raise SystemExit(f"取得失敗: {e}\n日足CSVを stock-analysis/data/{code}.csv に置いてください。")
    out = os.path.join(os.path.dirname(__file__), "data", f"{code}.csv")
    save(rows, out)
    print(f"{out} に {len(rows)} 本保存しました（取得日時 {datetime.now(tz):%Y-%m-%d %H:%M} JST・出典 Yahoo! Finance）")


if __name__ == "__main__":
    main()

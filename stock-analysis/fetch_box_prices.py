#!/usr/bin/env python3
"""ボックス相場の判定用に、プライム市場の全銘柄とTOPIX連動ETF（1306）の日足（3年分）を Yahoo! Finance から取得する。

使い方: python3 fetch_box_prices.py screening/universe.csv <保存先ディレクトリ>
取得済みの銘柄はスキップする（取り直すときは保存先を空にする）。アクセス間隔は1.1秒以上。約30分。
"""
import csv, json, os, sys, time, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
UNI, OUT = sys.argv[1], sys.argv[2]
URL = "https://query1.finance.yahoo.com/v8/finance/chart/{c}.T?range=3y&interval=1d"
codes = [r["コード"] for r in csv.DictReader(open(UNI, encoding="utf-8")) if r["市場"] == "プライム"] + ["1306"]
fails = []
for n, c in enumerate(codes):
    out = os.path.join(OUT, f"{c}.csv")
    if os.path.exists(out): continue
    t0 = time.time()
    for attempt in range(4):
        try:
            req = urllib.request.Request(URL.format(c=c), headers={"User-Agent": "Mozilla/5.0"})
            d = json.load(urllib.request.urlopen(req, timeout=20))["chart"]["result"][0]
            tz = timezone(timedelta(seconds=d["meta"].get("gmtoffset", 32400)))
            q = d["indicators"]["quote"][0]
            with open(out, "w", newline="") as f:
                w = csv.writer(f); w.writerow(["date","open","high","low","close","volume"])
                for i, ts in enumerate(d.get("timestamp") or []):
                    v = [q[k][i] for k in ("open","high","low","close","volume")]
                    if None in v: continue
                    w.writerow([datetime.fromtimestamp(ts, tz).strftime("%Y-%m-%d")] + v)
            break
        except Exception as e:
            if attempt == 3: fails.append((c, str(e)))
            time.sleep(5 * (attempt + 1))
    if n % 100 == 0: print(n, len(codes), flush=True)
    time.sleep(max(0, 1.1 - (time.time() - t0)))
json.dump(fails, open(os.path.join(OUT, "_fails.json"), "w"))
print("done", len(codes), "fails", len(fails))

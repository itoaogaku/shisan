#!/usr/bin/env python3
"""過去検証用に、universe.csv の全銘柄の日足を5年分取得して data/prices5y/ に保存する（標準ライブラリのみ）。

使い方:
  python3 stock-analysis/fetch_long.py

アクセス間隔は1秒以上。保存済みの銘柄はスキップするので、途中で止まっても再実行で再開できる。
"""

import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch_prices  # noqa: E402
from screen_technical import load_universe  # noqa: E402

OUT = os.path.join(HERE, "data", "prices5y")


def main():
    os.makedirs(OUT, exist_ok=True)
    codes = [u["コード"] for u in load_universe()]
    todo = [c for c in codes if not os.path.exists(os.path.join(OUT, f"{c}.csv"))]
    print(f"取得対象 {len(todo)} / {len(codes)}", flush=True)
    failed = []
    for n, code in enumerate(todo, 1):
        t0 = time.time()
        try:
            rows, _ = fetch_prices.download(code, "5y")
            fetch_prices.save(rows, os.path.join(OUT, f"{code}.csv"))
        except Exception as e:  # noqa: BLE001
            failed.append((code, str(e)))
        if n % 200 == 0:
            print(f"  {n}/{len(todo)} 失敗{len(failed)}", flush=True)
        time.sleep(max(0, 1.1 - (time.time() - t0)))
    print(f"完了 失敗{len(failed)}: {failed[:10]}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""⓪ 銘柄一覧：JPXの東証上場銘柄一覧から国内普通株だけを抜き出す（標準ライブラリのみ）。

使い方:
  python3 stock-analysis/screen_universe.py [--file data_j.xlsx]

JPXは現在 .xlsx で配布しているため、zipfile と XML パーサーで直接読む（xlrd不要）。
古い .xls を --file で渡した場合だけ xlrd を使う。
"""

import argparse
import csv
import os
import re
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

PAGE = "https://www.jpx.co.jp/markets/statistics-equities/misc/01.html"
BASE = "https://www.jpx.co.jp"
UA = {"User-Agent": "Mozilla/5.0"}
KEEP = {"プライム（内国株式）": "プライム", "スタンダード（内国株式）": "スタンダード",
        "グロース（内国株式）": "グロース"}
JST = timezone(timedelta(hours=9))
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "screening", "universe.csv")
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def download():
    page = fetch(PAGE).decode("utf-8", "replace")
    m = re.search(r'href="([^"]*data_j\.xlsx?)"', page)
    if not m:
        raise SystemExit(f"銘柄一覧ファイルのリンクが見つかりません: {PAGE}")
    url = m.group(1) if m.group(1).startswith("http") else BASE + m.group(1)
    return url, fetch(url)


def read_xlsx(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(NS + "si"):
            shared.append("".join(t.text or "" for t in si.iter(NS + "t")))
    rows = []
    for r in ET.fromstring(z.read("xl/worksheets/sheet1.xml")).iter(NS + "row"):
        row = {}
        for c in r.iter(NS + "c"):
            col = re.match(r"[A-Z]+", c.get("r")).group()
            v = c.find(NS + "v")
            if v is not None:
                row[col] = shared[int(v.text)] if c.get("t") == "s" else v.text
            else:
                row[col] = "".join(t.text or "" for t in c.iter(NS + "t"))
        rows.append(row)
    width = max(len(r) for r in rows)
    cols = [chr(ord("A") + i) for i in range(width)]
    return [[r.get(c, "") for c in cols] for r in rows]


def read_xls(path):
    try:
        import xlrd  # noqa: PLC0415
    except ImportError:
        raise SystemExit(".xls を読むには xlrd が必要です（pip install xlrd）")
    sh = xlrd.open_workbook(path).sheet_by_index(0)
    return [[str(v) for v in sh.row_values(i)] for i in range(sh.nrows)]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", help="ダウンロード済みの data_j.xlsx / data_j.xls")
    args = ap.parse_args()

    if args.file:
        path, url = args.file, args.file
    else:
        url, blob = download()
        path = os.path.join(HERE, "screening", os.path.basename(url))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(blob)
    rows = read_xls(path) if path.endswith(".xls") else read_xlsx(path)

    head = [h.strip() for h in rows[0]]
    ix = {k: head.index(k) for k in ("日付", "コード", "銘柄名", "市場・商品区分", "33業種区分")}
    out, as_of = [], ""
    for r in rows[1:]:
        market = r[ix["市場・商品区分"]].strip()
        if market not in KEEP:
            continue
        code = r[ix["コード"]].strip()
        if code.endswith(".0"):  # xlrd は数値を 1301.0 で返す
            code = code[:-2]
        if len(code) != 4:  # 5桁は優先株・社債型種類株式（普通株ではない）
            continue
        as_of = r[ix["日付"]].strip()
        out.append([code, r[ix["銘柄名"]].strip(), KEEP[market], r[ix["33業種区分"]].strip()])

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["コード", "銘柄名", "市場", "業種"])
        w.writerows(out)
    by = {}
    for r in out:
        by[r[2]] = by.get(r[2], 0) + 1
    print(f"{OUT} に {len(out)} 銘柄を保存しました（{', '.join(f'{k}{v}' for k, v in by.items())}）")
    print(f"出典 {url}（JPX一覧の基準日 {as_of}・取得 {datetime.now(JST):%Y-%m-%d %H:%M}）")


if __name__ == "__main__":
    main()

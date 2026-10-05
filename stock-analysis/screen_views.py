#!/usr/bin/env python3
"""③の補助：ランキング上位N銘柄を「低リスク順」「チャート条件がそろっている順」に並べ替える（標準ライブラリのみ）。

使い方:
  python3 stock-analysis/screen_views.py [--ranking screening/ranking_YYYYMMDD.csv] [--top 20]
                                         [--flags screening/flags_YYYYMMDD.json]

- 次回決算日は IRBank の銘柄ページ（https://irbank.net/<コード>）から取得する。アクセス間隔は1秒以上。
- --flags は Claude が確認した「業績の質」の注意点（一時的要因・季節性など）を {"コード": "理由"} で渡す。
  スクリプトでは判定できないため、渡されなければ0点として扱う。
- 結果は screening/views_<日付>.csv と画面に出力する。売買の推奨ではなく、目安で並べ替えたもの。

低リスク順（リスク点が小さい順、同点は値動きの小さい順）:
  値動き  過去250日の年率ボラティリティ 35%未満0 / 50%未満1 / 65%未満2 / それ以上3
  下落幅  過去250日の高値からの最大下落率 −30%以内0 / −45%以内1 / それ以下2
  過熱    200日線からの乖離 +10%超1 / +20%超2
  割高    予想PER25倍以上1
  流動性  25日平均売買代金5億円未満1
  決算    2週間以内に決算発表1
  業績の質 --flags に該当1

チャート条件がそろっている順（グループ順、グループ内はそろった条件の数→テクニカル点の順）:
  条件  200日線の上0〜10% / 5日線>25日線かつ5日線上向き / RSI65未満 / 上方10%以内に抵抗線なし /
        2週間以内に決算なし / 直近足が陽線で押し戻し30%未満
  A 条件がほぼそろっている（200日線の上0〜10%、過熱・決算待ちなし）
  B 上昇中だが少し高い位置（200日線+10〜20%）
  C 下落の流れから回復途中（200日線の下）
  D 待つ理由がはっきりしている（200日線+20%超・RSI65以上・2週間以内に決算）
"""

import argparse
import csv
import glob
import html
import json
import math
import os
import re
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from score import load_prices, technical  # noqa: E402

JST = timezone(timedelta(hours=9))
SCREEN_DIR = os.path.join(HERE, "screening")
PRICE_DIR = os.path.join(HERE, "data", "prices")
IRBANK = "https://irbank.net/{code}"
EVENT_DAYS = 14


def next_earnings(code, today):
    req = urllib.request.Request(IRBANK.format(code=code), headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        page = r.read().decode("utf-8", "replace")
    page = re.sub(r"<script.*?</script>", "", page, flags=re.S)
    text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", page)))
    m = re.search(r"次の決算発表は\s*(\d{1,2})月(\d{1,2})日", text)
    if not m:
        return None
    d = date(today.year, int(m.group(1)), int(m.group(2)))
    return d if d >= today - timedelta(days=31) else date(today.year + 1, d.month, d.day)


def price_stats(bars):
    c = [b["close"] for b in bars[-250:]]
    r = [math.log(c[i] / c[i - 1]) for i in range(1, len(c))]
    m = sum(r) / len(r)
    vol = math.sqrt(sum((v - m) ** 2 for v in r) / (len(r) - 1)) * math.sqrt(250) * 100
    peak, mdd = c[0], 0.0
    for v in c:
        peak = max(peak, v)
        mdd = min(mdd, v / peak - 1)
    return vol, mdd * 100


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ranking", help="ranking CSV（省略時は最新のもの）")
    ap.add_argument("--top", type=int, default=20)
    ap.add_argument("--flags", help="業績の質の注意点 JSON（{\"コード\": \"理由\"}）")
    args = ap.parse_args()

    path = args.ranking or max(glob.glob(os.path.join(SCREEN_DIR, "ranking_*[0-9].csv")))
    tag = re.search(r"ranking_(\d{8})", path).group(1)
    with open(path, encoding="utf-8") as f:
        top = list(csv.DictReader(f))[:args.top]
    with open(max(glob.glob(os.path.join(SCREEN_DIR, f"stage1_{tag}.csv"))), encoding="utf-8") as f:
        turnover = {r["コード"]: float(r["25日平均売買代金_億円"]) for r in csv.DictReader(f)}
    flags = {}
    if args.flags:
        with open(args.flags, encoding="utf-8") as f:
            flags = json.load(f)
    today = datetime.now(JST).date()

    rows = []
    for n, r in enumerate(top):
        code = r["コード"]
        bars = load_prices(os.path.join(PRICE_DIR, f"{code}.csv"))
        t = technical(bars)
        items = {i["name"]: i for i in t["items"]}
        ma = t["ma"]
        close = bars[-1]["close"]
        dev = (close / ma["ma200"] - 1) * 100
        rsi = t["rsi"]
        per = float(r["予想PER"]) if r["予想PER"] else None
        vol, mdd = price_stats(bars)
        if n:
            time.sleep(1.1)
        try:
            ne = next_earnings(code, today)
        except Exception:  # noqa: BLE001
            ne = None
        days = (ne - today).days if ne else None
        event = days is not None and 0 <= days <= EVENT_DAYS

        risk = {
            "値動き": 0 if vol < 35 else 1 if vol < 50 else 2 if vol < 65 else 3,
            "下落幅": 0 if mdd > -30 else 1 if mdd > -45 else 2,
            "過熱": 2 if dev > 20 else 1 if dev > 10 else 0,
            "割高": 1 if per and per >= 25 else 0,
            "流動性": 1 if turnover.get(code, 0) < 5 else 0,
            "決算": 1 if event else 0,
            "業績の質": 1 if code in flags else 0,
        }
        cond = {
            "200日線の上0〜10%": 0 <= dev <= 10,
            "GC・5日線上向き": ma["ma5"] > ma["ma25"] and ma["ma5"] > ma["ma5_prev"],
            "RSI65未満": rsi < 65,
            "上方10%以内に抵抗線なし": items["レジスタンスライン"]["score"] == 7,
            "2週間以内に決算なし": not event,
            "陽線・押し戻し30%未満": (items["ローソク足・上昇力"]["score"] or 0) >= 5,
        }
        if dev > 20 or rsi >= 65 or event:
            group = "D"
        elif dev < 0:
            group = "C"
        elif dev > 10:
            group = "B"
        else:
            group = "A"
        rows.append({
            "総合順位": int(r["順位"]), "コード": code, "銘柄名": r["銘柄名"], "総合点": int(r["総合点"]),
            "テクニカル点": int(r["テクニカル点"]), "リスク点": sum(risk.values()),
            "リスク内訳": " ".join(f"{k}{v}" for k, v in risk.items() if v),
            "業績の質の注意": flags.get(code, ""),
            "ボラティリティ%": round(vol, 1), "最大下落%": round(mdd, 1), "200日線乖離%": round(dev, 1),
            "RSI": round(rsi, 1), "予想PER": per or "", "売買代金_億円": turnover.get(code, ""),
            "次回決算": ne.isoformat() if ne else "不明", "チャート区分": group,
            "条件数": sum(cond.values()), "満たさない条件": " / ".join(k for k, v in cond.items() if not v),
            "終値": close, "25日線": round(ma["ma25"], 1), "200日線": round(ma["ma200"], 1),
            "最も近い抵抗線": items["レジスタンスライン"]["data"],
        })

    risk_order = sorted(rows, key=lambda x: (x["リスク点"], x["ボラティリティ%"]))
    timing_order = sorted(rows, key=lambda x: ("ABCD".index(x["チャート区分"]), -x["条件数"], -x["テクニカル点"]))
    for i, x in enumerate(risk_order, 1):
        x["低リスク順"] = i
    for i, x in enumerate(timing_order, 1):
        x["チャート条件順"] = i

    out = os.path.join(SCREEN_DIR, f"views_{tag}.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(sorted(rows, key=lambda x: x["総合順位"]))

    print(f"{out} に保存しました（次回決算日の出典 IRBank・取得 {datetime.now(JST):%Y-%m-%d %H:%M}）\n")
    print("■ 低リスク順")
    for x in risk_order:
        print(f"  {x['低リスク順']:>2} {x['コード']} {x['銘柄名']} リスク{x['リスク点']}（{x['リスク内訳'] or 'なし'}）"
              f" 総合{x['総合点']}・{x['総合順位']}位")
    print("\n■ チャート条件がそろっている順")
    for x in timing_order:
        print(f"  {x['チャート条件順']:>2} [{x['チャート区分']}] {x['コード']} {x['銘柄名']} 条件{x['条件数']}/6"
              f" 乖離{x['200日線乖離%']:+.1f}% RSI{x['RSI']:.0f} 決算{x['次回決算']}")


if __name__ == "__main__":
    main()

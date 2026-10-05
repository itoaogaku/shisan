#!/usr/bin/env python3
"""③ 強い株の中から、買い時の良い順に選ぶ（新方式・標準ライブラリのみ）。

使い方:
  python3 stock-analysis/screen_select.py [--date YYYYMMDD] [--pool 100] [--top 20] [--flags screening/flags_YYYYMMDD.json]

入力: screening/strength_<日付>.csv（①）と screening/strong_<日付>.csv（② screen_fundamental.py --out strong）。

■ 強い株スコア（0〜100）= 強さ点（株価の強さ 0〜100）× 0.5 + ファンダ点（0〜45）÷ 45 × 50
  - ②で除外された銘柄（時価総額50億円未満・赤字予想・継続企業の注記あり）は対象外。
  - ファンダ5項目のうち評価できた満点が27点未満（業績データ不足）の銘柄は対象外。
  - 上位 --pool 銘柄（既定100）を「強い株」の候補とする。
  - その中から買い時点の高い順に --top 銘柄（既定20）を選ぶ（同点は強い株スコア順）。
    過去1年の日足での検証（2週間おき17時点）では、強さ上位20をそのまま買い時で並べるより、
    強さ上位100から買い時点で20を選んだ方が3か月後の成績が良かった（全体平均比 +4.4% → +7.0%）。

■ 買い時点（0〜100）。過去1年の検証で、強い株の中で差が出た要素を使う
  直近20日の上昇率   マイナス30 / +10%未満25 / +20%未満18 / +20%以上5   （急騰直後はその後が弱かった）
  25日線からの位置   −3〜+3%で25 / +3〜+8%・−3%未満で17 / +8%超で8      （25日線付近の押し目が良かった）
  52週高値からの距離 −5%以内20 / −15%以内10 / それ以上0                  （高値から大きく崩れた株は大きく負けた）
  上値の余地         上方10%以内に抵抗線なし15 / 5〜10%に8 / 5%以内に3
  5日線が上向き      10
■ 待つ理由: 2週間以内（当日を含む）に決算発表 / --flags で wait=true の銘柄（株式売出しの受渡し前など）。
  待つ理由がある銘柄は --top には入れず、「待ち」として別に出力する。

--flags の形式: {"コード": "注意点"} または {"コード": {"note": "注意点", "wait": true}}
次回決算日は IRBank（https://irbank.net/<コード>）から取得する。結果は screening/select_<日付>.csv。
売買の推奨ではなく、目安で並べたもの。
"""

import argparse
import csv
import glob
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from score import load_prices, sma, technical  # noqa: E402
from screen_views import next_earnings  # noqa: E402

JST = timezone(timedelta(hours=9))
SCREEN_DIR = os.path.join(HERE, "screening")
PRICE_DIR = os.path.join(HERE, "data", "prices")
EVENT_DAYS = 14
MIN_FUND_EVAL = 27


def timing(bars):
    closes = [b["close"] for b in bars]
    i = len(closes) - 1
    t = technical(bars)
    items = {x["name"]: x for x in t["items"]}
    r20 = closes[-1] / closes[-21] - 1
    dev25 = closes[-1] / sma(closes, 25, i) - 1
    high52 = closes[-1] / max(b["high"] for b in bars[-250:]) - 1
    ma5_up = t["ma"]["ma5"] > t["ma"]["ma5_prev"]
    res = items["レジスタンスライン"]["score"]
    pts = {
        "直近20日": 30 if r20 < 0 else 25 if r20 < .10 else 18 if r20 < .20 else 5,
        "25日線": 25 if -.03 <= dev25 <= .03 else 17 if dev25 <= .08 else 8,
        "高値から": 20 if high52 >= -.05 else 10 if high52 >= -.15 else 0,
        "上値余地": {7: 15, 4: 8, 1: 3}.get(res, 0),
        "5日線": 10 if ma5_up else 0,
    }
    return {
        "r20": r20, "dev25": dev25, "high52": high52, "ma5_up": ma5_up, "pts": pts, "score": sum(pts.values()),
        "rsi": t["rsi"], "ma25": t["ma"]["ma25"], "ma200": t["ma"]["ma200"],
        "resist": items["レジスタンスライン"]["data"],
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--date", help="YYYYMMDD（省略時は最新の strong_*.csv）")
    ap.add_argument("--pool", type=int, default=100, help="強い株の候補数（既定100）")
    ap.add_argument("--top", type=int, default=20, help="選ぶ銘柄数（既定20）")
    ap.add_argument("--flags", help="注意点・待ち理由の JSON")
    args = ap.parse_args()

    if args.date:
        tag = args.date
    else:
        tag = re.search(r"strong_(\d{8})\.csv$", max(glob.glob(os.path.join(SCREEN_DIR, "strong_*[0-9].csv")))).group(1)
    with open(os.path.join(SCREEN_DIR, f"strength_{tag}.csv"), encoding="utf-8") as f:
        strength = {r["コード"]: r for r in csv.DictReader(f)}
    with open(os.path.join(SCREEN_DIR, f"strong_{tag}.csv"), encoding="utf-8") as f:
        fund = list(csv.DictReader(f))
    flags = {}
    if args.flags:
        with open(args.flags, encoding="utf-8") as f:
            for k, v in json.load(f).items():
                flags[k] = v if isinstance(v, dict) else {"note": v, "wait": False}

    cands, skipped = [], []
    for r in fund:
        s = strength[r["コード"]]
        f_eval = int(r["評価可能満点"]) - 55
        if f_eval < MIN_FUND_EVAL:
            skipped.append(f"{r['コード']} {r['銘柄名']}（業績データ不足：評価できた満点{f_eval}/45）")
            continue
        score = float(s["強さ点"]) * 0.5 + int(r["ファンダ点"]) / 45 * 50
        cands.append({**r, "強さ点": float(s["強さ点"]), "継続": s["継続"], "6か月上昇率%": s["6か月上昇率%"],
                      "52週高値比%": s["52週高値比%"], "強い株スコア": round(score, 1)})
    cands.sort(key=lambda x: -x["強い株スコア"])
    pool = cands[:args.pool]
    for n, r in enumerate(pool, 1):
        r["強い株順位"] = n
        r["tm"] = timing(load_prices(os.path.join(PRICE_DIR, f"{r['コード']}.csv")))

    today = datetime.now(JST).date()
    rows, picked, fetched = [], 0, 0
    for r in sorted(pool, key=lambda x: (-x["tm"]["score"], -x["強い株スコア"])):
        code, tm = r["コード"], r["tm"]
        fl = flags.get(code, {})
        ne, waits = None, []
        if picked < args.top:  # 次回決算日は選ぶ候補の分だけ取得する
            if fetched:
                time.sleep(1.1)
            fetched += 1
            try:
                ne = next_earnings(code, today)
            except Exception:  # noqa: BLE001
                ne = None
            days = (ne - today).days if ne else None
            if days is not None and 0 <= days <= EVENT_DAYS:
                waits.append("決算発表済み・反応待ち" if days == 0 else f"決算まであと{days}日")
            if fl.get("wait"):
                waits.append(fl["note"])
        if picked >= args.top:
            label = "対象外（買い時点が下位）"
        elif waits:
            label = "待ち"
        else:
            picked += 1
            if tm["score"] >= 70:
                label = "検討しやすい位置"
            elif tm["r20"] >= .20 or tm["dev25"] > .08:
                label = "押し目待ち（短期で上がりすぎ）"
            else:
                label = "様子見"
        rows.append({
            "強い株順位": r["強い株順位"], "コード": code, "銘柄名": r["銘柄名"], "市場": r["市場"], "業種": r["業種"],
            "強い株スコア": r["強い株スコア"], "強さ点": r["強さ点"], "ファンダ点": int(r["ファンダ点"]),
            "継続": r["継続"], "6か月上昇率%": r["6か月上昇率%"], "52週高値比%": r["52週高値比%"],
            "買い時点": tm["score"], "買い時内訳": " ".join(f"{k}{v}" for k, v in tm["pts"].items()),
            "区分": label, "待つ理由": " / ".join(waits),
            "直近20日%": round(tm["r20"] * 100, 1), "25日線乖離%": round(tm["dev25"] * 100, 1),
            "RSI": round(tm["rsi"], 1), "25日線": round(tm["ma25"], 1), "200日線": round(tm["ma200"], 1),
            "最も近い抵抗線": tm["resist"], "次回決算": ne.isoformat() if ne else "",
            "予想PER": r["予想PER"], "時価総額_億円": r["時価総額_億円"], "終値": r["終値"],
            "注意": " / ".join(x for x in (fl.get("note", ""), r["注意"]) if x),
            "ファンダ内訳": r["ファンダ内訳"], "継続企業": r["継続企業"],
        })

    sel = [x for x in rows if x["区分"] not in ("待ち", "対象外（買い時点が下位）")]
    wait = [x for x in rows if x["区分"] == "待ち"]
    for i, x in enumerate(sel, 1):
        x["買い時順"] = i
    out = os.path.join(SCREEN_DIR, f"select_{tag}.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["買い時順"] + list(rows[0].keys()))
        w.writeheader()
        w.writerows(sel + wait + [x for x in rows if x not in sel and x not in wait])

    print(f"{out} に保存しました（候補 {len(cands)}・強い株 {len(pool)}・業績データ不足で対象外 {len(skipped)}）")
    for s_ in skipped:
        print(f"  対象外：{s_}")
    print(f"\n■ 強い株{len(pool)}銘柄のうち、買い時点の高い順に{len(sel)}銘柄")
    for x in sel:
        print(f"  {x['買い時順']:>2} {x['コード']} {x['銘柄名']} 買い時{x['買い時点']} [{x['区分']}] 強い株{x['強い株順位']}位"
              f"（強さ{x['強さ点']}・ファンダ{x['ファンダ点']}）20日{x['直近20日%']:+}% 25日線{x['25日線乖離%']:+}% 高値比{x['52週高値比%']}%")
    print("\n■ 待ち（買い時点は上位だが待つ理由あり）")
    for x in wait:
        print(f"  {x['コード']} {x['銘柄名']} 買い時{x['買い時点']} 強い株{x['強い株順位']}位：{x['待つ理由']}")


if __name__ == "__main__":
    main()

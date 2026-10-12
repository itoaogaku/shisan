#!/usr/bin/env python3
"""ボックス相場銘柄の「買い時点」（0〜100）。screen_box.py の結果を、ボックス戦略
（下限付近で買い、上限付近で売る）の観点で並べ替える。過去データでの検証はしていない。

- 位置（50点）：ボックス内位置 0% で50点、70% で0点（直線）。0%未満（下抜け）や100%超（上抜け）は別枠。
- 反発の兆し（30点）：終値が5日線より上 10点／5日線が前日より上 10点／
  直近5日の安値が、その前15日の安値を下回っていない（安値更新が止まった）10点。
- 上値の余地（20点）：レジスタンスまでの上昇余地 15%以上 20点／10〜15% 12点／5〜10% 5点／5%未満 0点。
- 別枠：ボックス内位置が −3% 未満（下抜け中）、100% 超（上抜け中）、次回決算まで14日以内（待つ理由）。

業績チェック（2026-10-12 追加。backtest_box.py の検証にもとづく）：
- 見送り（業績）：次のどれかに当てはまる銘柄は、買い時点に関係なく候補から外す。
  ① 直近四半期の営業利益が赤字、または前年同期比 −10% を超える減益（株探の3か月決算。取れなければ IRBank）
  ② 今期会社予想の営業利益が前期比 −10% を超える減益（株探）
  ③ 予想PER 40倍以上、または今期赤字予想（株探）
  ④ 直近の四半期決算が発表されていない（最新の四半期末から150日超。決算発表の遅れの疑い）
  ①は過去検証（2024-10〜2026-07の月初15時点、下限シグナル298件）で、外れた銘柄の
  3か月後のボックス下抜け率が42%（残った銘柄は25%）、TOPIX比−10%以下の割合が34%（同21%）だった。
  ②〜④は当時の会社予想が手元にないため検証していない。
- 加点：直近四半期が増収なら +5点（検証では①に増収を足すと−10%以下の割合が21%→19%）。

使い方: python3 screen_box_timing.py <box.csv> <日足ディレクトリ> <出力csv> [--min-turnover 20] [--min-touches 3]
"""
import argparse, csv, json, os, re, sys, time, urllib.request
from datetime import date, timedelta
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from fetch_quarterly import load as qload, growth
from screen_fundamental import Client, parse_finance

def bars(path):
    rows = list(csv.DictReader(open(path)))
    return [(r["date"], float(r["low"]), float(r["close"])) for r in rows]

def earnings_date(code):
    req = urllib.request.Request(f"https://kabutan.jp/stock/?code={code}", headers={"User-Agent": "Mozilla/5.0"})
    page = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
    m = re.search(r"決算発表予定日.{0,200}?(\d{4})/(\d{2})/(\d{2})", page, re.S)
    return date(*map(int, m.groups())) if m else None

def earnings_check(client, code, close, base):
    """業績チェック。戻り値 (判定 '合格'/'見送り（業績）'/'不明', 理由リスト, 増収か)。
    直近四半期は株探の3か月決算を使い、取れないときは IRBank の四半期実績を使う。"""
    reasons, unknown = [], []
    fund = {}
    try:
        fund, _, _ = parse_finance(client.get(f"https://kabutan.jp/stock/finance?code={code}"))
    except Exception:
        unknown.append("株探の決算ページを取得できない")
    q = fund.get("quarter", {})
    cur, ago = q.get("current", {}), q.get("year_ago", {})
    q_end = None
    if cur.get("op") is not None and ago.get("op") is not None:
        m = re.match(r"(\d{2})\.\d{2}-(\d{2})", q["label"])
        q_end = date(2000 + int(m.group(1)) + (1 if int(m.group(2)) < int(q["label"][3:5]) else 0), int(m.group(2)), 28)
        op, op_ago = cur["op"], ago["op"]
        opy = (op / op_ago - 1) if op_ago > 0 else (1.0 if op > 0 else -1.0)
        sales_up = (cur.get("sales") or 0) > (ago.get("sales") or 0)
        q_name = q["label"].split()[0]
    else:
        try:
            g = growth(qload(code)[0])
        except Exception:
            g = None
        if not g or g["営業増益率"] is None:
            unknown.append("直近四半期の営業利益を取得できない")
            op = None
        else:
            q_end = date.fromisoformat(g["四半期末"] + "-28")
            op, opy, sales_up, q_name = g["営業利益"], g["営業増益率"], (g["売上増収率"] or 0) > 0, g["四半期末"] + "期（IRBank）"
    if op is not None:
        if (base - q_end).days > 150:
            reasons.append(f"直近の四半期決算が未発表の疑い（最新は{q_name}）")
        if op <= 0:
            reasons.append(f"直近四半期（{q_name}）が営業赤字")
        elif opy < -0.10:
            reasons.append(f"直近四半期（{q_name}）の営業利益が前年同期比{opy*100:+.0f}%")
    else:
        sales_up = False
    fc, pv = fund.get("annual", {}).get("forecast", {}), fund.get("annual", {}).get("prev", {})
    if fc.get("op") is not None and pv.get("op"):
        if fc["op"] <= 0:
            reasons.append("今期会社予想が営業赤字")
        elif pv["op"] > 0 and fc["op"] / pv["op"] - 1 < -0.10:
            reasons.append(f"今期会社予想の営業利益が前期比{(fc['op'] / pv['op'] - 1)*100:+.0f}%")
    eps = fc.get("eps")
    if eps is not None and eps <= 0:
        reasons.append("今期会社予想が赤字（EPS）")
    elif eps and close / eps >= 40:
        reasons.append(f"予想PER {close / eps:.0f}倍（40倍以上）")
    if not fc:
        unknown.append("今期会社予想を取得できない")
    if reasons:
        return "見送り（業績）", reasons, sales_up
    return ("不明" if unknown else "合格"), unknown, sales_up


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("box"); ap.add_argument("prices"); ap.add_argument("out")
    ap.add_argument("--min-turnover", type=float, default=20); ap.add_argument("--min-touches", type=int, default=3)
    ap.add_argument("--start-before", default="2025-04-04")
    a = ap.parse_args()
    rows = [r for r in csv.DictReader(open(a.box, encoding="utf-8"))
            if float(r["turnover"]) >= a.min_turnover and int(r["touches_u"]) >= a.min_touches
            and int(r["touches_l"]) >= a.min_touches and r["start"] <= a.start_before]
    out, client = [], Client()
    for r in rows:
        b = bars(os.path.join(a.prices, f"{r['code']}.csv"))
        c = [x[2] for x in b]; base = date.fromisoformat(b[-1][0])
        S, R, close = float(r["S"]), float(r["R"]), c[-1]
        pos = (close - S) / (R - S) * 100
        ma5, ma5p = sum(c[-5:]) / 5, sum(c[-6:-1]) / 5
        p_pos = max(0.0, 50 * (1 - max(pos, 0) / 70))
        sig = [close > ma5, ma5 > ma5p, min(x[1] for x in b[-5:]) >= min(x[1] for x in b[-20:-5])]
        room = (R / close - 1) * 100
        p_room = 20 if room >= 15 else 12 if room >= 10 else 5 if room >= 5 else 0
        try:
            ed = earnings_date(r["code"]); time.sleep(1.1)
        except Exception:
            ed = None
        days = (ed - base).days if ed else None
        verdict, why, sales_up = earnings_check(client, r["code"], close, base)
        group = ("見送り（業績）" if verdict == "見送り（業績）" else "下抜け中" if pos < -3 else "上抜け中" if pos > 100
                 else "決算待ち" if days is not None and 0 <= days <= 14 else "対象")
        out.append(dict(code=r["code"], name=r["name"], group=group, earnings_check=verdict, reasons=" / ".join(why),
                        score=round(min(100, p_pos + 10 * sum(sig) + p_room + (5 if sales_up else 0)), 1),
                        pos=round(pos, 1), room=round(room, 1), S=round(S), R=round(R), close=close,
                        stop=round(S * 0.97), above_ma5=sig[0], ma5_up=sig[1], no_new_low=sig[2],
                        earnings=str(ed) if ed else "不明", base=b[-1][0], turnover=r["turnover"],
                        period_m=r["period_m"], touches=f"{r['touches_u']}/{r['touches_l']}"))
    order = {"対象": 0, "決算待ち": 1, "下抜け中": 2, "上抜け中": 3, "見送り（業績）": 4}
    out.sort(key=lambda x: (order[x["group"]], -x["score"]))
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0])); w.writeheader(); w.writerows(out)
    for x in out: print(x)

if __name__ == "__main__":
    main()

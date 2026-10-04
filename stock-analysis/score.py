#!/usr/bin/env python3
"""株式銘柄の採点スクリプト（標準ライブラリのみ）。

テクニカル7項目は日足CSVから、ファンダメンタルズ5項目は業績JSONから計算し、
.claude/skills/kabu-bunseki/SKILL.md の採点基準でスコアを付ける。

使い方:
  python3 stock-analysis/score.py --csv data/7203.csv [--fund data/7203_fund.json] [--json]
"""

import argparse
import csv
import json
import math
import sys
from datetime import datetime

MIN_DAYS = 250

COLUMN_ALIASES = {
    "date": ["日付", "年月日", "date", "Date", "DATE"],
    "open": ["始値", "open", "Open", "OPEN"],
    "high": ["高値", "high", "High", "HIGH"],
    "low": ["安値", "low", "Low", "LOW"],
    "close": ["終値", "調整後終値", "close", "Close", "CLOSE"],
    "volume": ["出来高", "volume", "Volume", "VOLUME"],
}


# ---------------------------------------------------------------- CSV読み込み

def _read_text(path):
    for enc in ("utf-8-sig", "cp932"):
        try:
            with open(path, encoding=enc) as f:
                return f.read()
        except UnicodeDecodeError:
            continue
    raise SystemExit(f"文字コードを判別できません: {path}")


def _parse_date(s):
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y%m%d", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    raise ValueError(s)


def _num(s):
    s = str(s).replace(",", "").strip()
    if s in ("", "-", "null", "None", "NaN"):
        return None
    return float(s)


def load_prices(path):
    rows = list(csv.reader(_read_text(path).splitlines()))
    header_idx = None
    for i, row in enumerate(rows[:20]):
        cells = [c.strip() for c in row]
        if any(c in COLUMN_ALIASES["date"] for c in cells) and any(c in COLUMN_ALIASES["close"] for c in cells):
            header_idx = i
            break
    if header_idx is None:
        raise SystemExit("ヘッダー行（日付・始値・高値・安値・終値・出来高）が見つかりません")
    header = [c.strip() for c in rows[header_idx]]
    col = {}
    for key, names in COLUMN_ALIASES.items():
        for name in names:
            if name in header:
                col[key] = header.index(name)
                break
        if key not in col:
            raise SystemExit(f"列が見つかりません: {key}（候補: {', '.join(names)}）")

    bars = []
    for row in rows[header_idx + 1:]:
        if len(row) <= max(col.values()):
            continue
        try:
            d = _parse_date(row[col["date"]])
        except ValueError:
            continue
        vals = {k: _num(row[col[k]]) for k in ("open", "high", "low", "close", "volume")}
        if any(v is None for v in vals.values()):
            continue
        bars.append({"date": d, **vals})
    bars.sort(key=lambda b: b["date"])
    dedup = {}
    for b in bars:
        dedup[b["date"]] = b
    return list(dedup.values())


# ---------------------------------------------------------------- 指標計算

def sma(values, n, end):
    """values[end-n+1 .. end] の単純平均。データ不足なら None。"""
    if end - n + 1 < 0:
        return None
    return sum(values[end - n + 1:end + 1]) / n


def rsi_wilder(closes, length=14):
    """PineScript ta.rsi 準拠。rma は最初の length 本を SMA で初期化し、以降 alpha=1/length。"""
    if len(closes) < length + 1:
        return None
    gains, losses = [], []
    for i in range(1, len(closes)):
        ch = closes[i] - closes[i - 1]
        gains.append(ch if ch >= 0 else 0.0)
        losses.append(-ch if ch < 0 else 0.0)
    avg_g = sum(gains[:length]) / length
    avg_l = sum(losses[:length]) / length
    for g, l in zip(gains[length:], losses[length:]):
        avg_g = (avg_g * (length - 1) + g) / length
        avg_l = (avg_l * (length - 1) + l) / length
    if avg_l == 0:
        return 100.0
    if avg_g == 0:
        return 0.0
    return 100 - 100 / (1 + avg_g / avg_l)


def find_resistances(bars, close):
    """現在値より上の抵抗線候補を返す（過去250営業日）。"""
    window = bars[-MIN_DAYS:]
    highs = [b["high"] for b in window]
    out = []

    # 1) 52週高値
    hi = max(highs)
    hi_date = window[highs.index(hi)]["date"]
    if hi > close:
        out.append({"price": hi, "kind": "52週高値", "detail": f"{hi_date}"})

    # 2) 複数回反落した価格帯（前後5本で最も高いスイング高値を±1.5%でまとめる）
    swings = []
    for i in range(5, len(window) - 5):
        if highs[i] == max(highs[i - 5:i + 6]):
            swings.append((highs[i], window[i]["date"]))
    swings.sort()
    clusters = []
    for price, d in swings:
        if clusters and price <= clusters[-1]["base"] * 1.015:
            clusters[-1]["members"].append((price, d))
        else:
            clusters.append({"base": price, "members": [(price, d)]})
    for c in clusters:
        if len(c["members"]) >= 2:
            top = max(p for p, _ in c["members"])
            if top > close:
                dates = ", ".join(str(d) for _, d in c["members"])
                out.append({"price": top, "kind": f"{len(c['members'])}回反落した価格帯",
                            "detail": dates})

    # 3) 出来高が集中した価格帯（終値1%刻み、出来高上位3帯）
    lo_p = min(b["close"] for b in window)
    step = lo_p * 0.01
    bins = {}
    for b in window:
        k = int((b["close"] - lo_p) // step)
        bins[k] = bins.get(k, 0) + b["volume"]
    total = sum(bins.values())
    for k, v in sorted(bins.items(), key=lambda kv: -kv[1])[:3]:
        lower = lo_p + k * step
        upper = lower + step
        if lower > close:
            out.append({"price": lower, "kind": "出来高集中帯",
                        "detail": f"{lower:,.0f}〜{upper:,.0f}円（期間出来高の{v / total * 100:.1f}%）"})

    out.sort(key=lambda r: r["price"])
    for r in out:
        r["distance_pct"] = (r["price"] / close - 1) * 100
    return out


def round_number_above(close):
    unit = 10 if close < 1000 else 100 if close < 10000 else 1000
    return math.floor(close / unit) * unit + unit


# ---------------------------------------------------------------- テクニカル採点

def technical(bars):
    n = len(bars)
    closes = [b["close"] for b in bars]
    vols = [b["volume"] for b in bars]
    last, prev = bars[-1], bars[-2]
    i = n - 1
    res = {"base_date": str(last["date"]), "days": n,
           "period": f"{bars[0]['date']}〜{last['date']}",
           "ohlcv": {k: last[k] for k in ("open", "high", "low", "close", "volume")},
           "prev_close": prev["close"], "items": [], "warnings": []}
    if n < MIN_DAYS:
        res["warnings"].append(f"日足が{n}本しかありません（必要{MIN_DAYS}本）。200日線・RSIは不正確または評価不能です。")

    c = last["close"]
    ma5, ma25, ma200 = sma(closes, 5, i), sma(closes, 25, i), sma(closes, 200, i)
    ma5p, ma25p = sma(closes, 5, i - 1), sma(closes, 25, i - 1)
    res["ma"] = {"ma5": ma5, "ma25": ma25, "ma200": ma200, "ma5_prev": ma5p, "ma25_prev": ma25p}

    # Ⅰ 200日線
    if ma200 is None:
        res["items"].append(item("200日線との関係", 8, None, "200日分のデータ不足"))
    else:
        dev = (c - ma200) / ma200 * 100
        s = 8 if dev <= 10 else 6 if dev <= 15 else 3 if dev <= 25 else 0
        note = "200日線より下（下落トレンド中の可能性）" if dev < 0 else ""
        if dev > 15:
            note = "200日線から大きく上に離れており過熱リスク"
        res["items"].append(item("200日線との関係", 8, s,
                                 f"終値{c:,.1f} / 200日線{ma200:,.1f} / 乖離{dev:+.2f}%", note))

    # Ⅱ ゴールデンクロス
    if None in (ma5, ma25, ma5p, ma25p):
        res["items"].append(item("5日線と25日線のGC", 9, None, "データ不足"))
    else:
        up5, up25 = ma5 > ma5p, ma25 > ma25p
        if ma5 > ma25 and up5 and up25:
            s, note = 9, ""
        elif ma5 > ma25 and (up5 or up25):
            s, note = 6, "片方の線が下向き"
        elif ma5 > ma25:
            s, note = 0, "5日線は上だが両線とも下向き"
        elif up5 and (ma25 - ma5) / ma25 <= 0.01:
            s, note = 3, "クロス未完成（準備段階）"
        else:
            s, note = 0, "5日線が25日線の下"
        data = (f"5日線{ma5:,.1f}（前日{ma5p:,.1f}{'↑' if up5 else '↓'}） / "
                f"25日線{ma25:,.1f}（前日{ma25p:,.1f}{'↑' if up25 else '↓'}）")
        res["items"].append(item("5日線と25日線のGC", 9, s, data, note))

    # Ⅲ 5日線と25日線の乖離率
    if None in (ma5, ma25):
        res["items"].append(item("5日線と25日線の乖離率", 7, None, "データ不足"))
    else:
        gap = abs(ma5 - ma25) / ma25 * 100
        s = 7 if gap < 3 else 5 if gap < 5 else 2 if gap < 10 else 0
        res["items"].append(item("5日線と25日線の乖離率", 7, s, f"乖離率{gap:.2f}%",
                                 "5%超で短期過熱の可能性" if gap >= 5 else ""))

    # Ⅳ ローソク足
    o, h, l = last["open"], last["high"], last["low"]
    rng = h - l
    pushback = (h - c) / rng * 100 if rng > 0 else 0.0
    body = (c - o) / rng * 100 if rng > 0 else 0.0
    yang = c > o
    if yang and body >= 50 and pushback < 30:
        s = 8
    elif yang and pushback < 30:
        s = 5
    elif yang:
        s = 2
    else:
        s = 0
    chg = (c / prev["close"] - 1) * 100
    res["items"].append(item(
        "ローソク足・上昇力", 8, s,
        f"始{o:,.1f} 高{h:,.1f} 安{l:,.1f} 終{c:,.1f} / 前日比{chg:+.2f}% / "
        f"{'陽線' if yang else '陰線または同値'} / 実体{body:.0f}% / 押し戻し率{pushback:.0f}%",
        "押し戻し率30%以上：上値が重い" if pushback >= 30 else ""))

    # Ⅴ 出来高
    if n < 26:
        res["items"].append(item("出来高", 9, None, "データ不足"))
    else:
        avg25 = sum(vols[-26:-1]) / 25
        avg5 = sum(vols[-6:-1]) / 5
        ratio = last["volume"] / avg25 if avg25 > 0 else 0
        up_day = c > prev["close"]
        if up_day:
            s = 9 if ratio >= 2 else 6 if ratio >= 1.5 else 3 if ratio >= 1 else 0
            note = ""
        else:
            s = 0
            note = "下落日の出来高増加：売り圧力の可能性" if ratio >= 1.5 else "上昇日ではない"
        res["items"].append(item(
            "出来高", 9, s,
            f"当日{last['volume']:,.0f} / 5日平均{avg5:,.0f} / 25日平均{avg25:,.0f}（当日除く） / 倍率{ratio:.2f}倍",
            note))

    # Ⅵ レジスタンス
    if n < 30:
        res["items"].append(item("レジスタンスライン", 7, None, "データ不足"))
        res["resistances"] = []
    else:
        rs = find_resistances(bars, c)
        res["resistances"] = rs
        res["round_number"] = round_number_above(c)
        nearest = rs[0]["distance_pct"] if rs else None
        if nearest is None or nearest > 10:
            s = 7
        elif nearest > 5:
            s = 4
        else:
            s = 1
        if rs:
            r0 = rs[0]
            data = f"最も近い抵抗：{r0['price']:,.1f}円（+{r0['distance_pct']:.1f}%・{r0['kind']}）"
        else:
            data = "過去250日で現在値より上に抵抗線候補なし（高値更新中）"
        res["items"].append(item("レジスタンスライン", 7, s, data,
                                 f"節目の価格{res['round_number']:,.0f}円も参考"))

    # Ⅶ RSI
    rsi = rsi_wilder(closes)
    res["rsi"] = rsi
    if rsi is None:
        res["items"].append(item("RSI(14)", 7, None, "データ不足"))
    else:
        s = 7 if rsi < 60 else 5 if rsi < 70 else 3 if rsi < 75 else 1 if rsi < 85 else 0
        note = "85以上：強い警戒" if rsi >= 85 else "75以上：過熱気味" if rsi >= 75 else ""
        if n < MIN_DAYS:
            note = (note + " / " if note else "") + "データ本数不足のため参考値"
        res["items"].append(item("RSI(14)", 7, s, f"RSI {rsi:.2f}（Wilder方式・{n}本で計算）", note))
    return res


# ---------------------------------------------------------------- ファンダ採点

METRICS = [("sales", "売上高"), ("op", "営業利益"), ("ord", "経常利益"), ("net", "純利益")]


def growth(cur, base):
    if cur is None or base is None:
        return None, "不明"
    if base <= 0:
        if cur > 0:
            return "turn", "黒字転換（率は計算不可）"
        return "neg", "赤字継続"
    g = (cur / base - 1) * 100
    return g, f"{g:+.1f}%"


def growth_score(cur, base):
    """4指標の成長率から採点（年間・四半期共通）。"""
    parts, gs = [], []
    for key, label in METRICS:
        g, txt = growth(cur.get(key), base.get(key))
        parts.append(f"{label}{txt}")
        gs.append(g)
    data = " / ".join(parts)
    if any(g is None for g in gs):
        return None, data, "不明なデータあり"
    if any(cur.get(k) is not None and cur[k] <= 0 for k, _ in METRICS[1:]):
        return 0, data, "利益が赤字"
    nums = [g for g in gs if isinstance(g, float)]
    turns = sum(1 for g in gs if g == "turn")
    note = "黒字転換の指標は「プラス」として扱った" if turns else ""
    if any(g < 0 for g in nums):
        s = 1
    elif turns == 0 and all(g >= 25 for g in nums):
        s = 10
    elif turns == 0 and all(g >= 10 for g in nums):
        s = 7
    elif sum(1 for g in nums if g >= 10) >= 3:
        s = 4
    else:
        s = 2
    g_sales = gs[0]
    if isinstance(g_sales, float) and g_sales > 0 and any(isinstance(g, float) and g < 0 for g in gs[1:]):
        note = (note + " / " if note else "") + "増収減益：利益率悪化に注意"
    return s, data, note


def fundamental(fund, price):
    res = {"items": [], "warnings": []}
    annual = fund.get("annual", {})
    prev_a, fc = annual.get("prev", {}), annual.get("forecast", {})

    # Ⅰ 年間
    if fc and prev_a:
        s, data, note = growth_score(fc, prev_a)
        res["items"].append(item("年間業績の成長", 10, s, "今期会社予想 vs 前期実績：" + data, note))
    else:
        res["items"].append(item("年間業績の成長", 10, None, "会社予想または前期実績が不明"))

    # Ⅱ 四半期
    q = fund.get("quarter", {})
    if q.get("current") and q.get("year_ago"):
        s, data, note = growth_score(q["current"], q["year_ago"])
        if q.get("one_off"):
            note = (note + " / " if note else "") + f"一時的要因：{q['one_off']}"
        res["items"].append(item("四半期業績の成長", 10, s, f"{q.get('label', '直近四半期')} 前年同期比：" + data, note))
    else:
        res["items"].append(item("四半期業績の成長", 10, None, "単独四半期データが不明"))

    # Ⅲ 進捗率
    pr = fund.get("progress", {})
    qn = pr.get("quarter")
    cum = pr.get("cumulative", {})
    if qn in (1, 2, 3) and cum.get("op") is not None and fc.get("op"):
        std = qn * 25
        p_op = cum["op"] / fc["op"] * 100
        p_sales = cum["sales"] / fc["sales"] * 100 if cum.get("sales") is not None and fc.get("sales") else None
        s = 7 if p_op >= std + 5 else 5 if p_op >= std else 3 if p_op >= std - 5 else 0
        data = f"Q{qn}累計 営業利益進捗{p_op:.1f}%（標準{std}%）"
        if p_sales is not None:
            data += f" / 売上進捗{p_sales:.1f}%"
        res["items"].append(item("通期予想に対する進捗率", 7, s, data, "季節性は過去の同時期と比較して確認"))
    else:
        res["items"].append(item("通期予想に対する進捗率", 7, None,
                                 "本決算直後・予想非開示・データ不足のいずれか"))

    # Ⅳ PER / Ⅴ PEG
    eps_f, eps_p = fc.get("eps"), prev_a.get("eps")
    per = price / eps_f if eps_f and eps_f > 0 else None
    res["per"] = per
    if eps_f is None:
        res["items"].append(item("PER", 9, None, "予想EPSが不明"))
    elif per is None:
        res["items"].append(item("PER", 9, 0, f"予想EPS{eps_f}（赤字予想）"))
    else:
        s = 9 if per < 20 else 6 if per < 25 else 3 if per < 30 else 0
        data = f"予想PER {per:.1f}倍（株価{price:,.1f} ÷ 予想EPS{eps_f:,.2f}）"
        if eps_p and eps_p > 0:
            data += f" / 実績PER {price / eps_p:.1f}倍"
        if fund.get("industry_per"):
            data += f" / 業種平均{fund['industry_per']}倍"
        res["items"].append(item("PER", 9, s, data,
                                 "PERが低すぎる：業績悪化・財務不安がないか確認" if per < 8 else ""))

    if per is None or eps_p is None:
        res["items"].append(item("PEGレシオ", 9, None, "PERまたは前期EPSが不明"))
    elif eps_p <= 0:
        res["items"].append(item("PEGレシオ", 9, None, "前期EPSが0以下で成長率を計算できない"))
    else:
        g = (eps_f / eps_p - 1) * 100
        if g <= 0:
            res["items"].append(item("PEGレシオ", 9, 0, f"EPS成長率{g:+.1f}%（マイナス）"))
        else:
            peg = per / g
            s = 9 if peg < 1 else 6 if peg < 1.5 else 3 if peg < 2 else 0
            res["items"].append(item("PEGレシオ", 9, s, f"PEG {peg:.2f}（PER{per:.1f} ÷ EPS成長率{g:.1f}%）"))
    return res


# ---------------------------------------------------------------- 共通

def item(name, full, score, data, note=""):
    return {"name": name, "full": full, "score": score, "data": data, "note": note}


def total(items):
    got = sum(i["score"] or 0 for i in items)
    full = sum(i["full"] for i in items)
    evaluable = sum(i["full"] for i in items if i["score"] is not None)
    return got, full, evaluable


def rank(points):
    if points >= 80:
        return "A", "有力候補"
    if points >= 70:
        return "B+", "検討候補"
    if points >= 60:
        return "B", "監視候補"
    if points >= 50:
        return "C", "慎重候補"
    return "D", "見送り候補"


def table(items):
    lines = ["| 評価項目 | 満点 | 今回 | 使用データ | 注意点 |", "|---|---|---|---|---|"]
    for i in items:
        sc = "評価不能" if i["score"] is None else str(i["score"])
        lines.append(f"| {i['name']} | {i['full']} | {sc} | {i['data']} | {i['note'] or '-'} |")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", required=True, help="分割調整済みの日足CSV")
    ap.add_argument("--fund", help="業績JSON（stock-analysis/fund_template.json の形式）")
    ap.add_argument("--json", action="store_true", help="結果をJSONで出力")
    args = ap.parse_args()

    bars = load_prices(args.csv)
    if len(bars) < 30:
        raise SystemExit(f"日足が{len(bars)}本しかありません")
    tech = technical(bars)
    fund_res = None
    if args.fund:
        with open(args.fund, encoding="utf-8") as f:
            fund = json.load(f)
        price = fund.get("price") or bars[-1]["close"]
        fund_res = fundamental(fund, price)

    t_got, t_full, t_eval = total(tech["items"])
    f_got, f_full, f_eval = total(fund_res["items"]) if fund_res else (0, 45, 0)
    pts = t_got + f_got
    grade, label = rank(pts)
    summary = {"total": pts, "fundamental": f_got, "technical": t_got,
               "evaluable_full": t_eval + f_eval,
               "evaluable_rate": (pts / (t_eval + f_eval) * 100) if (t_eval + f_eval) else None,
               "rank": grade, "label": label}

    if args.json:
        json.dump({"summary": summary, "technical": tech, "fundamental": fund_res},
                  sys.stdout, ensure_ascii=False, indent=2, default=str)
        print()
        return

    print(f"## 機械採点結果（データ基準日 {tech['base_date']}・日足{tech['days']}本 {tech['period']}）\n")
    for w in tech["warnings"] + (fund_res["warnings"] if fund_res else []):
        print(f"> ⚠ {w}\n")
    print(f"- 総合点：**{pts} / 100**（ファンダ {f_got}/45・テクニカル {t_got}/55）")
    print(f"- 評価可能な項目の満点：{t_eval + f_eval}点 / 得点率 "
          f"{summary['evaluable_rate']:.1f}%" if summary["evaluable_rate"] is not None else "")
    print(f"- 暫定ランク：{grade}（{label}）※重大リスクによる上限調整は未反映\n")
    if fund_res:
        print("### ファンダメンタルズ\n")
        print(table(fund_res["items"]) + "\n")
    else:
        print("### ファンダメンタルズ\n\n業績JSONなし：全項目評価不能\n")
    print("### テクニカル\n")
    print(table(tech["items"]) + "\n")
    m = tech["ma"]
    print("計算条件：移動平均は終値の単純移動平均（SMA）、RSIは14日・PineScript準拠Wilder方式、"
          "出来高倍率は当日除く直近25営業日平均との比\n")
    if m["ma200"] is not None:
        print(f"MA：5日{m['ma5']:,.2f} / 25日{m['ma25']:,.2f} / 200日{m['ma200']:,.2f}\n")
    if tech.get("resistances"):
        print("### 現在値より上の抵抗線候補（過去250営業日）\n")
        for r in tech["resistances"][:8]:
            print(f"- {r['price']:,.1f}円（+{r['distance_pct']:.1f}%）{r['kind']}：{r['detail']}")
        print()


if __name__ == "__main__":
    main()

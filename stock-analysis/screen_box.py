"""ボックス相場の判定。
各銘柄について、直近を終点とする 1〜3 年の窓で
 サポート S = 終値の5パーセンタイル、レジスタンス R = 95パーセンタイル
を置き、下限帯（S〜S+25%幅）と上限帯（R-25%幅〜R）を交互に何回往復したかを数える。
条件: 幅15〜70% / 上限帯・下限帯それぞれ2回以上の到達 / 1往復の平均日数 60〜250営業日 /
      窓の前半1/3と後半1/3の平均の差がボックス幅の40%以内（右肩上がり・下がりでない）/
      現在値がボックス内（S×0.95〜R×1.05） / 各到達の山・谷のばらつき（変動係数）6%以内
"""
import csv, glob, json, os, statistics, sys

def load(p):
    rows = list(csv.DictReader(open(p)))
    return [(r["date"], float(r["high"]), float(r["low"]), float(r["close"]), float(r["volume"])) for r in rows]

def pct(xs, q):
    s = sorted(xs); k = (len(s) - 1) * q; f = int(k); c = min(f + 1, len(s) - 1)
    return s[f] + (s[c] - s[f]) * (k - f)

def analyze(bars):
    closes = [b[3] for b in bars]
    best = None
    for L in (735, 610, 490, 370, 250):
        if len(bars) < L: continue
        w = bars[-L:]; c = [b[3] for b in w]
        S, R = pct(c, 0.05), pct(c, 0.95)
        width = R / S - 1
        if not 0.15 <= width <= 0.70: continue
        h = R - S
        third = L // 3
        if abs(statistics.mean(c[:third]) - statistics.mean(c[-third:])) > 0.4 * h: continue
        if not S * 0.95 <= c[-1] <= R * 1.05: continue
        lo_th, hi_th = S + 0.25 * h, R - 0.25 * h
        visits = []  # (zone, start_idx, extreme)
        for i, b in enumerate(w):
            z = "L" if b[3] <= lo_th else "U" if b[3] >= hi_th else None
            if z is None: continue
            if visits and visits[-1][0] == z:
                v = visits[-1]
                visits[-1] = (z, v[1], max(v[2], b[1]) if z == "U" else min(v[2], b[2]))
            else:
                visits.append((z, i, b[1] if z == "U" else b[2]))
        ups = [v for v in visits if v[0] == "U"]; lows = [v for v in visits if v[0] == "L"]
        if len(ups) < 2 or len(lows) < 2: continue
        trips = (len(visits) - 1) / 2
        period = (visits[-1][1] - visits[0][1]) / trips if trips else 0
        if not 60 <= period <= 250: continue
        cv_u = statistics.pstdev([v[2] for v in ups]) / statistics.mean([v[2] for v in ups])
        cv_l = statistics.pstdev([v[2] for v in lows]) / statistics.mean([v[2] for v in lows])
        if max(cv_u, cv_l) > 0.06: continue
        pos = (c[-1] - S) / h * 100
        cand = dict(days=L, start=w[0][0], S=S, R=R, width=width * 100, trips=trips,
                    touches_u=len(ups), touches_l=len(lows), period_m=period / 21,
                    cv=max(cv_u, cv_l) * 100, close=c[-1], pos=pos, last_zone=visits[-1][0])
        best = cand; break  # 最も長い窓を採用
    return best

def main(price_dir, uni, out):
    names = {r["コード"]: r for r in csv.DictReader(open(uni, encoding="utf-8"))}
    res = []
    for p in glob.glob(os.path.join(price_dir, "*.csv")):
        code = os.path.basename(p)[:-4]
        try: bars = load(p)
        except Exception: continue
        if len(bars) < 250: continue
        # 分割調整漏れの疑い（1日で±45%超）は除外
        if any(abs(bars[i][3] / bars[i-1][3] - 1) > 0.45 for i in range(1, len(bars))): continue
        tv = statistics.mean(b[3] * b[4] for b in bars[-60:]) / 1e8
        r = analyze(bars)
        if r:
            r.update(code=code, name=names.get(code, {}).get("銘柄名", ""), sector=names.get(code, {}).get("業種", ""),
                     turnover=tv, base=bars[-1][0])
            res.append(r)
    res.sort(key=lambda r: -r["turnover"])
    keys = ["code","name","sector","turnover","days","start","S","R","width","trips","touches_u","touches_l","period_m","cv","close","pos","last_zone","base"]
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=keys); w.writeheader()
        for r in res: w.writerow({k: (round(r[k], 2) if isinstance(r[k], float) else r[k]) for k in keys})
    print(len(res), "box candidates")

if __name__ == "__main__":
    main(*sys.argv[1:4])

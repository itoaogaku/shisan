#!/usr/bin/env python3
"""「3回に分けて買う」ルールの過去検証。月1回（21営業日おき）×3回、その時点の新方式20銘柄を1/3ずつ買い、
それぞれ6か月持った場合と、一度に全額買った場合を比べる。

使い方: python3 stock-analysis/backtest_tranche.py   （先に fetch_long.py で5年分の日足を取得）
"""
import sys,statistics
sys.path.insert(0,'.')
from backtest_rules import H6, data, dates, picks, run  # noqa: E402
pos={d:i for i,d in enumerate(dates)}
def ret6(d0):
    sel,_,_=picks(d0); return statistics.mean(run(data[x['c']],x['i'],H6,'hold')[0] for x in sel), [x['c'] for x in sel]
forms=[i for i in range(260,len(dates)-H6-42) if '2022-10-01'<=dates[i]<='2025-09-30'][::10]
cache={}
def r(i):
    if i not in cache: cache[i]=ret6(dates[i])[0]
    return cache[i]
single=[r(f) for f in forms]
tranche=[(r(f)+r(f+21)+r(f+42))/3 for f in forms]
for name,v in [('一度に全額（従来）',single),('3回に分けて買う（新ルール）',tranche)]:
    print(f"{name:18s} 6か月保有の平均{statistics.mean(v)*100:+.2f}% 最悪{min(v)*100:+.1f}% マイナス{sum(1 for x in v if x<0)}/{len(v)} −5%以下{sum(1 for x in v if x<=-.05)}/{len(v)} ばらつき{statistics.pstdev(v)*100:.1f}%")
for d in ('2024-10-07','2025-10-06'):
    f=pos[d]
    parts=[]
    for k in (0,21,42):
        if f+k+H6 < len(dates):
            v,codes=ret6(dates[f+k]); parts.append((dates[f+k],v,codes))
    print(f"\n{d}から 400万円を {len(parts)}回に分けて（各{400/len(parts):.1f}万円・それぞれ6か月保有）")
    tot=0
    for dd,v,codes in parts:
        amt=400/len(parts)*(1+v); tot+=amt
        print(f"   {dd}に購入 → 6か月後 {amt:6.1f}万円（{v*100:+.1f}%） 銘柄例 {', '.join(codes[:5])}")
    print(f"   合計 {tot:.1f}万円（一度に全額なら {400*(1+parts[0][1]):.1f}万円）")

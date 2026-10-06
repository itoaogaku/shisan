#!/usr/bin/env python3
"""新方式（株価の部分）を2022-10〜2025-09の2週間おき72時点で検証する。結果は reports/backtest_20261006.md。

先に fetch_long.py で5年分の日足を取得しておく。"""
import sys,os,statistics,json
sys.path.insert(0,'.')
from backtest_strength import load_all, split_jump, H3, H6
from score import sma
from screen_select import timing, HOT_DEV200, HOT_RSI
uni,data=load_all()
dates=[str(b['date']) for b in data['7203']]
idx={c:{str(x['date']):i for i,x in enumerate(b)} for c,b in data.items()}
forms=[i for i in range(260,len(dates)-H6) if dates[i]>='2022-10-01' and dates[i]<='2025-09-30'][::10]
res={}
def add(k,v): res.setdefault(k,[]).append(v)
for fi in forms:
    d0=dates[fi]; rows=[]
    for c,b in data.items():
        i=idx[c].get(d0)
        if i is None or i<260 or i+H6>=len(b): continue
        h=b[:i+1]
        if sum(x['close']*x['volume'] for x in h[-25:])/25<1e8: continue
        if split_jump(h[-260:]) or split_jump(b[i:i+H6+1]): continue
        cl=[x['close'] for x in h]
        rows.append(dict(h=h,mom6=cl[-1]/cl[-127]-1,high52=cl[-1]/max(x['high'] for x in h[-250:]),above=cl[-1]>sma(cl,200,len(cl)-1),
            r3=b[i+H3]['close']/cl[-1]-1,r6=b[i+H6]['close']/cl[-1]-1))
    n=len(rows)
    for k in('mom6','high52'):
        for r,x in enumerate(sorted(rows,key=lambda x:x[k])): x['s']=x.get('s',0)+r/(n-1)
    m3=statistics.mean(x['r3'] for x in rows); m6=statistics.mean(x['r6'] for x in rows)
    pool=sorted([x for x in rows if x['above']],key=lambda x:-x['s'])[:100]
    for x in pool:
        t=timing(x['h']); x['t']=t['score']; x['hot']=t['dev200']>HOT_DEV200 or t['rsi']>=HOT_RSI
    G={'新方式（安全柵あり）':sorted([x for x in pool if not x['hot']],key=lambda x:(-x['t'],-x['s']))[:20],
       '新方式（安全柵なし）':sorted(pool,key=lambda x:(-x['t'],-x['s']))[:20],
       '強さ上位20':pool[:20],'強さ上位100':pool,'過熱銘柄':[x for x in pool if x['hot']]}
    for k,g in G.items():
        if g: add(k,(d0,statistics.mean(x['r3'] for x in g)-m3,statistics.mean(x['r6'] for x in g)-m6))
    add('市場',(d0,m3,m6))
print('形成時点',len(forms),forms and (dates[forms[0]],dates[forms[-1]]))
print(f"{'選び方':18s} {'3か月(市場比)':>12s} {'勝率':>6s} {'6か月(市場比)':>12s} {'勝率':>6s}")
for k,v in res.items():
    if k=='市場': continue
    a3=[x[1] for x in v]; a6=[x[2] for x in v]
    print(f"{k:18s} {statistics.mean(a3)*100:+10.2f}% {sum(1 for x in a3 if x>0)}/{len(a3):<3} {statistics.mean(a6)*100:+10.2f}% {sum(1 for x in a6 if x>0)}/{len(a6)}")
mk=res['市場']; print('市場平均の騰落 3か月',f"{statistics.mean(x[1] for x in mk)*100:+.2f}%",'6か月',f"{statistics.mean(x[2] for x in mk)*100:+.2f}%")
# by market regime: market 3m return sign
for name,cond in [('市場が下げた時点（3か月）',lambda m:m<0),('市場が上げた時点（3か月）',lambda m:m>=0)]:
    sel={d for d,m,_ in mk if cond(m)}
    print(name,len(sel))
    for k in ['新方式（安全柵あり）','新方式（安全柵なし）','強さ上位20','過熱銘柄']:
        a=[x[1] for x in res[k] if x[0] in sel]
        if a: print(f"   {k:18s} 3か月 市場比 {statistics.mean(a)*100:+.2f}% 勝率{sum(1 for x in a if x>0)}/{len(a)}")


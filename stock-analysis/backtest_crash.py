#!/usr/bin/env python3
"""「強い株が暴落したときに買う」の過去検証（2022-10〜2026-03）。
(B) 2か月前に強い株上位100だった銘柄が、52週高値から大きく下げたときに買った場合（2週間おき）と、
(A) TOPIX連動ETF（1306）が60日高値から−10%以下に下げた暴落日に、暴落前の強い株などを買った場合を調べる。
先に fetch_long.py と backtest_features.py を実行しておく。結果は reports/backtest_20261006.md の「7.」。
"""
import sys,os,statistics,pickle
sys.path.insert(0,'.')
import fetch_prices
from score import sma
F=pickle.load(open('data/backtest_features.pkl','rb'))
D=sorted(F)
def pct(rows,key):
    v=sorted(rows,key=lambda x:x[key]); n=len(v)
    return {x['c']:r/(n-1) for r,x in enumerate(v)}
def strong100(rows):
    a=pct(rows,'mom6'); b=pct(rows,'high52')
    return sorted([x for x in rows if x['dev200']>0],key=lambda x:-(a[x['c']]+b[x['c']]))[:100]
print('■ (B) 2か月前に強い株上位100だった銘柄が、高値から大きく下げた時に買う（2022-10〜2026-03、2週間おき）')
res={}
for i in range(6,len(D)):
    d,dp=D[i],D[i-6]
    prev={x['c'] for x in strong100(F[dp])}
    rows=F[d]; m3=statistics.mean(x['f3'] for x in rows); m6=statistics.mean(x['f6'] for x in rows)
    cur={x['c']:x for x in rows}
    for name,lo,hi in [('高値から−10〜−20%',-.20,-.10),('高値から−20〜−30%',-.30,-.20),('高値から−30%以上',-9,-.30)]:
        g=[cur[c] for c in prev if c in cur and lo<cur[c]['high52']-1<=hi]
        if g: res.setdefault(name,[]).extend([(x['f3']-m3,x['f6']-m6,x['f6']) for x in g])
    g=[cur[c] for c in prev if c in cur and cur[c]['high52']-1>-.05]
    res.setdefault('参考：高値から−5%以内（崩れていない）',[]).extend([(x['f3']-m3,x['f6']-m6,x['f6']) for x in g])
for k,v in res.items():
    print(f"  {k:26s} 件数{len(v):5d} 3か月 市場比{statistics.mean(a for a,_,_ in v)*100:+.1f}% 6か月 市場比{statistics.mean(b for _,b,_ in v)*100:+.1f}% 6か月で市場に勝った割合{sum(1 for _,b,_ in v if b>0)/len(v)*100:.0f}% 6か月で−30%以下になった割合{sum(1 for *_,c in v if c<=-.3)/len(v)*100:.0f}%")
print('\n■ (A) 相場全体の暴落（TOPIX連動ETFが60日高値から−10%以下に下げた最初の日）')
rows,_=fetch_prices.download('1306','5y'); dd=[r[0] for r in rows]; cl=[r[4] for r in rows]
ev=[]; last=None
for k in range(60,len(cl)-126):
    hi=max(cl[k-60:k+1])
    if cl[k]/hi-1<=-.10 and (last is None or k-last>120) and dd[k]>='2022-10-01':
        ev.append(k); last=k
for k in ev:
    d=dd[k]; print(f"  暴落日 {d}（TOPIX 60日高値から{(cl[k]/max(cl[k-60:k+1])-1)*100:.1f}%） TOPIXのその後 3か月{(cl[k+63]/cl[k]-1)*100:+.1f}% 6か月{(cl[k+126]/cl[k]-1)*100:+.1f}%")

# ---- (A) 暴落日の買い方の比較
from backtest_strength import load_all, split_jump, H3, H6
from score import sma
from screen_select import timing, HOT_DEV200, HOT_RSI

uni,data=load_all()
idx={c:{str(x['date']):i for i,x in enumerate(b)} for c,b in data.items()}
tp,_=fetch_prices.download('1306','5y'); td=[r[0] for r in tp]; tc=[r[4] for r in tp]
def rows_at(d, need_fwd=True):
    out=[]
    for c,b in data.items():
        i=idx[c].get(d)
        if i is None or i<260 or (need_fwd and i+H6>=len(b)): continue
        h=b[:i+1]
        if sum(x['close']*x['volume'] for x in h[-25:])/25<1e8 or split_jump(h[-260:]) or (need_fwd and split_jump(b[i:i+H6+1])): continue
        cl=[x['close'] for x in h]
        out.append(dict(c=c,n=uni[c]['銘柄名'],h=h,i=i,b=b,mom6=cl[-1]/cl[-127]-1,high52=cl[-1]/max(x['high'] for x in h[-250:]),above=cl[-1]>sma(cl,200,len(cl)-1)))
    return out
def strong(rows,n):
    for k in('mom6','high52'):
        for r,x in enumerate(sorted(rows,key=lambda x:x[k])): x['p'+k]=r/(len(rows)-1)
    return sorted([x for x in rows if x['above']],key=lambda x:-(x['pmom6']+x['phigh52']))[:n]
def fwd(c,d,h):
    b=data[c]; i=idx[c].get(d)
    return b[i+h]['close']/b[i]['close']-1
for d in ['2024-08-02','2024-08-05','2025-04-04','2025-04-07','2026-03-23']:
    k=td.index(d); pre=td[k-20]
    now=rows_at(d); nowc={x['c'] for x in now}
    pre_rows=rows_at(pre,need_fwd=False); pool=[x for x in strong(pre_rows,100) if x['c'] in nowc]
    drop={x['c']:x['b'][idx[x['c']][d]]['close']/x['b'][idx[x['c']][pre]]['close']-1 for x in pool}
    m3=statistics.mean(fwd(x['c'],d,H3) for x in now); m6=statistics.mean(fwd(x['c'],d,H6) for x in now)
    G={'暴落前の強い株 上位20':pool[:20],
       '暴落前の強い株100のうち 下げが大きかった20':sorted(pool,key=lambda x:drop[x['c']])[:20],
       '暴落前の強い株100のうち 下げが小さかった20':sorted(pool,key=lambda x:-drop[x['c']])[:20]}
    cur=strong(now,100)
    for x in cur: t=timing(x['h']); x['t']=t['score']; x['hot']=t['dev200']>HOT_DEV200 or t['rsi']>=HOT_RSI
    G['暴落日に今の方式で選んだ20']=sorted([x for x in cur if not x['hot']],key=lambda x:(-x['t'],-(x['pmom6']+x['phigh52'])))[:20]
    print(f"\n=== {d}（TOPIXのその後 3か月{(tc[k+63]/tc[k]-1)*100:+.1f}% 6か月{(tc[k+126]/tc[k]-1)*100:+.1f}% / 市場平均 3か月{m3*100:+.1f}% 6か月{m6*100:+.1f}%）")
    for name,g in G.items():
        r3=[fwd(x['c'],d,H3) for x in g]; r6=[fwd(x['c'],d,H6) for x in g]
        print(f"  {name:28s} 暴落中の下げ{statistics.mean(drop.get(x['c'],0) for x in g)*100 if name!='暴落日に今の方式で選んだ20' else 0:+6.1f}%  3か月{statistics.mean(r3)*100:+6.1f}%  6か月{statistics.mean(r6)*100:+6.1f}%  最悪{min(r6)*100:+.0f}%")

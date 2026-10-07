#!/usr/bin/env python3
"""選び方の比較用に、2022-10以降の2週間おきの各時点・各銘柄の指標と、3か月後・6か月後の騰落率を計算して
data/backtest_features.pkl に保存する。先に fetch_long.py で5年分の日足を取得しておく（約20分）。"""
import os,sys,math,pickle,statistics
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from backtest_strength import load_all, split_jump, H3, H6
from score import sma, rsi_wilder, find_resistances
uni,data=load_all()
dates=[str(b['date']) for b in data['7203']]
idx={c:{str(x['date']):i for i,x in enumerate(b)} for c,b in data.items()}
forms=[i for i in range(260,len(dates)-H6) if '2022-10-01'<=dates[i]][::10]
out={}
for fi in forms:
    d0=dates[fi]; rows=[]
    for c,b in data.items():
        i=idx[c].get(d0)
        if i is None or i<260 or i+H6>=len(b): continue
        h=b[:i+1]
        turn=sum(x['close']*x['volume'] for x in h[-25:])/25
        if turn<1e8 or split_jump(h[-260:]) or split_jump(b[i:i+H6+1]): continue
        cl=[x['close'] for x in h]; c0=cl[-1]
        lr=[math.log(cl[k]/cl[k-1]) for k in range(len(cl)-126,len(cl))]
        # trend consistency: share of positive weeks over 26 weeks
        wk=[cl[-1-5*k]/cl[-6-5*k]-1 for k in range(26)]
        # R2 of log price on time over 126 days
        y=[math.log(v) for v in cl[-126:]]; n=len(y); xm=(n-1)/2; ym=sum(y)/n
        sxy=sum((k-xm)*(y[k]-ym) for k in range(n)); sxx=sum((k-xm)**2 for k in range(n)); syy=sum((v-ym)**2 for v in y)
        r2=(sxy*sxy/(sxx*syy)) if syy>0 else 0
        rs=find_resistances(h,c0); near=rs[0]['distance_pct'] if rs else None
        ma5=sma(cl,5,len(cl)-1); ma5p=sma(cl,5,len(cl)-2)
        rows.append(dict(c=c,ind=uni[c]['業種'],turn=turn,
            mom6=c0/cl[-127]-1, mom12_1=c0/cl[-253]*0+ (cl[-22]/cl[-253]-1) if len(cl)>=253 else None,
            mom3=c0/cl[-64]-1, high52=c0/max(x['high'] for x in h[-250:]), vol=statistics.pstdev(lr)*math.sqrt(250),
            r20=c0/cl[-21]-1, dev25=c0/sma(cl,25,len(cl)-1)-1, ma200=sma(cl,200,len(cl)-1), dev200=c0/sma(cl,200,len(cl)-1)-1,
            rsi=rsi_wilder(cl[-120:]), upwk=sum(1 for v in wk if v>0)/26, r2=r2, slope=sxy/sxx*250 if sxx else 0,
            near=near, ma5up=ma5>ma5p,
            f3=b[i+H3]['close']/c0-1, f6=b[i+H6]['close']/c0-1))
    out[d0]=rows
    print(d0,len(rows),flush=True)
pickle.dump(out,open('os.path.join(HERE, 'data', 'backtest_features.pkl')','wb'))

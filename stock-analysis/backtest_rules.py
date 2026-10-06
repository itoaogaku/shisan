#!/usr/bin/env python3
"""売りルールの比較（過去検証）。新方式の20銘柄を等金額で持ち、ルールごとの3か月後・6か月後の騰落率を比べる。

使い方: python3 stock-analysis/backtest_rules.py   （先に fetch_long.py で5年分の日足を取得）
期間は2022-10〜2025-09の2週間おき72時点と、2024-10-07・2025-10-06。売りは翌営業日の始値、売った後は現金（買い直さない）。
結果は reports/backtest_20261006.md にまとめた。
"""
import sys,statistics,json
sys.path.insert(0,'.')
from backtest_strength import load_all, split_jump, H3, H6
from score import sma
from screen_select import timing, HOT_DEV200, HOT_RSI
uni,data=load_all()
dates=[str(b['date']) for b in data['7203']]
idx={c:{str(x['date']):i for i,x in enumerate(b)} for c,b in data.items()}
def atr(b,i,n=20):
    tr=[max(b[k]['high'],b[k-1]['close'])-min(b[k]['low'],b[k-1]['close']) for k in range(i-n+1,i+1)]
    return sum(tr)/n
def run(b,i0,H,rule):
    cl=[x['close'] for x in b]; buy=cl[i0]; peak=buy; a0=atr(b,i0)
    for i in range(i0+1,i0+H+1):
        peak=max(peak,cl[i]); c=cl[i]; hit=False
        if rule=='hold': pass
        elif rule=='200日線': hit=c<sma(cl,200,i)
        elif rule=='50日線': hit=c<sma(cl,50,i)
        elif rule=='25日線': hit=c<sma(cl,25,i)
        elif rule=='買値−10%': hit=c<buy*0.9
        elif rule=='高値から−15%': hit=c<peak*0.85
        elif rule=='高値−3ATR': hit=c<peak-3*atr(b,i)
        elif rule=='買値−2ATR→高値−3ATR': hit=c<max(buy-2*a0, peak-3*atr(b,i))
        if hit and i+1<=i0+H: return b[i+1]['open']/buy-1, True
    return cl[i0+H]/buy-1, False
RULES=['hold','200日線','50日線','25日線','買値−10%','高値から−15%','高値−3ATR','買値−2ATR→高値−3ATR']
def picks(d0):
    rows=[]
    for c,b in data.items():
        i=idx[c].get(d0)
        if i is None or i<260 or i+H6>=len(b): continue
        h=b[:i+1]
        if sum(x['close']*x['volume'] for x in h[-25:])/25<1e8: continue
        if split_jump(h[-260:]) or split_jump(b[i:i+H6+1]): continue
        cl=[x['close'] for x in h]
        rows.append(dict(c=c,i=i,h=h,mom6=cl[-1]/cl[-127]-1,high52=cl[-1]/max(x['high'] for x in h[-250:]),above=cl[-1]>sma(cl,200,len(cl)-1),
                         m3=b[i+H3]['close']/cl[-1]-1,m6=b[i+H6]['close']/cl[-1]-1))
    n=len(rows)
    for k in('mom6','high52'):
        for r,x in enumerate(sorted(rows,key=lambda x:x[k])): x['s']=x.get('s',0)+r/(n-1)
    pool=sorted([x for x in rows if x['above']],key=lambda x:-x['s'])[:100]
    for x in pool:
        t=timing(x['h']); x['t']=t['score']; x['hot']=t['dev200']>HOT_DEV200 or t['rsi']>=HOT_RSI
    sel=sorted([x for x in pool if not x['hot']],key=lambda x:(-x['t'],-x['s']))[:20]
    return sel, statistics.mean(x['m3'] for x in rows), statistics.mean(x['m6'] for x in rows)
def main():
    forms=[i for i in range(260,len(dates)-H6) if '2022-10-01'<=dates[i]<='2025-09-30'][::10]
    special=['2024-10-07','2025-10-06']
    R={r:{'3':[], '6':[], 'sold6':[]} for r in RULES}; M=[]; S={}
    for d0 in [dates[i] for i in forms]+special:
        sel,m3,m6=picks(d0)
        for r in RULES:
            a3=[run(data[x['c']],x['i'],H3,r)[0] for x in sel]
            o6=[run(data[x['c']],x['i'],H6,r) for x in sel]
            p3=statistics.mean(a3); p6=statistics.mean(v for v,_ in o6)
            if d0 in special: S.setdefault(d0,{})[r]=(p3,p6,sum(1 for _,s in o6 if s))
            else:
                R[r]['3'].append(p3); R[r]['6'].append(p6); R[r]['sold6'].append(sum(1 for _,s in o6 if s))
        if d0 not in special: M.append((m3,m6))
    print(f"72時点（2022-10〜2025-09）。20銘柄を等金額で持った場合の騰落率")
    print(f"{'ルール':22s}{'3か月平均':>9s}{'6か月平均':>9s}{'6か月最悪':>9s}{'6か月で-15%以下の回数':>16s}{'売った銘柄/20':>12s}")
    for r in RULES:
        v6=R[r]['6']
        print(f"{r:22s}{statistics.mean(R[r]['3'])*100:+8.2f}%{statistics.mean(v6)*100:+8.2f}%{min(v6)*100:+8.1f}%{sum(1 for v in v6 if v<=-.15):>12d}{statistics.mean(R[r]['sold6']):>14.1f}")
    print(f"{'市場平均（参考）':22s}{statistics.mean(m for m,_ in M)*100:+8.2f}%{statistics.mean(m for _,m in M)*100:+8.2f}%{min(m for _,m in M)*100:+8.1f}%")
    for d,v in S.items():
        print('\n',d,'（400万円の6か月後）')
        for r in RULES: print(f"   {r:22s} 3か月 {4e6*(1+v[r][0])/1e4:6.1f}万円  6か月 {4e6*(1+v[r][1])/1e4:6.1f}万円  売った{v[r][2]}/20")
    

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""業績（四半期の実績）を使った選び方のルールを、2023-09〜2026-03の65時点で比べる。

先に backtest_features.py と fetch_quarterly.py（候補銘柄の四半期業績）を実行しておく。
各時点では、四半期末から50日（第4四半期は55日）たった決算だけを使う（未来の情報を使わない）。
当時の会社予想はないため、予想を使う項目（年間の成長・進捗率・予想PER・PEG）は検証できない。
業績データがない銘柄（銀行など）はどのルールでも残す。結果は reports/backtest_20261006.md の「6.」。
"""
import os,json,pickle,statistics,sys,datetime as dt
sys.argv=['x']
BASE=os.path.dirname(os.path.abspath(__file__))
_f=__file__
__file__=BASE+'/backtest_variants.py'
exec(open(BASE+'/backtest_variants.py').read().split("V0={")[0])
QD=BASE+'/data/quarterly'
def qlist(code):
    p=f'{QD}/{code}.json'
    if not os.path.exists(p): return None
    d=json.load(open(p,encoding='utf-8'))
    smet=next((k for k in d if k in('売上高','営業収益','売上収益','経常収益')),None)
    if '営業利益' not in d or not smet: return None
    out=[]
    for fy,vals in d['営業利益'].items():
        if not __import__('re').fullmatch(r'\d{4}/\d{2}',fy): continue  # 変則決算の期は四半期がそろわないので使わない
        y,m=map(int,fy.split('/'))
        sv=d[smet].get(fy,[None]*4)
        for k in range(4):
            mm=m-(3-k)*3; yy=y
            while mm<=0: mm+=12; yy-=1
            end=dt.date(yy,mm,28)
            avail=end+dt.timedelta(days=55 if k==3 else 50)
            out.append((end,avail,sv[k],vals[k]))
    out.sort()
    return out
Q={}
def fund(code,d0):
    if code not in Q: Q[code]=qlist(code)
    ql=Q[code]
    if not ql: return None
    T=dt.date.fromisoformat(d0)
    av=[q for q in ql if q[1]<=T and q[3] is not None]
    if len(av)<8: 
        if len(av)<5: return None
    def yoy(a,b):
        if a is None or b is None: return None
        if b>0: return a/b-1
        return 1.0 if a>0 else -1.0
    L,P=av[-1],av[-2]
    ya=next((q for q in av if q[0].year==L[0].year-1 and q[0].month==L[0].month),None)
    yp=next((q for q in av if q[0].year==P[0].year-1 and q[0].month==P[0].month),None)
    r={'op':L[3],'opy':yoy(L[3],ya[3]) if ya else None,'sy':yoy(L[2],ya[2]) if ya else None,'opy_prev':yoy(P[3],yp[3]) if yp else None}
    if len(av)>=8:
        t1=sum(q[3] for q in av[-4:]); t0=sum(q[3] for q in av[-8:-4]); r['ttm']=yoy(t1,t0)
    else: r['ttm']=None
    return r
def sel_f(rows,d0,rule):
    above=sorted([x for x in rows if x['dev200']>0],key=lambda x:-(x['p_m6']+x['p_h']))[:150]
    for x in above: x['fd']=fund(x['c'],d0)
    def keep(x):
        f=x['fd']
        if f is None: return True
        if rule=='F1': return not((f['opy'] is not None and f['opy']<0) or f['op']<0)
        if rule=='F2': return f['opy'] is None or (f['opy']>=.10 and (f['sy'] or 0)>0)
        if rule=='F3': return f['opy'] is None or f['opy_prev'] is None or (f['opy']>0 and f['opy_prev']>0)
        if rule=='F5': return f['ttm'] is None or f['ttm']>0
        return True
    if rule=='F4':
        g=[x for x in above if x['fd'] and x['fd']['opy'] is not None]
        for r_,x in enumerate(sorted(g,key=lambda x:min(x['fd']['opy'],3))): x['pg']=r_/max(1,len(g)-1)
        for x in above: x.setdefault('pg',0.5)
        pool=sorted(above,key=lambda x:-(x['p_m6']+x['p_h']+x['pg']))[:100]
        for x in above: x.pop('pg',None)
    else:
        pool=[x for x in above if keep(x)][:100]
    unk=sum(1 for x in pool if x['fd'] is None or x['fd']['opy'] is None)
    cand=sorted([x for x in pool if not x['hot']],key=lambda x:(-x['t'],-(x['p_m6']+x['p_h'])))
    return cand[:20],unk
RULES={'F0':'現行（株価だけ）','F1':'1 直近四半期が減益なら除外','F2':'2 増収かつ営業利益+10%以上','F3':'3 2四半期連続の増益','F4':'4 増益率を強さに加える','F5':'5 直近1年の営業利益が増加'}
PER={'P1 2023-09〜2024-09':('2023-09','2024-09-99'),'P2 2024-10〜2025-09':('2024-10','2025-09-99'),'P3 2025-10〜2026-03':('2025-10','2026-03-99')}
res={r:{} for r in RULES}; unk={r:[] for r in RULES}
for d0,rows in F.items():
    if d0<'2023-09-01': continue
    m6=statistics.mean(x['f6'] for x in rows); m3=statistics.mean(x['f3'] for x in rows)
    for r in RULES:
        s,u=sel_f(rows,d0,r); unk[r].append(u)
        res[r][d0]=(statistics.mean(x['f3'] for x in s)-m3,statistics.mean(x['f6'] for x in s)-m6,statistics.mean(x['f6'] for x in s))
print(f"{'ルール':24s}"+"".join(f"| {p[:2]} 6か月超過 勝率 最悪 効率 " for p in PER)+"| 全体 3か月 6か月")
for r,name in RULES.items():
    line=f"{name:24s}"
    for p,(a,b) in PER.items():
        v=[x for d,x in res[r].items() if a<=d<=b]; e=[x[1] for x in v]; ab=[x[2] for x in v]
        sd=statistics.pstdev(e); line+=f"| {statistics.mean(e)*100:+5.1f}% {sum(1 for x in e if x>0)}/{len(e)} {min(ab)*100:+5.1f}% {statistics.mean(e)/sd if sd else 0:+.2f} "
    allv=list(res[r].values())
    line+=f"| {statistics.mean(x[0] for x in allv)*100:+.1f}% {statistics.mean(x[1] for x in allv)*100:+.1f}%  業績不明 平均{statistics.mean(unk[r]):.0f}/100"
    print(line)

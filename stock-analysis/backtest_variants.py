#!/usr/bin/env python3
"""銘柄の選び方の候補を、3つの期間（A 2022-10〜2024-03 / B 2024-04〜2025-09 / C 2025-10〜2026-03）で比べる。
先に backtest_features.py を実行する。結果は reports/backtest_20261006.md の「5. 選び方の比較」。
効率 = 市場平均を上回った幅の平均 ÷ そのばらつき（大きいほど安定して勝っている）。"""
import os,pickle,statistics,sys
F=pickle.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'backtest_features.pkl'),'rb'))
def pct(rows,key,name):
    v=[x for x in rows if x.get(key) is not None]
    for r,x in enumerate(sorted(v,key=lambda x:x[key])): x[name]=r/(len(v)-1)
    for x in rows: x.setdefault(name,0)
def timing(x):
    r20,d25,h=x['r20'],x['dev25'],x['high52']-1
    p=(30 if r20<0 else 25 if r20<.1 else 18 if r20<.2 else 5)
    p+=(25 if -.03<=d25<=.03 else 17 if d25<=.08 else 8)
    p+=(20 if h>=-.05 else 10 if h>=-.15 else 0)
    n=x['near']; p+=(15 if n is None or n>10 else 8 if n>5 else 3)
    p+=10 if x['ma5up'] else 0
    return p
def prep(rows):
    pct(rows,'mom6','p_m6'); pct(rows,'high52','p_h'); pct(rows,'mom12_1','p_m12'); pct(rows,'r2','p_r2'); pct(rows,'vol','p_vol')
    for x in rows:
        x['ram']=x['mom6']/x['vol'] if x['vol']>0 else 0
        x['t']=timing(x); x['hot']=x['dev200']>.6 or (x['rsi'] or 0)>=80
    pct(rows,'ram','p_ram')
for d,rows in F.items(): prep(rows)
def select(rows,strength,pool_n=100,cap=None,pool_filter=None,min_turn=0,k=20):
    above=[x for x in rows if x['close_above'] ] if False else [x for x in rows if x['dev200']>0 and x['turn']>=min_turn]
    if pool_filter: above=[x for x in above if pool_filter(x)]
    pool=sorted(above,key=lambda x:-strength(x))[:pool_n]
    cand=sorted([x for x in pool if not x['hot']],key=lambda x:(-x['t'],-strength(x)))
    if not cap: return cand[:k]
    out,cnt=[],{}
    for x in cand:
        if cnt.get(x['ind'],0)>=cap: continue
        out.append(x); cnt[x['ind']]=cnt.get(x['ind'],0)+1
        if len(out)==20: break
    return out
V0={
 '現行（6か月＋高値）':dict(strength=lambda x:x['p_m6']+x['p_h']),
 '1 値動きで割った強さ':dict(strength=lambda x:x['p_ram']+x['p_h']),
 '2 上がり方のなめらかさ':dict(strength=lambda x:x['p_m6']+x['p_h']+x['p_r2']),
 '3 12か月（直近1か月除く）':dict(strength=lambda x:x['p_m12']+x['p_h']),
 '4 同業種は3社まで':dict(strength=lambda x:x['p_m6']+x['p_h'],cap=3),
 '5 値動き上位1/4を除外':dict(strength=lambda x:x['p_m6']+x['p_h'],pool_filter=lambda x:x['p_vol']<.75),
 '6 売買代金5億円以上':dict(strength=lambda x:x['p_m6']+x['p_h'],min_turn=5e8),
}
V=dict(V0)
if len(sys.argv)>1:
    V.update(eval(open(sys.argv[1]).read()))  # 追加の候補（辞書）をファイルで渡せる
P={'A 2022-10〜2024-03（考える期間）':('2022-10','2024-03-99'),'B 2024-04〜2025-09（確認）':('2024-04','2025-09-99'),'C 2025-10〜2026-03（最近）':('2025-10','2026-03-99')}
def run(spec):
    res={}
    for d,rows in F.items():
        s=select(rows,**spec)
        m3=statistics.mean(x['f3'] for x in rows); m6=statistics.mean(x['f6'] for x in rows)
        res[d]=(statistics.mean(x['f3'] for x in s)-m3, statistics.mean(x['f6'] for x in s)-m6, statistics.mean(x['f6'] for x in s), len({x['ind'] for x in s}))
    return res
print(f"{'ルール':24s}" + "".join(f"| {p[:1]}: 6か月超過 勝率 最悪 効率 " for p in P))
for name,spec in V.items():
    r=run(spec); line=f"{name:24s}"
    for p,(a,b) in P.items():
        v=[x for d,x in r.items() if a<=d<=b]
        e6=[x[1] for x in v]; ab=[x[2] for x in v]
        eff=statistics.mean(e6)/statistics.pstdev(e6) if statistics.pstdev(e6)>0 else 0
        line+=f"| {statistics.mean(e6)*100:+5.1f}% {sum(1 for x in e6 if x>0)}/{len(e6)} {min(ab)*100:+5.1f}% {eff:+.2f} "
    print(line)

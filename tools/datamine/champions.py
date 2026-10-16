"""Print base and Mayhem (Kiwi/ARAM override) changes per champion, PBE vs live.

Usage: python3 champions.py DATA_DIR
Arena, URF and other mode overrides are skipped.
"""
import json,os,sys,re
ROOT=sys.argv[1]
from jsondiff import diff, load, get, r
SKIPK={'mSpellPassives','mSpellTags','AudioBankPaths','mHitBoneName','cherry','URF','SWIFTPLAY','{a110bc47}','ULTBOOK','ONEFORALL','NEXUSBLITZ','{66185ec4}','mClientData','RecSpellRankUpInfos','outlineBBoxExpansion','mConstants','mHitEffectName','bHaveHitEffect','bHaveHitBone'}
def overrides(spell):
    out={}
    for mode in ('ARAM','Kiwi'):
        for dv in ((spell.get('DataValuesModeOverride') or {}).get(mode) or {}).get('SpellDataValues',[]):
            out.setdefault(dv['name'],[]).append(mode)
    return out
for n in sorted(f[:-5] for f in os.listdir(os.path.join(ROOT,'pbe','ch'))):
    if n.startswith('jade'): continue
    B=load(f'{ROOT}/pbe/ch/{n}.json'); A=load(f'{ROOT}/latest/ch/{n}.json')
    rows=[]
    for p,a,b in diff(f'{ROOT}/latest/ch/{n}.json',f'{ROOT}/pbe/ch/{n}.json'):
        if any(isinstance(k,str) and k in SKIPK for k in p): continue
        if isinstance(p[0],str) and p[0].startswith('{'): continue
        if r(a)==r(b): continue
        if p[-1]=='DataValuesModeOverride' and not any(m in (x or {}) for x in (a,b) for m in ('Kiwi','ARAM')): continue
        # f9c2333e = effect amount mode overrides; keep only Kiwi/ARAM ones
        if '{f9c2333e}' in p and not any(k in ('Kiwi','ARAM') for k in p): continue
        top=p[0].split('/'); label='/'.join(top[3:] if len(top)>3 else top[2:])+'/'+'/'.join(str(k) for k in p[1:])
        label=label.replace('mSpell/','')
        note=''
        if len(p)>=4 and p[-1]=='values' and p[-3]=='DataValues':
            sp=get(B,p[:-3]); nm=sp['DataValues'][p[-2]]['name']
            label=label.replace(f'DataValues/{p[-2]}/values',f'{nm}')
            ov=overrides(sp).get(nm)
            if ov: note=f'   [MASKED in Mayhem by {"/".join(ov)} override]'
        rows.append(f'  {label}: {json.dumps(r(a))[:300]} -> {json.dumps(r(b))[:300]}{note}')
    if rows: print(n); print('\n'.join(rows))

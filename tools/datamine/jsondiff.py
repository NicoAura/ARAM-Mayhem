import json
def load(p):
    try: return json.load(open(p))
    except Exception: return None
def walk(a,b,path,out):
    if type(a)!=type(b): out.append((path,a,b)); return
    if isinstance(a,dict):
        for k in set(a)|set(b):
            if k not in a: out.append((path+(k,),None,b[k]))
            elif k not in b: out.append((path+(k,),a[k],None))
            else: walk(a[k],b[k],path+(k,),out)
    elif isinstance(a,list):
        if len(a)!=len(b) or any(not isinstance(x,(dict,list)) for x in a+b):
            if a!=b: out.append((path,a,b))
        else:
            for i,(x,y) in enumerate(zip(a,b)): walk(x,y,path+(i,),out)
    elif a!=b: out.append((path,a,b))
def diff(p1,p2):
    a,b=load(p1),load(p2); out=[]
    if a is None or b is None: return [(('LOADFAIL',),a is None,b is None)]
    walk(a,b,(),out); return out
def get(o,path):
    for k in path: o=o[k]
    return o
def r(v):
    if isinstance(v,float): return float(f'{v:.4g}')
    if isinstance(v,list): return [r(x) for x in v]
    if isinstance(v,dict): return {k:r(x) for k,x in v.items() if k!='__type'}
    return v

import hashlib
import json
import os
from pathlib import Path
import sys
import time
import urllib.request

sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'backend'))
from app import probe
from core import kept_intervals

root=Path(__file__).resolve().parent.parent
requests=list((Path(os.environ['APPDATA'])/'fala-corte/data/jobs').glob('*.request.json'))
payloads=[(p.stat().st_mtime,json.loads(p.read_text('utf-8'))) for p in requests if p.stat().st_size>1000]
payload=max((entry for entry in payloads if entry[1].get('kind')=='export' and len(entry[1].get('cuts',[]))==779),key=lambda entry:entry[0])[1]
cuts=payload['cuts']
source=max((p for p in (root/'.local/imports').glob('*.mp4') if p.stat().st_size>2e9),key=lambda p:p.stat().st_mtime)

def api(route,body=None,method=None):
    request=urllib.request.Request('http://127.0.0.1:8769'+route,data=json.dumps(body).encode() if body else None,method=method,headers={'Authorization':'Bearer development-local','Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)

video=api('/videos',{'path':str(source)})
assert sum(b-a for a,b in kept_intervals(cuts,video['duration'])) > 1000, 'Fixture incompleta: nao representa o video completo'
output=root/'outputs/exportacao-779-nvidia.mp4'
start=time.perf_counter()
identifier=api('/jobs',{'kind':'export','videoId':video['id'],'cuts':cuts,'output':str(output)})['id']
last=0
try:
    while True:
        state=api('/jobs/'+identifier)
        elapsed=time.perf_counter()-start
        if elapsed-last>=20:
            print(json.dumps({'elapsedSeconds':round(elapsed,1),'progress':state.get('progress'),'speed':state.get('speed'),'message':state.get('message')}),flush=True)
            last=elapsed
        if state['state']=='done':break
        if state['state']=='error':raise RuntimeError(state['message'])
        if elapsed>900:raise TimeoutError('Teste completo excedeu 15 minutos')
        time.sleep(.5)
except BaseException:
    api('/jobs/'+identifier,method='DELETE')
    raise
info=probe(output)
expected=sum(b-a for a,b in kept_intervals(cuts,video['duration']))
assert abs(info['duration']-expected)<.15,(info,expected)
assert info['width']==1920 and info['height']==1080,info
report={'sourceGB':source.stat().st_size/1e9,'sourceSeconds':video['duration'],'cuts':len(cuts),'elapsedSeconds':round(time.perf_counter()-start,3),'output':info,'processing':state['result'],'complete':True}
(root/'outputs/exportacao-completa-teste.json').write_text(json.dumps(report,indent=2),'utf-8')
print(json.dumps(report),flush=True)

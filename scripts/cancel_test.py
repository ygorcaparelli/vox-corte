import json
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from integration_test import api, task, OUT

v = api('/videos', {'path':str(OUT / 'teste-original.mp4')})
destination = OUT / 'cancelado.mp4'
identifier = api('/jobs', {'kind':'export','videoId':v['id'],'cuts':[],'output':str(destination)})['id']
for _ in range(200):
    state = api('/jobs/'+identifier)
    if state.get('workerPid'):
        break
    time.sleep(.01)
assert state['state']=='running', state
start=time.monotonic()
api('/jobs/'+identifier, method='DELETE')
assert time.monotonic()-start<5
state=api('/jobs/'+identifier)
assert state['state']=='cancelled',state
assert not destination.exists()
assert not list(OUT.glob('cancelado.*.partial.mp4'))
print('Cancelamento OK: processo encerrado e nenhuma exportação parcial.')
speech = api('/videos',{'path':str(OUT / 'fala-teste.mp4')})
result = task({'kind':'transcribe','videoId':speech['id'],'model':'tiny','language':'en','device':'cuda'})
assert len(result['words'])>10,result
print('NVIDIA/fallback OK:',result['device'],len(result['words']),'palavras.')

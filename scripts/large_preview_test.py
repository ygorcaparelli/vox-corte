import json
import time
import urllib.request
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'backend'))
from app import probe

root = Path(__file__).resolve().parent.parent
source = max((p for p in (root / '.local/imports').glob('*.mp4') if p.stat().st_size > 2e9), key=lambda p: p.stat().st_mtime)

def api(route, payload=None):
    request = urllib.request.Request('http://127.0.0.1:8769'+route, data=json.dumps(payload).encode() if payload else None, headers={'Authorization':'Bearer development-local','Content-Type':'application/json'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)

start = time.perf_counter()
video = api('/videos', {'path': str(source)})
metadata_seconds = time.perf_counter()-start
cuts = []
for request in (root / '.local/jobs').glob('*.request.json'):
    payload = json.loads(request.read_text('utf-8'))
    if payload.get('kind') == 'preview' and len(payload.get('cuts', [])) == 779:
        cuts = [{'start': c['start'], 'end': min(c['end'],30)} for c in payload['cuts'] if c['start'] < 30]
        break
cuts.append({'start':30, 'end':video['duration']})
start = time.perf_counter()
identifier = api('/jobs', {'kind':'preview', 'videoId':video['id'], 'cuts':cuts})['id']
for _ in range(900):
    result = api('/jobs/'+identifier)
    if result['state'] == 'error':
        raise RuntimeError(result['message'])
    if result['state'] == 'done':
        break
    time.sleep(.2)
else:
    raise TimeoutError('Previa de 30 s nao terminou')
info = probe(result['result']['path'])
assert info['width'] <= 960 and info['fps'] <= 30.1, info
assert abs(info['duration']-result['result']['duration']) < .15, info
report = {'sourceGB':source.stat().st_size/1e9, 'sourceDuration':video['duration'], 'metadataSeconds':round(metadata_seconds,3), 'sampleOriginalSeconds':30, 'sampleCuts':len(cuts), 'previewSeconds':round(time.perf_counter()-start,3), 'preview':info, 'full33MinuteRenderTested':False}
(root / 'outputs/large-preview-test.json').write_text(json.dumps(report,indent=2),'utf-8')
print(json.dumps(report))

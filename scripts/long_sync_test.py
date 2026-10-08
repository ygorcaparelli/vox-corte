"""Compare audio alignment at three positions of the complete local export."""
import json
import os
from pathlib import Path
import subprocess
import sys

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'backend'))
from app import ffmpeg
from core import kept_intervals

requests = (Path(os.environ['APPDATA']) / 'fala-corte/data/jobs').glob('*.request.json')
payloads = [(p.stat().st_mtime, json.loads(p.read_text('utf-8'))) for p in requests]
payload = max((x for x in payloads if x[1].get('kind') == 'export' and len(x[1].get('cuts', [])) == 779), key=lambda x: x[0])[1]
report = json.loads((ROOT / 'outputs/exportacao-completa-teste.json').read_text('utf-8'))
source = max((p for p in (ROOT / '.local/imports').glob('*.mp4') if p.stat().st_size > 2e9), key=lambda p: p.stat().st_mtime)
output = ROOT / 'outputs/exportacao-779-nvidia.mp4'
positions = []
elapsed = 0
for start, end in kept_intervals(payload['cuts'], report['sourceSeconds']):
    if end - start > 1.5:
        positions.append((elapsed + .25, start + .25))
    elapsed += end - start

def audio(path, start, duration):
    raw = subprocess.run([ffmpeg(), '-v', 'error', '-ss', str(start), '-i', str(path), '-t', str(duration), '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)

results = []
for fraction in [.1, .5, .9]:
    edited, original = min(positions, key=lambda x: abs(x[0] - elapsed * fraction))
    reference = audio(source, original, .7)
    rendered = audio(output, edited - .15, 1)
    correlations = np.correlate(rendered, reference, 'valid')
    shift = int(np.argmax(correlations))
    aligned = rendered[shift:shift + len(reference)]
    correlation = float(np.corrcoef(reference, aligned)[0, 1])
    offset = shift / 8000 - .15
    assert correlation > .8 and abs(offset) < .08, (edited, correlation, offset)
    results.append({'editedSeconds': edited, 'originalSeconds': original, 'audioCorrelation': correlation, 'offsetSeconds': offset})
report['audioAlignmentSamples'] = results
(ROOT / 'outputs/exportacao-completa-teste.json').write_text(json.dumps(report, indent=2), 'utf-8')
print(json.dumps(results, indent=2))

import json
import sys
import subprocess
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'backend'))
from app import ffmpeg
from integration_test import api, task, OUT

source = OUT / 'fala-teste.flac'
if not source.exists():
    raise RuntimeError('Disponibilize a fixture tests/data/jfk.flac do repositório SYSTRAN/faster-whisper em outputs/fala-teste.flac.')
video = OUT / 'fala-teste.mp4'
subprocess.run([ffmpeg(),'-v','error','-y','-f','lavfi','-i','testsrc2=s=640x360:r=25','-i',str(source),'-shortest','-c:v','libx264','-c:a','aac',str(video)],check=True)
v = api('/videos', {'path':str(video)})
result = task({'kind':'transcribe','videoId':v['id'],'model':'tiny','language':'auto','device':'cpu'})
assert len(result['words']) > 10, result
assert len(set(w['id'] for w in result['words'])) == len(result['words'])
assert all(0 <= w['start'] <= w['end'] <= v['duration']+.1 for w in result['words'])
text = ' '.join(w['text'] for w in result['words'])
assert 'country' in text.lower(), text
(OUT / 'transcricao-teste.json').write_text(json.dumps(result,indent=2), 'utf-8')
print('Transcrição offline OK:', result['language'], len(result['words']), 'palavras com IDs e timestamps.')
print(text)

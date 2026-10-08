"""Teste real de FFmpeg e API: duração, frames, áudio e original intacto."""
import hashlib
import json
import math
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'backend'))
from app import ffmpeg, probe

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'outputs'
OUT.mkdir(exist_ok=True)
SOURCE, EXPORT = OUT / 'teste-original.mp4', OUT / 'teste-editado.mp4'
FF = ffmpeg()
API_URL = os.environ.get('FALA_TEST_URL', 'http://127.0.0.1:8765')
# Vermelho/440 Hz, verde/880 Hz, azul/1320 Hz. O corte remove a parte verde.
subprocess.run([FF, '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=red:s=320x180:r=25:d=2', '-f', 'lavfi', '-i', 'color=green:s=320x180:r=25:d=2', '-f', 'lavfi', '-i', 'color=blue:s=320x180:r=25:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=1320:duration=2', '-filter_complex', '[0:v][3:a][1:v][4:a][2:v][5:a]concat=n=3:v=1:a=1[v][a]', '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-c:a', 'aac', str(SOURCE)], check=True)
original_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()

def api(path, payload=None, method=None):
    req = urllib.request.Request(API_URL + path, data=json.dumps(payload).encode() if payload is not None else None, method=method, headers={'Authorization':'Bearer development-local','Content-Type':'application/json'})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)

def task(payload):
    identifier = api('/jobs', payload)['id']
    for _ in range(600):
        result = api('/jobs/' + identifier)
        if result['state'] == 'done':
            return result['result']
        if result['state'] == 'error':
            raise RuntimeError(result['message'])
        time.sleep(.2)
    raise TimeoutError('Tarefa não terminou')

video = api('/videos', {'path': str(SOURCE)})
assert video['duration'] == 6.0, video
wave = task({'kind':'waveform','videoId':video['id']})
assert len(wave['peaks']) >= 300 and max(wave['peaks']) > .01
result = task({'kind':'export','videoId':video['id'],'cuts':[{'start':2,'end':4}],'output':str(EXPORT)})
info = probe(EXPORT)
assert abs(info['duration'] - 4) < .1, info
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == original_hash
for moment, color, frequency in [(1,'red',440),(3,'blue',1320)]:
    raw = subprocess.run([FF,'-v','error','-ss',str(moment),'-i',str(EXPORT),'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-'],capture_output=True,check=True).stdout
    assert raw[0 if color=='red' else 2] > 200 and raw[1] < 40, (color,list(raw))
    import array
    pcm = subprocess.run([FF,'-v','error','-ss',str(moment),'-i',str(EXPORT),'-t','0.5','-vn','-ac','1','-ar','8000','-f','s16le','-'],capture_output=True,check=True).stdout
    samples=array.array('h');samples.frombytes(pcm)
    crossings=sum(1 for a,b in zip(samples,samples[1:]) if a <= 0 < b)
    measured=crossings/.5
    assert abs(measured-frequency)<15, (measured,frequency)
req=urllib.request.Request(f'{API_URL}/media/{video["id"]}?token=development-local',headers={'Range':'bytes=0-99'})
with urllib.request.urlopen(req) as response:
    assert response.status==206 and len(response.read())==100
# Impede sobrescrever o original e exportar uma seleção totalmente excluída.
for payload in [{'output':str(SOURCE),'cuts':[]},{'output':str(EXPORT),'cuts':[{'start':0,'end':6}]}]:
    identifier=api('/jobs',{'kind':'export','videoId':video['id'],**payload})['id']
    for _ in range(100):
        state=api('/jobs/'+identifier)
        if state['state']=='error':break
        time.sleep(.1)
    assert state['state']=='error',state
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==original_hash
preview=task({'kind':'preview','videoId':video['id']})
assert abs(probe(preview['path'])['duration']-6)<.1
silent=OUT / 'teste-sem-audio.mp4'
subprocess.run([FF,'-v','error','-y','-i',str(SOURCE),'-an','-c:v','copy',str(silent)],check=True)
silent_video=api('/videos',{'path':str(silent)})
assert not silent_video['audio']
silent_export=task({'kind':'export','videoId':silent_video['id'],'cuts':[{'start':2,'end':4}],'output':str(OUT / 'teste-sem-audio-editado.mp4')})
assert abs(probe(silent_export['path'])['duration']-4)<.1
silence_file=OUT / 'teste-silencio.mp4'
subprocess.run([FF,'-v','error','-y','-f','lavfi','-i','color=white:s=320x180:r=25:d=3','-f','lavfi','-i','sine=frequency=440:duration=1','-f','lavfi','-i','anullsrc=r=44100:cl=mono:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-filter_complex','[1:a][2:a][3:a]concat=n=3:v=0:a=1[a]','-map','0:v','-map','[a]','-c:v','libx264','-c:a','aac',str(silence_file)],check=True)
silence_video=api('/videos',{'path':str(silence_file)})
detected=task({'kind':'silence','videoId':silence_video['id']})['cuts']
assert len(detected)==1,detected
assert abs(detected[0]['start']-1.1)<.05 and abs(detected[0]['end']-1.9)<.05,detected
print(json.dumps({'ok':True,'original_seconds':6,'export_seconds':info['duration'],'frames':'red -> blue','audio':'440 Hz -> 1320 Hz','original_preserved':True,'range_requests':True},indent=2))
print('Prévia compatível, vídeo sem áudio e remoção de silêncio: OK.')

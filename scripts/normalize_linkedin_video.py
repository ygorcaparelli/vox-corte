"""Normalize the already edited files to constant frame rate for sharing."""
import json
import os
from pathlib import Path
import subprocess
import sys
root=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'backend'))
from app import ffmpeg,probe
out=root/'outputs/linkedin'
for name in ['VoxCorte-Resumo-LinkedIn.mp4','VoxCorte-Demonstracao-LinkedIn.mp4']:
    source=out/name
    target=source.with_suffix('.cfr.mp4')
    subprocess.run([ffmpeg(),'-y','-v','error','-i',str(source),'-r','30','-fps_mode','cfr',
        '-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',str(target)],check=True)
    info=probe(target)
    assert abs(info['fps']-30)<.01 and info['audio'] and info['width']==1920 and info['height']==1080
    subprocess.run([ffmpeg(),'-v','error','-i',str(target),'-f','null','-'],check=True)
    os.replace(target,source)
    print(name,info,flush=True)
file=out/'video-final.json';info=json.loads(file.read_text('utf-8'))
final=probe(out/'VoxCorte-Demonstracao-LinkedIn.mp4')
info.update(fps=final['fps'],duration=final['duration'])
file.write_text(json.dumps(info,ensure_ascii=False,indent=2),'utf-8')

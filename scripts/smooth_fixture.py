from pathlib import Path
import subprocess
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'backend'))
from app import ffmpeg

target=Path('outputs/movimento-teste.mp4')
subprocess.run([ffmpeg(),'-v','error','-y','-f','lavfi','-i','testsrc2=size=640x360:rate=30:duration=8','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=8','-c:v','libx264','-preset','fast','-g','120','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',str(target)],check=True)
print('Fixture de movimento pronta: 8 s, 640x360, 30 fps, GOP de 4 s.')

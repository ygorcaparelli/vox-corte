from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'backend'))
from app import ffmpeg

for name, size in [('vertical', '360x640'), ('quatro-tres', '640x480')]:
    target = Path('outputs') / f'enquadramento-{name}.mp4'
    subprocess.run([ffmpeg(), '-v', 'error', '-y', '-f', 'lavfi', '-i',
                    f'testsrc2=size={size}:rate=30:duration=2', '-c:v', 'libx264',
                    '-preset', 'fast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(target)], check=True)
print('Fixtures de enquadramento prontas.')

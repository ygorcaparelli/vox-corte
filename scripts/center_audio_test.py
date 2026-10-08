import array
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'backend'))
from app import ffmpeg, probe

output = Path('outputs/central-editado-teste.mp4')
assert abs(probe(output)['duration'] - 4) < .1
for moment, frequency in [(.5, 440), (1.5, 880), (2.5, 1320)]:
    pcm = subprocess.run([ffmpeg(), '-v', 'error', '-ss', str(moment), '-i', str(output), '-t', '0.4', '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], capture_output=True, check=True).stdout
    samples = array.array('h')
    samples.frombytes(pcm)
    crossings = sum(1 for a, b in zip(samples, samples[1:]) if a <= 0 < b)
    assert abs(crossings / .4 - frequency) < 15, (moment, crossings / .4, frequency)
print('Audio central OK: excluir clipe + recuperar borda preservou 440/880/1320 Hz no MP4 de 4 s.')

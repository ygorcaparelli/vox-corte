import array
import os
from pathlib import Path
import subprocess
import sys
import uuid
import numpy as np

root = Path(__file__).resolve().parent.parent
backend = root / 'outputs' / 'release' / 'win-unpacked' / 'resources' / 'backend' if os.environ.get('FALA_TEST_PACKAGED') == '1' else root / 'backend'
sys.path.insert(0, str(backend))
from app import export, ffmpeg, probe

source = Path('outputs/movimento-teste.mp4').resolve()
effects = [
    {'start': .35, 'end': 1.9, 'from': 1.15, 'to': 1.15, 'x': .5, 'y': .5, 'curve': 'smooth'},
    {'start': 5, 'end': 7, 'from': 1, 'to': 2, 'x': .5, 'y': .5, 'curve': 'linear'},
]
sequential = Path('outputs/zoom-sequencial.mp4').resolve()
export(uuid.uuid4().hex, {'path': str(source), 'output': str(sequential), 'cuts': [{'start': 2, 'end': 3}], 'zooms': effects, 'sequential': True, 'encoder': 'cpu'})


def frame(path, time, scale=1, x=.5, y=.5):
    crop = f'crop=w=iw/{scale}:h=ih/{scale}:x=(iw-ow)*{x}:y=(ih-oh)*{y},' if scale != 1 else ''
    result = subprocess.run([ffmpeg(), '-v', 'error', '-ss', str(time), '-i', str(path), '-frames:v', '1', '-vf', crop + 'scale=320:180', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True)
    return np.frombuffer(result.stdout, dtype=np.uint8).astype(float)


for output in (Path('outputs/zoom-exportado.mp4'), sequential):
    info = probe(output)
    assert abs(info['duration'] - 7) < .07 and info['width'] == 640 and info['height'] == 360, info
    for edited, original, scale in [(1, 1, 1.15), (3, 4, 1), (5, 6, 1.5), (6.5, 7.5, 1)]:
        actual, expected = frame(output, edited), frame(source, original, scale)
        error = np.mean((actual - expected) ** 2)
        assert error < 1100, (output.name, edited, error)
        if scale > 1:
            unchanged = np.mean((actual - frame(source, original)) ** 2)
            assert error < unchanged * .45, (edited, error, unchanged)
    pcm = subprocess.run([ffmpeg(), '-v', 'error', '-ss', '5', '-i', str(output), '-t', '0.4', '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], capture_output=True, check=True).stdout
    samples = array.array('h', pcm)
    frequency = sum(1 for a, b in zip(samples, samples[1:]) if a <= 0 < b) / .4
    assert abs(frequency - 440) < 15, frequency
leading = Path('outputs/zoom-inicio-cortado.mp4').resolve()
export(uuid.uuid4().hex, {'path': str(source), 'output': str(leading), 'cuts': [{'start': 0, 'end': .5}, {'start': 2, 'end': 3}, {'start': 7.5, 'end': 8}], 'zooms': effects, 'sequential': True, 'encoder': 'cpu'})
assert abs(probe(leading)['duration'] - 6) < .07
assert np.mean((frame(leading, 4.5) - frame(source, 6, 1.5)) ** 2) < 1100
assert np.mean((frame(leading, 5.75) - frame(source, 7.25)) ** 2) < 1100
print('OK: enquadramento do MP4 confere com zoom esperado, cortes/tempo incluindo inicio removido, imagem sem zoom fora do intervalo e audio 440 Hz; exportacao normal e sequencial.')

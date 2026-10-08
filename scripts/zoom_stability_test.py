"""Measure zoom drift on a stationary target, rather than on moving footage."""
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid
from unittest.mock import patch
import numpy as np

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / 'backend'))
import app
from app import ffmpeg
from zoom import zoom_filter


def measure(graph):
    # A centered marker must not wander when the camera zooms around its center.
    image = np.zeros((360, 640, 3), dtype=np.uint8)
    image[174:186, 314:326] = 255
    image[174:186, 434:446] = 180
    with tempfile.TemporaryDirectory() as directory:
        script = Path(directory) / 'filter.txt'
        script.write_text(graph, encoding='utf-8')
        result = subprocess.run([ffmpeg(), '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                                 '-s', '640x360', '-r', '30', '-i', '-', '-filter_script:v', str(script),
                                 '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
                                input=image.tobytes() * 240, capture_output=True, check=True)
    frames = np.frombuffer(result.stdout, dtype=np.uint8).reshape(-1, 360, 640)
    target = frames[:, 140:220, 280:360].astype(float)
    mass = target.sum(axis=(1, 2))
    x = (target.sum(axis=1) * np.arange(280, 360)).sum(axis=1) / mass
    y = (target.sum(axis=2) * np.arange(140, 220)).sum(axis=1) / mass
    # Allow a constant subpixel center convention; reject oscillation and backwards movement.
    drift = max(np.ptp(x), np.ptp(y))
    off = frames[:, 140:220, 420:510].astype(float)
    pos = (off.sum(axis=1) * np.arange(420, 510)).sum(axis=1) / off.sum(axis=(1, 2))
    reversals = max(-np.diff(pos[:120]).min(), np.diff(pos[120:]).max())
    print(f'Center drift: {drift:.4f} px; wrong-direction movement: {reversals:.4f} px; frames: {len(frames)}')
    return drift, reversals, len(frames)


effects = [dict(start=0, end=4, **{'from': 1, 'to': 1.22}, x=.5, y=.5, curve='smooth'),
           dict(start=4, end=8, **{'from': 1.22, 'to': 1}, x=.5, y=.5, curve='smooth')]
drift, reversals, count = measure(zoom_filter(effects, 640, 360, 30))
if '--baseline' not in sys.argv:
    assert drift < .2, drift
    assert reversals < .1, reversals
    assert count == 240, count

    with tempfile.TemporaryDirectory(prefix='vox-zoom-stability-') as directory:
        data = Path(directory)
        (data / 'jobs').mkdir()
        source = data / 'source.mp4'
        subprocess.run([ffmpeg(), '-v', 'error', '-f', 'lavfi', '-i',
                        'color=black:s=640x360:r=30:d=8,drawbox=x=314:y=174:w=12:h=12:color=white:t=fill',
                        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:v', 'libx264',
                        '-crf', '12', '-c:a', 'aac', '-shortest', str(source)], check=True)
        for sequential in (False, True):
            output = data / f'export-{sequential}.mp4'
            automatic = [{**z, 'automatic': True, 'automaticMotion': 'slow-in' if z['to']>z['from'] else 'cut-out'} for z in effects]
            with patch.object(app, 'DATA', data):
                app.export(uuid.uuid4().hex, {'path':str(source), 'output':str(output),
                           'cuts':[{'start':2,'end':2.5}], 'zooms':automatic,
                           'sequential':sequential, 'encoder':'cpu'})
            info = app.probe(output)
            assert abs(info['duration']-7.5)<.08 and info['audio'], info
            raw = subprocess.run([ffmpeg(), '-v', 'error', '-i', str(output), '-an',
                                  '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
                                 capture_output=True, check=True).stdout
            frames = np.frombuffer(raw, dtype=np.uint8).reshape(-1,360,640)
            target = np.maximum(frames[:,140:220,280:360].astype(float)-25,0)
            mass = target.sum(axis=(1,2))
            centers = (target.sum(axis=1)*np.arange(280,360)).sum(axis=1)/mass
            assert np.ptp(centers)<.3, np.ptp(centers)
            pcm = subprocess.run([ffmpeg(), '-v', 'error', '-i', str(output), '-vn', '-ac', '1',
                                  '-ar', '8000', '-f', 's16le', '-'], capture_output=True, check=True).stdout
            audio = np.frombuffer(pcm,dtype=np.int16).astype(float)
            windows = audio[:len(audio)//800*800].reshape(-1,800)
            assert np.sqrt(np.mean(windows**2,axis=1)).min()>500
            print(f'Encoded MP4 sequential={sequential}: {len(frames)} frames, drift {np.ptp(centers):.4f}px, continuous audio.')

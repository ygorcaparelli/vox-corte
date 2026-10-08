from pathlib import Path
import sys
import tempfile
import uuid
from unittest.mock import patch

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / 'backend'))
import app
from zoom import compile_zooms, zoom_filter

source = root / 'outputs/teste-original.mp4'
zooms = [{'start':i/50,'end':(i+.9)/50,'from':1,'to':1.05,'x':.5,'y':.5,'curve':'smooth'} for i in range(269)]
expression = zoom_filter(compile_zooms(zooms, [(0,6)], 6), 320, 180, 25)
assert len(expression) > 32767
with tempfile.TemporaryDirectory(prefix='vox-export-test-') as directory:
    data = Path(directory)
    (data / 'jobs').mkdir()
    with patch.object(app, 'DATA', data):
        result = app.export(uuid.uuid4().hex, {'path':str(source),'output':str(data/'result.mp4'),'cuts':[],'zooms':zooms,'sequential':True,'encoder':'cpu'})
    info = app.probe(result['path'])
    assert abs(info['duration']-6)<.1 and info['audio'], info
    assert not list((data/'jobs').glob('*.video-filter.txt'))
    print(f'OK: real MP4 export with 269 zooms, {len(expression)}-character filter, preserved audio and 6 s duration. No user video copied.')

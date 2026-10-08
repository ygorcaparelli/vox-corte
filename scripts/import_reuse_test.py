import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request


root = Path(__file__).resolve().parent.parent
fixture = root / 'outputs' / 'teste-original.mp4'
video = fixture.read_bytes()
with tempfile.TemporaryDirectory(prefix='fala-import-test-') as directory:
    data = Path(directory)
    imports = data / 'imports'
    imports.mkdir()
    legacy = imports / 'legacy-fixture.mp4'
    legacy.write_bytes(video)
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    process = subprocess.Popen(
        [sys.executable, str(root / 'backend' / 'app.py'), '--port', str(port)],
        env={**os.environ, 'FALA_DATA': directory, 'FALA_TOKEN': 'import-test'},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
    )
    base = f'http://127.0.0.1:{port}'
    def request(route, body=None, headers=None):
        req = urllib.request.Request(base + route, data=body, headers={
            'Authorization': 'Bearer import-test', **(headers or {}),
        })
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    try:
        deadline = time.monotonic() + 30
        while True:
            try:
                request('/health')
                break
            except OSError:
                if process.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError('Test server did not start')
                time.sleep(.1)
        def upload(content, name):
            boundary = 'isolated-import-test'
            body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: video/mp4\r\n\r\n').encode() + content + f'\r\n--{boundary}--\r\n'.encode()
            return request('/upload', body, {'Content-Type': 'multipart/form-data; boundary=' + boundary})
        for name in ['first.mp4', 'renamed.mp4']:
            result = upload(video, name)
            assert result['reused'] and Path(result['path']) == legacy, result
            assert result['name'] == name and result['duration'] == 6, result
        different = video + b'\0' * (3 * 1024 * 1024)
        first = upload(different, 'new.mp4')
        repeated = upload(different, 'again.mp4')
        assert not first['reused'] and repeated['reused']
        assert first['path'] == repeated['path']
        assert len(list(imports.iterdir())) == 2
        before = len(list(imports.iterdir()))
        direct = request('/videos', json.dumps({'path': str(fixture)}).encode(), {'Content-Type': 'application/json'})
        assert Path(direct['path']) == fixture and len(list(imports.iterdir())) == before
        try:
            upload(b'not a video', 'invalid.mp4')
        except urllib.error.HTTPError as exc:
            assert exc.code == 400
        else:
            raise AssertionError('Invalid video accepted')
        assert len(list(imports.iterdir())) == before
        assert legacy.read_bytes() == video
        print('OK: legacy/new uploads reused, names preserved, disk spool, direct path without copy, invalid upload cleaned. User imports untouched.')
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()

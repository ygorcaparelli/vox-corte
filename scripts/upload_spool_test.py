import json
from pathlib import Path
import urllib.request

boundary = 'fala-upload-test'
video = Path('outputs/teste-original.mp4').read_bytes() + bytes(3 * 1024 * 1024)
body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="teste-grande.mp4"\r\nContent-Type: video/mp4\r\n\r\n').encode() + video + (f'\r\n--{boundary}--\r\n').encode()
request = urllib.request.Request('http://127.0.0.1:8770/upload', data=body, headers={'Authorization':'Bearer development-local','Content-Type':'multipart/form-data; boundary=' + boundary})
with urllib.request.urlopen(request, timeout=30) as response:
    result = json.load(response)
assert result['size'] > 3 * 1024 * 1024 and result['duration'] == 6, result
print('Upload multipart com arquivo temporario em disco: OK (3 MB).')

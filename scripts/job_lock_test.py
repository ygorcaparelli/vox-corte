"""Exercise real Windows sharing locks against polling of an owned test job."""
import ctypes
from ctypes import wintypes
import json
from pathlib import Path
import threading
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
URL = 'http://127.0.0.1:8770'

def api(route, body=None):
    request = urllib.request.Request(URL + route, data=json.dumps(body).encode() if body else None, headers={'Authorization':'Bearer development-local','Content-Type':'application/json'})
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)

video = api('/videos', {'path':str(ROOT / 'outputs/teste-original.mp4'), 'previewResult':True})
identifier = api('/jobs', {'kind':'waveform','videoId':video['id']})['id']
for _ in range(100):
    state = api('/jobs/' + identifier)
    if state['state'] == 'done':
        break
    time.sleep(.1)
assert state['state'] == 'done', state

kernel = ctypes.WinDLL('kernel32', use_last_error=True)
kernel.CreateFileW.argtypes = [wintypes.LPCWSTR,wintypes.DWORD,wintypes.DWORD,ctypes.c_void_p,wintypes.DWORD,wintypes.DWORD,wintypes.HANDLE]
kernel.CreateFileW.restype = wintypes.HANDLE
kernel.CloseHandle.argtypes = [wintypes.HANDLE]
state_path = ROOT / '.local/jobs' / (identifier + '.json')

def locked_request(seconds):
    handle = kernel.CreateFileW(str(state_path), 0x80000000, 0, None, 3, 0, None)
    assert handle != ctypes.c_void_p(-1).value, ctypes.get_last_error()
    def release():
        time.sleep(seconds)
        kernel.CloseHandle(handle)
    thread = threading.Thread(target=release)
    thread.start()
    try:
        return api('/jobs/' + identifier)
    finally:
        thread.join()

assert locked_request(.2)['state'] == 'done'
try:
    locked_request(1.5)
    raise AssertionError('Expected bounded retry with HTTP 503')
except urllib.error.HTTPError as error:
    assert error.code == 503, error
assert api('/jobs/' + identifier)['state'] == 'done'
print('Windows real: bloqueio de 200 ms recuperado; bloqueio persistente retorna 503; resultado recuperado apos liberar.')

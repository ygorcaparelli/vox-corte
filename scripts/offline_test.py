import os
from pathlib import Path
import socket
import sys
import uuid

root=Path(__file__).resolve().parent.parent
os.environ['FALA_DATA']=str(root / '.local')
os.environ['HF_HUB_OFFLINE']='1'
sys.path.insert(0,str(root / 'outputs' / 'release' / 'win-unpacked' / 'resources' / 'backend'))
from app import transcribe, status

def deny_network(*args, **kwargs):
    raise AssertionError('A transcrição tentou acessar a rede')

socket.socket.connect=deny_network
socket.create_connection=deny_network
identifier=uuid.uuid4().hex
status(identifier,state='running')
result=transcribe(identifier,{'path':str(root / 'outputs' / 'fala-teste.mp4'),'model':'tiny','language':'auto','device':'cpu'})
assert len(result['words'])>10
print('Offline confirmado com sockets bloqueados:',len(result['words']),'palavras.')

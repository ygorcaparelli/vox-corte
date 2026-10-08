"""Independently transcribe the actual exported MP4 to check the deleted sentence."""
import json
from pathlib import Path
import sys
import unicodedata
import uuid

root=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'backend'))
import app
out=root/'outputs/linkedin'
file=out/'gravacao.json'
record=json.loads(file.read_text('utf-8'))
app.DATA=Path(record['userData'])/'data'
job=uuid.uuid4().hex
result=app.transcribe(job,dict(path=record['destination'],model='base',language='pt',device='cpu'))
text=' '.join(w['text'] for w in result['words'])
normalized=''.join(c for c in unicodedata.normalize('NFD',text.lower()) if unicodedata.category(c)!='Mn')
assert 'removido' not in normalized, 'A frase excluida ainda foi encontrada no audio exportado.'
assert 'transcri' in normalized and 'preservado' in normalized, 'Falas que deveriam ser mantidas nao foram reconhecidas.'
name='Transcrição independente do MP4 confirma remoção da frase e manutenção das outras falas'
record['checks']=[c for c in record['checks'] if c['name']!=name]
record['checks'].append(dict(name=name,passed=True,details=dict(exportedTranscript=text,model='base',device=result['device'])))
file.write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf-8')
(out/'transcricao-exportado.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8')
print('PASS: audio exportado transcrito novamente; frase removida ausente. Texto reconhecido:',text,flush=True)

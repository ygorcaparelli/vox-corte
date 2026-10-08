import json
import wave
import numpy as np
import subprocess
from integration_test import api, task, OUT, FF

rate=16000
audio=np.zeros(6*rate,dtype=np.float32)
audio[int(1.2*rate):int(1.7*rate)]=np.random.default_rng(42).normal(0,.03,int(.5*rate))
wav=OUT/'respiracoes-teste.wav'
with wave.open(str(wav),'wb') as file:
    file.setnchannels(1);file.setsampwidth(2);file.setframerate(rate)
    file.writeframes((audio*32767).astype('<i2').tobytes())
video=OUT/'respiracoes-teste.mp4'
subprocess.run([FF,'-v','error','-y','-i',str(OUT/'teste-original.mp4'),'-i',str(wav),'-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-shortest',str(video)],check=True)
v=api('/videos',{'path':str(video)})
result=task({'kind':'breaths','videoId':v['id'],'words':[{'start':0,'end':1},{'start':2,'end':6}],'sensitivity':2})
assert len(result['candidates'])>=1,result
assert all(1.08<=c['start']<c['end']<=1.92 for c in result['candidates']),result
protected=task({'kind':'breaths','videoId':v['id'],'words':[{'start':0,'end':6}],'sensitivity':3})
assert not protected['candidates'],protected
(OUT/'respiracoes-analise.json').write_text(json.dumps(result,indent=2),'utf-8')
print('Análise real de áudio OK: ruído entre palavras sugerido, fala protegida e nenhum corte aplicado pela análise.')
dry=task({'kind':'tighten','videoId':v['id'],'words':[{'start':0,'end':1},{'start':2,'end':6}]})
assert [(c['start'],c['end']) for c in dry['cuts']]==[(1,2)],dry
exported=task({'kind':'export','videoId':v['id'],'cuts':dry['cuts'],'output':str(OUT/'corte-seco-teste.mp4')})
assert abs(exported['duration']-5)<.02,exported
print('Corte seco OK: intervalo inteiro de 1 a 2 s removido, incluindo ruído respiratório, sem margens; exportação de 6 para 5 s.')
voice=api('/videos',{'path':str(OUT/'fala-teste.mp4')})
words=json.loads((OUT/'transcricao-teste.json').read_text('utf-8'))['words']
voice_cuts=task({'kind':'tighten','videoId':voice['id'],'words':words})['cuts']
assert voice_cuts,voice_cuts
assert all(not(c['start']<w['end']-1e-4 and c['end']>w['start']+1e-4) for c in voice_cuts for w in words)
print('Fala real OK: pausas identificadas sem cortar os timestamps das palavras transcritas.')

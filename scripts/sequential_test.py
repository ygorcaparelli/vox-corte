import os
os.environ['FALA_TEST_URL'] = 'http://127.0.0.1:8769'
from integration_test import api, task, SOURCE, OUT, FF, probe
import subprocess
import numpy as np

video = api('/videos', {'path': str(SOURCE)})
for encoder in ['cpu', 'auto']:
    result = task({'kind':'export','videoId':video['id'],'cuts':[{'start':2,'end':4}],'output':str(OUT/f'sequencial-{encoder}.mp4'),'sequential':True,'encoder':encoder})
    assert result['sequential']
    info = probe(result['path'])
    assert abs(info['duration']-4)<.12, info
    for t, channel in [(.5,0),(2.5,2)]:
        raw = subprocess.check_output([FF,'-v','error','-ss',str(t),'-i',result['path'],'-frames:v','1','-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-'])
        assert raw[channel]>180 and raw[1]<50,(encoder,t,list(raw))
        raw = subprocess.check_output([FF,'-v','error','-ss',str(t),'-i',result['path'],'-t','0.2','-vn','-ac','1','-ar','16000','-f','f32le','-'])
        samples = np.frombuffer(raw,dtype=np.float32)
        freq = np.fft.rfftfreq(len(samples),1/16000)[np.argmax(np.abs(np.fft.rfft(samples)))]
        assert abs(freq-(440 if channel==0 else 1320))<15,(encoder,t,freq)
    print('Sequencial OK:',encoder,result)

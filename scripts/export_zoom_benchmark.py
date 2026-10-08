"""Compare bypass against identical always-on zoom processing, without user footage."""
from pathlib import Path
import statistics
import subprocess
import sys
import tempfile
import time
import uuid
from unittest.mock import patch
import numpy as np
root=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'backend'))
from app import ffmpeg
import app
from zoom import zoom_filter

effects=[{'start':2,'end':3,'from':1,'to':1.2,'x':.3,'y':.7,'curve':'smooth'},
         {'start':5,'end':6,'from':1.2,'to':1,'x':.5,'y':.5,'curve':'smooth'}]
with tempfile.TemporaryDirectory(prefix='vox-zoom-benchmark-') as directory:
    def run(graph, width, height, raw):
        script=Path(directory)/'filter.txt';script.write_text(graph,encoding='utf-8')
        command=[ffmpeg(),'-v','error','-f','lavfi','-i',f'testsrc2=s={width}x{height}:r=60:d=8',
                 '-filter_script:v',str(script),'-an']
        command+=['-f','rawvideo','-pix_fmt','gray','-'] if raw else ['-f','null','-']
        start=time.perf_counter();result=subprocess.run(command,capture_output=True,check=True)
        return time.perf_counter()-start,result.stdout
    graph=zoom_filter(effects,320,180,60)
    baseline=graph.rsplit(':enable=',1)[0]
    _,before=run(baseline,320,180,True);_,after=run(graph,320,180,True)
    a=np.frombuffer(before,dtype=np.uint8).reshape(-1,180,320).astype(float)
    b=np.frombuffer(after,dtype=np.uint8).reshape(-1,180,320).astype(float)
    errors=np.mean((a-b)**2,axis=(1,2))
    print('Frame differences:',[(i,round(errors[i],4)) for i in (0,60,119,120,130,150,179,180,240,299,300,330,359,360,479)])
    assert before==after,'Bypass changed effect timing or image pixels'
    timings={}
    for optimized in (False,True):
        graph=zoom_filter(effects,1280,720,60)
        if not optimized:graph=graph.rsplit(':enable=',1)[0]
        timings[optimized]=statistics.median(run(graph,1280,720,False)[0] for _ in range(2))
    print(f'Identical pixels across gaps and late zooms. Always-on {timings[False]:.2f}s; bypass {timings[True]:.2f}s; gain {timings[False]/timings[True]:.2f}x (synthetic 720p60 filter-only).')
    data=Path(directory);(data/'jobs').mkdir()
    source=data/'source.mp4'
    subprocess.run([ffmpeg(),'-v','error','-f','lavfi','-i','testsrc2=s=1280x720:r=60:d=8',
                    '-f','lavfi','-i','sine=frequency=440:duration=8','-c:v','libx264','-preset','ultrafast',
                    '-crf','20','-c:a','aac','-shortest',str(source)],check=True)
    original=app.zoom_filter;full={}
    for optimized in (False,True):
        def graph(*args):
            value=original(*args)
            return value if optimized else value.rsplit(':enable=',1)[0]
        output=data/f'full-{optimized}.mp4'
        start=time.perf_counter()
        with patch.object(app,'DATA',data),patch.object(app,'zoom_filter',graph):
            app.export(uuid.uuid4().hex,{'path':str(source),'output':str(output),
                       'cuts':[{'start':3.2,'end':3.4},{'start':4.2,'end':4.4}],
                       'zooms':effects,'encoder':'cpu','sequential':True})
        full[optimized]=time.perf_counter()-start
        info=app.probe(output)
        assert info['audio'] and abs(info['duration']-7.6)<.06,info
    print(f'Full real MP4 (CPU, same quality/audio/cuts): before {full[False]:.2f}s; after {full[True]:.2f}s; gain {full[False]/full[True]:.2f}x. Not a prediction for user videos.')
    gpu={};encoders=[]
    for optimized in (False,True):
        def graph(*args):
            value=original(*args)
            return value if optimized else value.rsplit(':enable=',1)[0]
        start=time.perf_counter()
        with patch.object(app,'DATA',data),patch.object(app,'zoom_filter',graph):
            result=app.export(uuid.uuid4().hex,{'path':str(source),'output':str(data/f'gpu-{optimized}.mp4'),
                              'cuts':[{'start':3.2,'end':3.4},{'start':4.2,'end':4.4}],
                              'zooms':effects,'encoder':'auto','sequential':True})
        gpu[optimized]=time.perf_counter()-start;encoders.append(result['encoder'])
    print(f'Full real MP4 (auto {encoders}): before {gpu[False]:.2f}s; after {gpu[True]:.2f}s; gain {gpu[False]/gpu[True]:.2f}x. Not a prediction for user videos.')

"""Edit the genuine screen recording with synthetic narration and measured test results."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import textwrap

root=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'backend'))
from app import ffmpeg, probe

out=root/'outputs/linkedin'
parser=argparse.ArgumentParser();parser.add_argument('--resume',action='store_true');resume=parser.parse_args().resume
record=json.loads((out/'gravacao.json').read_text('utf-8'))
tests=json.loads((out/'testes.json').read_text('utf-8'))
raw=Path(record['raw'])
raw_info=probe(raw)
origin=record['endStamp']-raw_info['duration']
font='C\\:/Windows/Fonts/segoeui.ttf'
bold='C\\:/Windows/Fonts/segoeuib.ttf'
parts=[]
def escape(path):return str(path.resolve()).replace('\\','/').replace(':','\\:')
def textfile(name,text):
    file=out/(name+'.txt');file.write_text(text,'utf-8');return escape(file)
def text_filter(file,x,y,size=28,color='white',heavy=False):
    return f"drawtext=fontfile='{bold if heavy else font}':textfile='{file}':fontsize={size}:fontcolor={color}:x={x}:y={y}:line_spacing=7"
def decoration(title,subtitle,tag,index):
    titlefile=textfile(f'titulo-{index}',title)
    subtitlefile=textfile(f'legenda-{index}',textwrap.fill(subtitle,105))
    tagfile=textfile(f'tag-{index}',tag)
    return ','.join([
        'scale=1600:900:force_original_aspect_ratio=decrease',
        'pad=1600:900:(ow-iw)/2:(oh-ih)/2:color=0x101214',
        'pad=1920:1080:160:88:color=0x101214',
        'drawbox=x=160:y=78:w=1600:h=3:color=0xff7856:t=fill',
        text_filter(titlefile,160,20,36,heavy=True),
        text_filter(tagfile,'w-tw-160',60,16,'0xaab5be'),
        text_filter(subtitlefile,160,1005,26),
    ])
def encode(args,graph,output,duration):
    if resume and int(output.stem.split('-')[-1])<9 and output.exists() and output.stat().st_mtime>(out/'gravacao.json').stat().st_mtime:
        if abs(probe(output)['duration']-duration)<.12:
            parts.append(output);return
    script=output.with_suffix('.filter');script.write_text(graph,'utf-8')
    subprocess.run([ffmpeg(),'-y','-v','error',*args,'-filter_complex_script',str(script),
       '-map','[v]','-map','[a]','-t',str(duration),'-r','30','-c:v','libx264','-preset','fast','-crf','20',
       '-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','48000','-ac','2','-movflags','+faststart',str(output)],check=True)
    parts.append(output)

for index,scene in enumerate(record['scenes']):
    narration=out/f"narracao-{scene['id']}.wav"
    # probe() expects video; use the wave parser for narration duration.
    import wave
    with wave.open(str(narration),'rb') as stream:
        target=max(5,stream.getnframes()/stream.getframerate()+.65)
    start=max(0,scene['start']-origin)
    length=max(.5,min(scene['end']-scene['start'],raw_info['duration']-start))
    if length>target+1:
        head=min(2.5,target/2);tail=target-head
        content=f"[0:v]split=2[x][y];[x]trim=end={head},setpts=PTS-STARTPTS[h];[y]trim=start={length-tail}:end={length},setpts=PTS-STARTPTS[t];[h][t]concat=n=2:v=1:a=0[c]"
    else:
        content=f"[0:v]trim=end={length},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={max(0,target-length)}[c]"
    tag='Aplicativo Windows • gravação real • esperas abreviadas • voz sintética'
    if scene['id'] in (9,10):
        # Only the export destination is obscured, not the processing result.
        enable=":enable='lt(t,1.8)'" if scene['id']==10 else ''
        content+=";[c]split=2[full][private];[private]crop=1250:30:244:91,boxblur=12:2:6:2[blur];[full][blur]overlay=x=244:y=91"+enable+"[safe]"
        decorated='safe'
        tag+=' • caminho local desfocado na edição'
    else:
        decorated='c'
    graph=content+f";[{decorated}]{decoration(scene['title'],scene['subtitle'],tag,index)}[v];[1:a]loudnorm=I=-16:TP=-1.5:LRA=11,apad[a]"
    print('Montando:',scene['title'],flush=True)
    encode(['-ss',str(start),'-t',str(length),'-i',str(raw),'-i',str(narration)],graph,out/f'cena-{index:02}.mp4',target)

for label,file in [('ANTES',Path(record['source'])),('DEPOIS',Path(record['destination']))]:
    info=probe(file);index=len(parts)
    title=f"{label} | {'vídeo original' if label=='ANTES' else 'MP4 exportado'} | {info['duration']:.1f} s".replace('.',',')
    subtitle='Ouça a frase “Este trecho será removido” no original.' if label=='ANTES' else 'A frase foi excluída. Este é o arquivo MP4 realmente exportado pelo aplicativo.'
    graph=f"[0:v]{decoration(title,subtitle,'Vídeo de teste • voz sintética pt-BR • áudio do próprio arquivo',index)}[v];[0:a]loudnorm=I=-16:TP=-1.5:LRA=11,apad[a]"
    encode(['-i',str(file)],graph,out/f'cena-{index:02}.mp4',info['duration'])

index=len(parts)
lines=[
    ('TESTES EXECUTADOS',160,140,52,'white',True),
    (f"{tests['totalTests']} testes automatizados aprovados",160,260,52,'0xff987a',True),
    (f"{tests['frontendTests']} frontend  |  {tests['backendTests']} backend",160,345,32,'0xcbd3da',False),
    (f"{tests['legacyComparisons']} comparações com o corte da versão 1.10.2",160,440,36,'white',True),
    (f"{len(record['checks'])} verificações no aplicativo Windows",160,530,36,'white',True),
    ('Transcrição real • cortes • desfazer/refazer • salvamento',160,605,30,'0xcbd3da',False),
    ('MP4 exportado • arquivo original validado por SHA-256',160,660,30,'0xcbd3da',False),
    (f"Vox Corte {record['version']} | Electron + React + Python + FFmpeg",160,800,28,'0xaab5be',False),
    ('Demonstração funcional. Não substitui testes em todos os formatos e equipamentos.',160,945,24,'0xaab5be',False),
]
filters=['drawbox=x=160:y=90:w=1600:h=4:color=0xff7856:t=fill']
for i,(text,x,y,size,color,heavy) in enumerate(lines):
    filters.append(text_filter(textfile(f'teste-slate-{i}',text),x,y,size,color,heavy))
narration=out/'narracao-11.wav'
with wave.open(str(narration),'rb') as stream:duration=max(9,stream.getnframes()/stream.getframerate()+1)
graph='[0:v]'+','.join(filters)+'[v];[1:a]loudnorm=I=-16:TP=-1.5:LRA=11,apad[a]'
encode(['-f','lavfi','-i',f'color=c=0x101214:s=1920x1080:r=30:d={duration}','-i',str(narration)],graph,out/f'cena-{index:02}.mp4',duration)

manifest=out/'cenas.ffconcat'
manifest.write_text('ffconcat version 1.0\n'+''.join("file '"+str(p.resolve()).replace('\\','/')+"'\n" for p in parts),'utf-8')
target=out/'VoxCorte-Demonstracao-LinkedIn.mp4'
subprocess.run([ffmpeg(),'-y','-v','error','-f','concat','-safe','0','-i',str(manifest),'-r','30','-fps_mode','cfr','-c:v','libx264','-preset','fast','-crf','18','-c:a','copy','-movflags','+faststart',str(target)],check=True)
shortparts=[parts[i] for i in [0,2,3,4,5,9,len(parts)-1]]
shortmanifest=out/'resumo.ffconcat'
shortmanifest.write_text('ffconcat version 1.0\n'+''.join("file '"+str(p.resolve()).replace('\\','/')+"'\n" for p in shortparts),'utf-8')
short=out/'VoxCorte-Resumo-LinkedIn.mp4'
subprocess.run([ffmpeg(),'-y','-v','error','-f','concat','-safe','0','-i',str(shortmanifest),'-r','30','-fps_mode','cfr','-c:v','libx264','-preset','fast','-crf','18','-c:a','copy','-movflags','+faststart',str(short)],check=True)
info=probe(target)
assert info['width']==1920 and info['height']==1080 and info['audio']
source_info=probe(record['source']);edited_info=probe(record['destination'])
assert edited_info['duration']<source_info['duration']-1
subprocess.run([ffmpeg(),'-v','error','-i',str(target),'-f','null','-'],check=True)
for name,seconds in [('preview-projetos',4),('preview-edicao',sum(probe(p)['duration'] for p in parts[:4])+2),('preview-exportacao',sum(probe(p)['duration'] for p in parts[:9])+probe(parts[9])['duration']-1),('preview-testes',info['duration']-5)]:
    subprocess.run([ffmpeg(),'-y','-v','error','-ss',str(seconds),'-i',str(target),'-frames:v','1',str(out/(name+'.png'))],check=True)
(out/'video-final.json').write_text(json.dumps(dict(file=str(target),duration=info['duration'],width=info['width'],height=info['height'],fps=info['fps'],audio=info['audio'],
                        sourceDuration=source_info['duration'],exportedDuration=edited_info['duration'],checks=record['checks'],tests=tests),ensure_ascii=False,indent=2),'utf-8')
print('Video final validado:',target,'|',round(info['duration'],1),'segundos',flush=True)
print('Resumo:',short,'|',round(probe(short)['duration'],1),'segundos',flush=True)

"""Create a clearly labeled synthetic Portuguese fixture for the recorded demo."""
import json
from pathlib import Path
import subprocess
import sys
import wave
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'backend'))
from app import ffmpeg

out=Path(__file__).resolve().parent.parent/'outputs/linkedin'
phrases=['Olá, este é um teste do Vox Corte.','Eu posso editar o vídeo usando a transcrição.','Este trecho será removido.','O arquivo original continua preservado.']
audio=[]
scenes=[]
cursor=.6
with wave.open(str(out/'fala-0.wav'),'rb') as first:
    params=first.getparams()
rate,width,channels=params.framerate,params.sampwidth,params.nchannels
audio.append(bytes(int(cursor*rate)*width*channels))
for i,text in enumerate(phrases):
    with wave.open(str(out/f'fala-{i}.wav'),'rb') as stream:
        assert stream.getparams()[:3]==params[:3]
        frames=stream.readframes(stream.getnframes())
        duration=stream.getnframes()/rate
    audio.append(frames)
    scenes.append(dict(start=cursor,end=cursor+duration,text=text))
    cursor+=duration
    silence=1.4 if i<3 else .6
    audio.append(bytes(int(silence*rate)*width*channels))
    cursor+=silence
with wave.open(str(out/'fonte.wav'),'wb') as stream:
    stream.setnchannels(channels);stream.setsampwidth(width);stream.setframerate(rate)
    stream.writeframes(b''.join(audio))
(out/'fixture.json').write_text(json.dumps(dict(duration=cursor,scenes=scenes),ensure_ascii=False,indent=2),'utf-8')
font='C\\:/Windows/Fonts/segoeui.ttf'
bold='C\\:/Windows/Fonts/segoeuib.ttf'
filters=["drawbox=x=0:y=0:w=iw:h=12:color=0xff7856:t=fill",
         f"drawtext=fontfile='{bold}':text='VOX CORTE':fontsize=62:fontcolor=white:x=70:y=60",
         f"drawtext=fontfile='{font}':text='VIDEO DE TESTE | VOZ SINTETICA PT-BR':fontsize=26:fontcolor=0xff987a:x=70:y=145",
         f"drawtext=fontfile='{font}':text='%{{pts\\:hms}}':fontsize=32:fontcolor=0xaab4bf:x=70:y=625",
         "drawbox=x=70:y=590:w=1140:h=5:color=0x30373e:t=fill",
         f"drawbox=x=70:y=590:w='min(1140,1140*t/{cursor})':h=5:color=0xff7856:t=fill"]
for i,scene in enumerate(scenes):
    file=out/f'frase-{i}.txt';file.write_text(scene['text'],'utf-8')
    textpath=str(file.resolve()).replace('\\','/').replace(':','\\:')
    filters.append(f"drawtext=fontfile='{bold}':textfile='{textpath}':fontsize=37:fontcolor=white:x=(w-tw)/2:y=330:enable='between(t,{scene['start']},{scene['end']})'")
subprocess.run([ffmpeg(),'-y','-v','error','-f','lavfi','-i',f'color=c=0x14191e:s=1280x720:r=30:d={cursor}',
                '-i',str(out/'fonte.wav'),'-vf',','.join(filters),'-c:v','libx264','-preset','fast','-crf','20',
                '-c:a','aac','-b:a','160k','-shortest','-movflags','+faststart',str(out/'video-de-teste.mp4')],check=True)
print('Fixture sintetica criada:',cursor,'segundos')

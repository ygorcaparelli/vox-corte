"""Compose a portrait product film from genuine demo footage."""
import asyncio
import json
from pathlib import Path
import subprocess
import sys
import wave

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'backend'))
from app import ffmpeg, probe

OUT = ROOT / 'outputs/promo-vertical'
DEMO = ROOT / 'outputs/linkedin'
OUT.mkdir(parents=True, exist_ok=True)
SCENES = [
    (4.3, 'Gravar e rapido.\nEditar nem sempre.', 'Foi por isso que comecei.', 'Comecei a criar conteudo. Mas editar tomava muito tempo.', None, None),
    (4.3, 'Conheca o\nVox Corte.', 'Edicao pela sua fala.', 'Por isso, criei o Vox Corte. Um editor para Windows.', 0, '1600:900:160:88'),
    (5.3, 'Sua fala vira\nferramenta de edicao.', 'Transcricao com tempo por palavra.', 'Importe seu video e transforme a fala em uma transcricao.', 3, '350:590:240:245'),
    (4.3, 'Apagou a frase.\nCortou o video.', 'Audio e imagem. Nao so a legenda.', 'Apague uma frase. O trecho sai do audio e do video.', 4, '350:590:240:245'),
    (5.3, 'Mais dinamica.\nVoce no controle.', 'Zoom manual ou automatico.', 'Ajuste os cortes e aplique zoom para dar mais dinamica.', 8, '820:620:590:245'),
    (4.3, 'Seu video.\nSeu computador.', 'Exporte em MP4. Preserve o original.', 'Exporte em MP4. Seu original continua salvo.', 9, '1600:810:160:175'),
    (4.0, 'Menos tempo editando.\nMais tempo criando.', 'Vox Corte | Em desenvolvimento', 'Mais tempo para criar.', None, None),
]

def run(args):
    subprocess.run([ffmpeg(), '-y', '-v', 'error', *args], check=True)

def escaped(path):
    return str(path.resolve()).replace('\\', '/').replace(':', '\\:')

def text_filter(index, kind, text, y, size, color='white', bold=False):
    for plain, accented in {'Gravar e': 'Gravar \u00e9', 'rapido': 'r\u00e1pido', 'Conheca': 'Conhe\u00e7a', 'Edicao': 'Edi\u00e7\u00e3o',
                            'edicao': 'edi\u00e7\u00e3o', 'Transcricao': 'Transcri\u00e7\u00e3o',
                            'video': 'v\u00eddeo', 'Audio': '\u00c1udio', 'Nao': 'N\u00e3o',
                            'dinamica': 'din\u00e2mica', 'Voce': 'Voc\u00ea', 'automatico': 'autom\u00e1tico',
                            'Midia': 'M\u00eddia', 'sinteticas': 'sint\u00e9ticas'}.items():
        text = text.replace(plain, accented)
    file = OUT / f'{index}-{kind}.txt'
    file.write_text(text, 'utf-8')
    font = 'segoeuib.ttf' if bold else 'segoeui.ttf'
    return f"drawtext=fontfile='C\\:/Windows/Fonts/{font}':textfile='{escaped(file)}':fontsize={size}:fontcolor={color}:x=(w-tw)/2:y={y}:line_spacing=18"

async def main():
    parts = []
    for index, (duration, title, subtitle, speech, source, crop) in enumerate(SCENES):
        existing = OUT / f'cena-{index}.mp4'
        redo = next((int(arg.split('=')[1]) for arg in sys.argv if arg.startswith('--redo=')), -1)
        if '--resume' in sys.argv and index not in (0, redo) and existing.exists():
            parts.append(existing)
            continue
        mp3 = OUT / f'voz-{index}.mp3'
        wav = OUT / f'voz-{index}.wav'
        spoken = OUT / f'voz-{index}.txt'
        if not mp3.exists() or not spoken.exists() or spoken.read_text('utf-8') != speech:
            await edge_tts.Communicate(speech, 'pt-BR-AntonioNeural').save(str(mp3))
            spoken.write_text(speech, 'utf-8')
        run(['-i', str(mp3), '-ar', '48000', '-ac', '2', str(wav)])
        with wave.open(str(wav)) as audio:
            seconds = audio.getnframes() / audio.getframerate()
        tempo = max(1, seconds / (duration - .35))
        assert tempo < 1.4, (index, tempo)
        inputs = ['-f', 'lavfi', '-i', f'color=c=0x101214:s=1080x1920:r=30:d={duration}',
                  '-loop', '1', '-i', str(ROOT / 'src/assets/voxcorte-wordmark.png')]
        graph = '[1:v]scale=560:-1,format=rgba[logo];[0:v][logo]overlay=x=(W-w)/2:y=110[base]'
        if source is not None:
            if source == 3:
                inputs += ['-ss', str(max(0, probe(DEMO / 'cena-03.mp4')['duration'] - 1.5))]
            inputs += ['-i', str(DEMO / f'cena-{source:02}.mp4')]
            graph += f';[2:v]crop={crop},setpts=PTS-STARTPTS,scale=960:900:force_original_aspect_ratio=decrease,setsar=1,tpad=stop_mode=clone:stop_duration={duration},trim=duration={duration},format=rgba,fade=t=in:st=0:d=0.3:alpha=1[shot]'
            graph += ";[base][shot]overlay=x='(W-w)/2+65*pow(max(0,1-t/0.55),3)':y=650:eof_action=repeat[layout]"
            audio_index = 3
        else:
            graph += ';[base]null[layout]'
            audio_index = 2
        inputs += ['-i', str(wav)]
        label = text_filter(index, 'title', title, 350, 66, bold=True)
        caption = text_filter(index, 'subtitle', subtitle, 1610, 35, '0xff987a')
        footer = text_filter(index, 'footer', 'Aplicativo real | Midia e voz sinteticas', 1770, 24, '0xaab5be')
        if source is None:
            label = text_filter(index, 'title', title, 780, 66, bold=True)
        graph += f';[layout]{label},{caption},{footer},drawbox=x=60:y=1560:w=960:h=3:color=0xff7856:t=fill,format=yuv420p[v]'
        graph += f';[{audio_index}:a]atempo={tempo},loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=duration={duration},afade=t=out:st={duration-.12}:d=0.12[a]'
        script = OUT / f'cena-{index}.filter'
        script.write_text(graph, 'utf-8')
        target = OUT / f'cena-{index}.mp4'
        run([*inputs, '-filter_complex_threads', '1', '-filter_complex_script', str(script), '-map', '[v]', '-map', '[a]',
             '-t', str(duration), '-r', '30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-threads', '2',
             '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(target)])
        parts.append(target)
        print(f'Cena {index+1}/7 pronta', flush=True)
    inputs = []
    for part in parts:
        inputs += ['-i', str(part)]
    graph = []
    elapsed = SCENES[0][0]
    video, audio = '0:v', '0:a'
    for index in range(1, len(parts)):
        graph.append(f'[{video}][{index}:v]xfade=transition=fade:duration=0.3:offset={elapsed-.3:.3f}[v{index}]')
        graph.append(f'[{audio}][{index}:a]acrossfade=d=0.3[a{index}]')
        video, audio = f'v{index}', f'a{index}'
        elapsed += SCENES[index][0] - .3
    script = OUT / 'montagem.filter'
    script.write_text(';'.join(graph), 'utf-8')
    target = OUT / 'Vox-Corte-Apresentacao-30s.mp4'
    run([*inputs, '-filter_complex_threads', '1', '-filter_complex_script', str(script), '-map', f'[{video}]', '-map', f'[{audio}]',
         '-t', '30', '-r', '30', '-fps_mode', 'cfr', '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-threads', '2',
         '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(target)])
    info = probe(target)
    assert info['width'] == 1080 and info['height'] == 1920 and info['audio'] and abs(info['duration']-30)<.15
    run(['-i', str(target), '-f', 'null', '-'])
    for index, time in enumerate([1, 9, 14, 20, 28]):
        run(['-ss', str(time), '-i', str(target), '-frames:v', '1', str(OUT / f'preview-{index}.jpg')])
    (OUT / 'validacao.json').write_text(json.dumps(info, indent=2), 'utf-8')
    print('Video validado:', target, flush=True)

if __name__ == '__main__':
    asyncio.run(main())

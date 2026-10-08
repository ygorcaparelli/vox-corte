import argparse
import asyncio
import array
import base64
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
import uuid

from core import kept_intervals, export_filter, concat_manifest
from zoom import compile_zooms, zoom_filter
from import_store import ImportStore
from file_dialogs import save_video_dialog

DATA = Path(os.environ.get('FALA_DATA', str(Path(__file__).resolve().parent.parent / '.local')))
DATA.mkdir(parents=True, exist_ok=True)
MODELS = {'tiny': 'Systran/faster-whisper-tiny', 'base': 'Systran/faster-whisper-base', 'small': 'Systran/faster-whisper-small', 'medium': 'Systran/faster-whisper-medium'}


def ffmpeg():
    if shutil.which('ffmpeg'):
        return shutil.which('ffmpeg')
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def probe(path):
    if shutil.which('ffprobe'):
        r = subprocess.run(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)], capture_output=True, text=True, check=True)
        info = json.loads(r.stdout)
        v = next(s for s in info['streams'] if s['codec_type'] == 'video')
        n, d = v.get('avg_frame_rate', '0/1').split('/')
        return {'duration': float(info['format']['duration']), 'width': v['width'], 'height': v['height'], 'fps': float(n) / max(float(d), 1), 'audio': any(s['codec_type'] == 'audio' for s in info['streams'])}
    r = subprocess.run([ffmpeg(), '-hide_banner', '-i', str(path)], capture_output=True, text=True, encoding='utf-8', errors='replace')
    dur = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', r.stderr)
    dimensions = re.search(r'Video:.*?\b(\d{2,5})x(\d{2,5})\b', r.stderr)
    fps = re.search(r'(\d+(?:\.\d+)?) fps', r.stderr)
    if not dur or not dimensions:
        raise ValueError('Não foi possível ler o vídeo. Verifique o formato e o FFmpeg.')
    return {'duration': int(dur[1]) * 3600 + int(dur[2]) * 60 + float(dur[3]), 'width': int(dimensions[1]), 'height': int(dimensions[2]), 'fps': float(fps[1]) if fps else 30, 'audio': 'Audio:' in r.stderr}


def read_job(job):
    path = DATA / 'jobs' / f'{job}.json'
    for attempt in range(100):
        try:
            return json.loads(path.read_text('utf-8'))
        except (PermissionError, json.JSONDecodeError):
            if attempt == 99:
                raise
            time.sleep(.01)


def status(job, **values):
    path = DATA / 'jobs' / f'{job}.json'
    previous = read_job(job) if path.exists() else {}
    previous.update(values)
    temp = path.with_name(job + '.' + uuid.uuid4().hex + '.tmp')
    temp.write_text(json.dumps(previous, ensure_ascii=False), 'utf-8')
    for attempt in range(50):
        try:
            os.replace(temp, path)
            break
        except PermissionError:
            if attempt == 49:
                raise
            time.sleep(.01)


def download_model(job, model):
    repo = MODELS[model]
    request = urllib.request.Request(f'https://huggingface.co/api/models/{repo}?blobs=true', headers={'User-Agent': 'FalaCorte/1.0'})
    with urllib.request.urlopen(request, timeout=60) as response:
        files = json.load(response)['siblings']
    required = [f for f in files if f['rfilename'] in ['config.json', 'model.bin', 'tokenizer.json', 'vocabulary.json', 'vocabulary.txt', 'preprocessor_config.json']]
    total = sum(f.get('size', f.get('lfs', {}).get('size', 0)) for f in required)
    folder = DATA / 'models' / model
    folder.mkdir(parents=True, exist_ok=True)
    done = 0
    for file in required:
        name = file['rfilename']
        size = file.get('size', file.get('lfs', {}).get('size', 0))
        target = folder / name
        if target.exists() and target.stat().st_size == size and size:
            done += size
            continue
        with urllib.request.urlopen(f'https://huggingface.co/{repo}/resolve/main/{name}', timeout=90) as source, open(str(target) + '.part', 'wb') as dest:
            while True:
                chunk = source.read(1024 * 1024)
                if not chunk:
                    break
                dest.write(chunk)
                done += len(chunk)
                status(job, progress=done / total if total else 0, message=f'Baixando {name}', bytes=done, totalBytes=total)
        os.replace(str(target) + '.part', target)
    (folder / 'ready.json').write_text(json.dumps({'bytes': done}), 'utf-8')
    return {'model': model, 'bytes': done}


def transcribe(job, payload):
    from faster_whisper import WhisperModel
    folder = DATA / 'models' / payload['model']
    if not (folder / 'ready.json').exists():
        raise ValueError('Baixe o modelo antes de transcrever.')
    video = probe(payload['path'])
    device = payload.get('device', 'cpu')
    words = []
    def run(selected):
        status(job, message=f'Carregando modelo em {selected.upper()}', progress=0)
        engine = WhisperModel(str(folder), device=selected, compute_type='float16' if selected == 'cuda' else 'int8', local_files_only=True)
        segments, info = engine.transcribe(payload['path'], language=None if payload.get('language') == 'auto' else payload.get('language', 'pt'), word_timestamps=True, vad_filter=True)
        for segment in segments:
            for word in segment.words or []:
                words.append({'id': uuid.uuid4().hex, 'text': word.word.strip(), 'start': word.start, 'end': word.end, 'paragraph': segment.id})
            status(job, progress=min(segment.end / video['duration'], .99), message=f'Transcrevendo: {segment.end:.0f} de {video["duration"]:.0f} segundos')
        return {'words': words, 'language': info.language, 'device': selected}
    try:
        return run(device)
    except Exception:
        if device != 'cuda':
            raise
        words.clear()
        status(job, message='NVIDIA indisponível. Retomando em CPU.')
        return run('cpu')


def waveform(job, payload):
    duration = probe(payload['path'])['duration']
    raw = bytearray()
    log = DATA / 'jobs' / f'{job}.media.log'
    with open(log, 'wb') as errors:
        process = subprocess.Popen([ffmpeg(), '-v', 'error', '-i', payload['path'], '-vn', '-ac', '1', '-ar', '2000', '-f', 's16le', '-'], stdout=subprocess.PIPE, stderr=errors)
        status(job, childPid=process.pid, message='Analisando forma de onda')
        while chunk := process.stdout.read(65536):
            raw.extend(chunk)
            status(job, progress=min(len(raw) / max(duration * 4000, 1), .99))
        if process.wait():
            raise RuntimeError(log.read_text('utf-8', errors='replace')[-1500:])
    samples = array.array('h')
    samples.frombytes(raw[:len(raw) // 2 * 2])
    return {'peaks': [max((abs(x) for x in samples[int(i*len(samples)/400):int((i+1)*len(samples)/400)]), default=0) / 32768 for i in range(400)]}


def silence(job, payload):
    duration = probe(payload['path'])['duration']
    log = DATA / 'jobs' / f'{job}.silence.log'
    with open(log, 'w', encoding='utf-8') as errors:
        process = subprocess.Popen([ffmpeg(), '-hide_banner', '-i', payload['path'], '-vn', '-af', 'silencedetect=noise=-35dB:d=0.5', '-progress', 'pipe:1', '-nostats', '-f', 'null', '-'], stdout=subprocess.PIPE, stderr=errors, text=True)
        status(job, childPid=process.pid, message='Detectando silêncios')
        for line in process.stdout:
            if line.startswith('out_time_us=') and line.strip().split('=')[1].isdigit():
                status(job, progress=min(int(line.strip().split('=')[1]) / 1e6 / max(duration, .01), .99))
        if process.wait():
            raise RuntimeError(log.read_text('utf-8')[-1500:])
    stderr = log.read_text('utf-8')
    cuts, start = [], None
    for line in stderr.splitlines():
        a = re.search(r'silence_start: ([\d.]+)', line)
        b = re.search(r'silence_end: ([\d.]+)', line)
        if a:
            start = float(a[1])
        if b and start is not None:
            end = float(b[1])
            if end - start > .2:
                cuts.append({'id': uuid.uuid4().hex, 'start': start + .1, 'end': end - .1, 'label': 'Silêncio'})
            start = None
    if start is not None:
        end = probe(payload['path'])['duration']
        if end - start > .2:
            cuts.append({'id': uuid.uuid4().hex, 'start': start + .1, 'end': end, 'label': 'Silêncio'})
    return {'cuts': cuts}


def export(job, payload):
    source, output = Path(payload['path']).resolve(), Path(payload['output']).resolve()
    if source == output:
        raise ValueError('A exportação não pode substituir o vídeo original.')
    output.parent.mkdir(parents=True, exist_ok=True)
    info = probe(source)
    intervals = kept_intervals(payload['cuts'], info['duration'])
    if not intervals:
        raise ValueError('O vídeo inteiro foi excluído. Restaure um trecho antes de exportar.')
    duration = sum(e - s for s, e in intervals)
    status(job, duration=duration)
    temp = output.with_name(output.stem + '.' + job + '.partial.mp4')
    graph = DATA / 'jobs' / f'{job}.filter.txt'
    video_graph = DATA / 'jobs' / f'{job}.video-filter.txt'
    preview = payload.get('preview', False)
    zooms = compile_zooms(payload.get('zooms', []), intervals, info['duration'])
    zoom_width = min(960, info['width']) if preview else info['width']
    zoom_height = round(info['height'] * zoom_width / info['width'])
    zoom = zoom_filter(zooms, zoom_width, zoom_height, 30 if preview else info['fps'])
    sequential = len(intervals) > 16 or payload.get('sequential', False)
    if sequential:
        graph.write_text(concat_manifest(source, intervals), 'utf-8')
        video_filter = 'select=concatdec_select,pad=ceil(iw/2)*2:ceil(ih/2)*2'
        if preview:
            video_filter += ",scale=w='min(960,iw)':h=-2:flags=fast_bilinear,fps=30"
        if zoom:
            video_filter += ',setpts=PTS-STARTPTS,' + zoom
        video_graph.write_text(video_filter, 'utf-8')
        command = [ffmpeg(), '-hide_banner', '-y', '-threads', '2' if preview else '4', '-copyts', '-f', 'concat', '-safe', '0', '-segment_time_metadata', '1', '-i', str(graph), '-map', '0:v:0', '-filter_script:v', str(video_graph), '-fps_mode', 'vfr']
    else:
        graph.write_text(export_filter(intervals, info['audio'], preview, zoom), 'utf-8')
        command = [ffmpeg(), '-hide_banner', '-y', '-threads', '2' if preview else '4', '-i', str(source), '-filter_complex_threads', '2', '-filter_complex_script', str(graph), '-map', '[video]']
    if info['audio']:
        command += ['-map', '0:a:0' if sequential else '[audio]', '-c:a', 'aac', '-b:a', '192k']
        if sequential:
            command += ['-af', 'aselect=concatdec_select,aresample=async=1:first_pts=0']
    encoder = 'libx264'
    if payload.get('encoder', 'auto') != 'cpu':
        status(job, message='Verificando aceleracao NVIDIA')
        try:
            check = subprocess.run([ffmpeg(), '-v', 'error', '-f', 'lavfi', '-i', 'color=s=128x128:r=30:d=0.1', '-frames:v', '3', '-c:v', 'h264_nvenc', '-f', 'null', '-'], capture_output=True, timeout=10, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            if check.returncode == 0:
                encoder = 'h264_nvenc'
        except (OSError, subprocess.TimeoutExpired):
            pass
    base_command = command[:]
    hwdecode = False
    if sequential and encoder == 'h264_nvenc':
        try:
            decode_check = subprocess.run([ffmpeg(), '-v', 'error', '-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda', '-i', str(source), '-frames:v', '2', '-vf', 'hwdownload,format=nv12', '-an', '-f', 'null', '-'], capture_output=True, timeout=10, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            hwdecode = decode_check.returncode == 0
        except (OSError, subprocess.TimeoutExpired):
            pass
        if hwdecode:
            input_index = command.index('-i')
            command[input_index:input_index] = ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda']
            video_graph.write_text(video_filter.replace('select=concatdec_select,', 'select=concatdec_select,hwdownload,format=nv12,', 1), 'utf-8')
    cpu_options = ['-c:v', 'libx264', '-threads', '2' if preview else '4', '-preset', 'ultrafast' if preview else 'veryfast', '-crf', '28' if preview else '18']
    if encoder == 'h264_nvenc':
        command += ['-c:v', encoder, '-preset', 'p4', '-rc', 'vbr', '-cq', '28' if preview else '20', '-b:v', '0']
    else:
        command += cpu_options
    output_options = ['-pix_fmt', 'yuv420p', '-t', f'{duration:.6f}', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', str(temp)]
    command += output_options
    log = DATA / 'jobs' / f'{job}.ffmpeg.log'
    try:
        while True:
            with open(log, 'w', encoding='utf-8') as errors:
                process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=errors, text=True)
                status(job, childPid=process.pid)
                for line in process.stdout:
                    if line.startswith('out_time_us='):
                        value = line.strip().split('=')[1]
                        if value.isdigit():
                            status(job, progress=min(int(value) / 1e6 / duration, .99), message=f'Codificando áudio e vídeo · {"NVIDIA" if encoder == "h264_nvenc" else "CPU"} · {"sequencial" if sequential else "cortes"}')
                    elif line.startswith('speed='):
                        status(job, speed=line.strip().split('=',1)[1])
                code = process.wait()
            if not code:
                break
            if encoder == 'h264_nvenc':
                encoder = 'libx264'
                hwdecode = False
                command = base_command + cpu_options + output_options
                if sequential:
                    video_graph.write_text(video_filter, 'utf-8')
                status(job, progress=0, message='A codificação NVIDIA falhou. Retomando em CPU.', speed='')
                continue
            raise RuntimeError(log.read_text('utf-8')[-1800:])
        os.replace(temp, output)
    finally:
        if temp.exists():
            temp.unlink()
        graph.unlink(missing_ok=True)
        video_graph.unlink(missing_ok=True)
    return {'path': str(output), 'duration': duration, 'encoder': encoder, 'sequential': sequential, 'hwdecode': hwdecode}


def breaths(job, payload):
    from faster_whisper.audio import decode_audio
    from faster_whisper.vad import get_speech_timestamps, VadOptions
    from breaths import breath_candidates, dry_cuts, speech_intervals
    status(job, message='Lendo áudio para analisar respirações', progress=0)
    audio = decode_audio(payload['path'], sampling_rate=16000)
    sensitivity = max(1, min(3, int(payload.get('sensitivity', 2))))
    options = VadOptions(threshold=.5 if payload.get('dry') else {1:.5,2:.6,3:.7}[sensitivity],
                         min_speech_duration_ms=60 if payload.get('dry') else 100,
                         min_silence_duration_ms=80 if payload.get('dry') else 100, speech_pad_ms=0)
    speech = speech_intervals(audio, get_speech_timestamps, options,
                             lambda value: status(job, progress=.9*value, message='Separando fala de pausas e ruídos'))
    words = [{'start': float(w['start']), 'end': float(w['end'])} for w in payload.get('words', [])]
    if payload.get('dry'):
        return {'cuts': dry_cuts(speech, words, len(audio)/16000), 'method': 'Corte seco original (1.10.2)'}
    result = breath_candidates(audio, speech, words, sensitivity)
    return {'candidates': result, 'method': 'VAD e características do áudio; candidatos precisam de revisão'}


def thumbnails(job, payload):
    info = probe(payload['path'])
    frames = []
    count = 24
    for index in range(count):
        moment = min(max(0, info['duration']-.05), (index+.5)*info['duration']/count)
        status(job, message='Gerando miniaturas do vídeo', progress=index/count)
        process = subprocess.Popen([ffmpeg(), '-v', 'error', '-ss', str(moment), '-i', payload['path'], '-frames:v', '1', '-vf', 'scale=160:-2', '-an', '-threads', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        status(job, childPid=process.pid)
        try:
            image, errors = process.communicate(timeout=30)
        except subprocess.TimeoutExpired:
            process.kill();process.communicate()
            raise RuntimeError('A miniatura demorou demais. Verifique o arquivo de vídeo.')
        if process.returncode or not image:
            raise RuntimeError('Não foi possível gerar miniaturas. '+errors.decode('utf-8',errors='replace')[-600:])
        frames.append({'time':moment,'image':'data:image/jpeg;base64,'+base64.b64encode(image).decode('ascii')})
    return {'frames':frames}


def worker(job):
    payload = json.loads((DATA / 'jobs' / f'{job}.request.json').read_text('utf-8'))
    try:
        kind = payload.pop('kind')
        if read_job(job).get('state') == 'cancelled':
            return
        status(job, state='running', progress=0, message='Preparando', workerPid=os.getpid())
        result = {'download': lambda: download_model(job, payload['model']), 'transcribe': lambda: transcribe(job, payload), 'waveform': lambda: waveform(job, payload), 'thumbnails': lambda: thumbnails(job, payload), 'silence': lambda: silence(job, payload), 'export': lambda: export(job, payload), 'preview': lambda: export(job, payload), 'breaths': lambda: breaths(job, payload), 'tighten': lambda: breaths(job, {**payload, 'dry': True})}[kind]()
        status(job, state='done', progress=1, message='Concluído', result=result)
    except Exception as exc:
        status(job, state='error', message=str(exc))


def server(port):
    from fastapi import FastAPI, HTTPException, Request, UploadFile, File
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse
    import uvicorn
    from starlette.concurrency import run_in_threadpool
    class MediaResponse(FileResponse):
        chunk_size = 1024 * 1024
    api = FastAPI()
    token = os.environ.get('FALA_TOKEN', 'development-local')
    origins = [f'http://{host}:{port}' for host in ('127.0.0.1', 'localhost') for port in range(5173, 5181)]
    api.add_middleware(CORSMiddleware, allow_origins=[*origins, 'null'], allow_methods=['*'], allow_headers=['*'], expose_headers=['Accept-Ranges', 'Content-Range', 'Content-Length'])
    videos, processes = {}, {}
    import_store = ImportStore(DATA / 'imports')
    from recovery import RecoveryStore
    recovery = RecoveryStore(DATA / 'recovery')
    from projects import ProjectStore
    projects = ProjectStore(DATA / 'projects')
    preview_jobs = set()
    (DATA / 'jobs').mkdir(exist_ok=True)
    @api.middleware('http')
    async def authenticate(request: Request, call_next):
        if request.method != 'OPTIONS' and request.headers.get('authorization') != f'Bearer {token}' and request.query_params.get('token') != token:
            from fastapi.responses import JSONResponse
            return JSONResponse({'detail': 'Acesso local não autorizado'}, status_code=401)
        return await call_next(request)
    @api.get('/health')
    def health():
        try:
            ff = ffmpeg()
        except Exception:
            ff = None
        try:
            import ctranslate2
            gpu = ctranslate2.get_cuda_device_count() > 0
        except Exception:
            gpu = False
        return {'ffmpeg': bool(ff), 'ffprobe': bool(shutil.which('ffprobe')), 'whisper': bool(importlib.util.find_spec('faster_whisper')), 'cuda': gpu, 'thumbnails': True, 'zooms': True, 'exportPicker': os.name == 'nt', 'python': sys.version.split()[0], 'pid': os.getpid()}
    export_dialog_lock = asyncio.Lock()
    @api.post('/export-location')
    async def export_location(request: Request):
        payload = await request.json()
        if export_dialog_lock.locked():
            raise HTTPException(409, 'O seletor de destino já está aberto.')
        async with export_dialog_lock:
            settings = DATA / 'export-folder.json'
            try:
                directory = json.loads(settings.read_text('utf-8')).get('directory', '')
            except (OSError, ValueError):
                directory = ''
            try:
                path = await run_in_threadpool(save_video_dialog, payload.get('filename', 'video.mp4'), directory)
            except Exception as error:
                raise HTTPException(400, str(error))
            if path:
                temporary = settings.with_suffix('.' + uuid.uuid4().hex + '.tmp')
                try:
                    temporary.write_text(json.dumps({'directory':str(Path(path).parent)}), 'utf-8')
                    os.replace(temporary, settings)
                finally:
                    temporary.unlink(missing_ok=True)
            return {'path':path}
    @api.get('/models')
    def models():
        return [{'id': name, 'ready': (DATA / 'models' / name / 'ready.json').exists(), 'estimatedMB': size} for name, size in [('tiny', 75), ('base', 145), ('small', 485), ('medium', 1530)]]
    def register(path):
        p = Path(path).resolve()
        if not p.is_file():
            raise HTTPException(400, 'Arquivo não encontrado')
        try:
            info = probe(p)
        except Exception as e:
            raise HTTPException(400, str(e))
        identifier = uuid.uuid4().hex
        videos[identifier] = str(p)
        return {**info, 'id': identifier, 'path': str(p), 'name': p.name, 'size': p.stat().st_size}
    @api.get('/projects')
    def list_projects():
        return projects.list()
    @api.post('/projects')
    async def create_project(request: Request):
        try:
            return projects.create((await request.json()).get('name', ''))
        except ValueError as error:
            raise HTTPException(400, str(error))
    @api.api_route('/projects/{identifier}', methods=['GET', 'PUT', 'PATCH', 'DELETE'])
    async def project_record(identifier: str, request: Request):
        try:
            if request.method == 'GET':
                return projects.get(identifier)
            if request.method == 'DELETE':
                return projects.delete(identifier)
            raw = await request.body()
            if len(raw) > 20*1024*1024:
                raise HTTPException(413, 'Projeto excede 20 MB.')
            payload = json.loads(raw)
            if request.method == 'PATCH':
                return projects.rename(identifier, payload.get('name', ''))
            return projects.save({**payload, 'projectId': identifier})
        except FileNotFoundError:
            raise HTTPException(404, 'Projeto não encontrado.')
        except (ValueError, TypeError) as error:
            raise HTTPException(400, str(error))
    @api.get('/recovery')
    def recover_project():
        return recovery.load()
    @api.put('/recovery')
    async def save_recovery(request: Request):
        data = await request.body()
        if len(data) > 20*1024*1024:
            raise HTTPException(413, 'Projeto excede o limite de recuperação de 20 MB.')
        try:
            return await run_in_threadpool(recovery.save, json.loads(data))
        except (ValueError, TypeError) as error:
            raise HTTPException(400, str(error))
    @api.post('/videos')
    async def import_path(request: Request):
        payload = await request.json()
        if not payload.get('previewResult'):
            for identifier in list(preview_jobs):
                cancel(identifier)
        return register(payload['path'])
    @api.post('/upload')
    async def upload(file: UploadFile = File(...)):
        try:
            target, created = await run_in_threadpool(import_store.store, file.file, file.filename)
            try:
                result = await run_in_threadpool(register, target)
            except Exception:
                if created:
                    target.unlink(missing_ok=True)
                raise
            return {**result, 'name': Path(file.filename or 'video.mp4').name, 'reused': not created}
        finally:
            await file.close()
    @api.get('/media/{identifier}')
    def media(identifier: str, download: bool = False):
        if identifier not in videos:
            raise HTTPException(404)
        return MediaResponse(videos[identifier], filename=Path(videos[identifier]).name if download else None)
    @api.post('/jobs')
    async def start(request: Request):
        payload = await request.json()
        if payload.get('kind') not in ['download', 'transcribe', 'waveform', 'thumbnails', 'silence', 'export', 'preview', 'breaths', 'tighten']:
            raise HTTPException(400, 'Tarefa inválida')
        if payload['kind'] == 'download':
            if payload.get('model') not in MODELS:
                raise HTTPException(400, 'Modelo inválido')
        else:
            if payload.get('videoId') not in videos:
                raise HTTPException(400, 'Importe o vídeo primeiro')
            payload['path'] = videos[payload.pop('videoId')]
            if payload['kind'] == 'transcribe' and payload.get('model') not in MODELS:
                raise HTTPException(400, 'Modelo inválido')
            if payload['kind'] == 'export' and not payload.get('output'):
                payload['output'] = str(DATA / 'exports' / (uuid.uuid4().hex + '.mp4'))
            if payload['kind'] == 'preview':
                for old in list(preview_jobs):
                    cancel(old)
                payload.setdefault('cuts', [])
                payload['preview'] = True
                payload['output'] = str(DATA / 'previews' / (uuid.uuid4().hex + '.mp4'))
        identifier = uuid.uuid4().hex
        (DATA / 'jobs' / f'{identifier}.request.json').write_text(json.dumps(payload), 'utf-8')
        status(identifier, state='queued', progress=0, message='Na fila')
        with open(DATA / 'jobs' / f'{identifier}.worker.log', 'w', encoding='utf-8') as log:
            processes[identifier] = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--worker', identifier], env=os.environ.copy(), stdout=log, stderr=log, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        if payload['kind'] == 'preview':
            preview_jobs.add(identifier)
        return {'id': identifier}
    @api.get('/jobs/{identifier}')
    def get_job(identifier: str):
        if identifier not in processes:
            raise HTTPException(404)
        try:
            result = read_job(identifier)
        except (PermissionError, json.JSONDecodeError):
            raise HTTPException(503, 'Progresso temporariamente ocupado. Aguarde a próxima atualização.')
        if processes[identifier].poll() is not None and result['state'] in ('queued', 'running'):
            log = DATA / 'jobs' / f'{identifier}.worker.log'
            status(identifier, state='error', message='O processo terminou inesperadamente. ' + (log.read_text('utf-8')[-1500:] if log.exists() else 'Verifique as dependências.'))
            result = read_job(identifier)
        return result
    @api.delete('/jobs/{identifier}')
    def cancel(identifier: str):
        preview_jobs.discard(identifier)
        process = processes.get(identifier)
        if process and process.poll() is None:
            job_state = read_job(identifier)
            status(identifier, state='cancelled', message='Cancelado')
            for pid in [job_state.get('childPid'), job_state.get('workerPid')]:
                if pid:
                    try:
                        os.kill(pid, signal.SIGTERM)
                    except OSError:
                        pass
            process.terminate()
            process.wait(timeout=10)
            status(identifier, state='cancelled', message='Cancelado')
            req = json.loads((DATA / 'jobs' / f'{identifier}.request.json').read_text('utf-8'))
            if req['kind'] in ('export', 'preview'):
                p = Path(req['output'])
                partial = p.with_name(p.stem + '.' + identifier + '.partial.mp4')
                for attempt in range(50):
                    try:
                        partial.unlink(missing_ok=True)
                        break
                    except PermissionError:
                        time.sleep(.1)
                (DATA / 'jobs' / f'{identifier}.filter.txt').unlink(missing_ok=True)
        return {'ok': True}
    local_server = uvicorn.Server(uvicorn.Config(api, host='127.0.0.1', port=port, log_level='warning'))
    @api.post('/shutdown')
    def shutdown():
        for identifier in list(processes):
            cancel(identifier)
        local_server.should_exit = True
        return {'ok': True}
    local_server.run()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--worker')
    args = parser.parse_args()
    worker(args.worker) if args.worker else server(args.port)

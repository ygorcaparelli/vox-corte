"""Sugestões de ruído respiratório; nunca aplica cortes automaticamente."""
import uuid
import numpy as np
from core import kept_intervals, merge_cuts


def speech_intervals(audio, detector, options, progress=None, rate=16000, context_seconds=0):
    size, context = 30*rate, int(context_seconds*rate)
    speech = []
    # Zero context preserves the original 1.10.2 detector window boundaries.
    for offset in range(0, len(audio), size):
        start, end = max(0, offset-context), min(len(audio), offset+size+context)
        chunks = detector(audio[start:end], options)
        speech.extend({'start': (start+c['start'])/rate,
                       'end': (start+c['end'])/rate} for c in chunks)
        if progress:
            progress(min((offset+size)/max(len(audio), 1), 1))
    return merge_cuts(speech, len(audio)/rate)


def dry_cuts(speech, words, duration, protect=False):
    protected = merge_cuts([{'start':max(0,c['start']-(.18 if protect else 0)),
                            'end':min(duration,c['end']+(.3 if protect else 0))} for c in speech] +
                          [{'start':max(0,c['start']-(.18 if protect else 0)),
                            'end':min(duration,c['end']+(.3 if protect else 0))} for c in words], duration)
    if not protected:
        raise ValueError('Nenhuma fala foi identificada. Gere a transcrição ou faça um corte manual; o vídeo não foi excluído.')
    return [{'id': uuid.uuid4().hex, 'start': round(start, 4), 'end': round(end, 4), 'label': 'Corte seco entre falas', 'automatic': True}
            for start, end in kept_intervals(protected, duration) if end - start >= (.2 if protect else .08)]


def breath_candidates(audio, speech, words, sensitivity=2, rate=16000):
    sensitivity = max(1, min(3, int(sensitivity)))
    duration = len(audio) / rate
    protected = [{'start': max(0, c['start'] - .08), 'end': c['end'] + .08} for c in speech + words]
    candidates = []
    for start, end in kept_intervals(protected, duration):
        # Fluxo de 20 ms: separa uma inspiração curta de uma pausa longa.
        frame_size = int(rate * .02)
        first, last = int(start * rate), int(end * rate)
        frames = []
        for offset in range(first, last, frame_size):
            frame = audio[offset:min(offset + frame_size, last)]
            if len(frame) < frame_size // 2:
                continue
            db = 20 * np.log10(max(float(np.sqrt(np.mean(frame ** 2))), 1e-10))
            if db < {1: -42, 2: -48, 3: -54}[sensitivity]:
                continue
            power = np.abs(np.fft.rfft(frame * np.hanning(len(frame)), n=512)) ** 2
            power = power[1:] + 1e-12
            flatness = np.exp(np.mean(np.log(power))) / np.mean(power)
            frequencies = np.fft.rfftfreq(512, 1 / rate)[1:]
            centroid = float(np.sum(power * frequencies) / np.sum(power))
            if flatness >= {1: .2, 2: .12, 3: .07}[sensitivity] and centroid >= 500:
                frames.append({'start': offset / rate, 'end': min(offset + frame_size, last) / rate})
        # Junta falhas de até 60 ms, sem atravessar regiões de fala protegidas.
        runs = merge_cuts([{'start': f['start'], 'end': min(f['end'] + .06, end)} for f in frames], duration)
        for run in runs:
            a, b = max(start, run['start'] - .02), min(end, run['end'])
            if .15 <= b - a <= 1.5:
                candidates.append({'id': uuid.uuid4().hex, 'start': round(a, 4), 'end': round(b, 4), 'label': 'Possível respiração'})
    return candidates

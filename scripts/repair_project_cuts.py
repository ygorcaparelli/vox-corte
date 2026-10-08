"""Reanalyze automatic cuts into an independent project, without touching media."""
import argparse
import json
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent.parent/'backend'))
from breaths import dry_cuts, speech_intervals
from projects import ProjectStore
from core import merge_cuts

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('project',type=Path)
    args=parser.parse_args()
    original=json.loads(args.project.read_text('utf-8'))
    source=Path(original['videoPath'])
    if not source.is_file():
        raise ValueError('Video original nao encontrado; nenhum projeto foi alterado.')
    from faster_whisper.audio import decode_audio
    from faster_whisper.vad import get_speech_timestamps, VadOptions
    print('Analisando o audio original, sem copiar o video...',flush=True)
    audio=decode_audio(str(source),sampling_rate=16000)
    options=VadOptions(threshold=.35,min_speech_duration_ms=40,min_silence_duration_ms=250,speech_pad_ms=0)
    speech=speech_intervals(audio,get_speech_timestamps,options,lambda p:print(f'Analise: {p:.0%}',flush=True))
    duration=len(audio)/16000
    detected=dry_cuts(speech,original['edit']['words'],duration,protect=True)
    if sum(c['end']-c['start'] for c in detected)>.8*duration:
        raise ValueError('Analise removeria mais de 80%; copia nao criada.')
    old=original['edit']['cuts']
    manual=[c for c in old if not c.get('automatic') and c.get('label')!='Corte seco entre falas']
    store=ProjectStore(args.project.parent)
    record=store.create(original['projectName']+' (cortes revisados)')
    record.update(videoPath=str(source),videoName=original['videoName'],
                  edit={**original['edit'],'cuts':manual+detected},updatedAt=time.time()*1000+1)
    store.save(record)
    def removed(cuts):
        return sum(c['end']-c['start'] for c in merge_cuts(cuts,duration))
    print(json.dumps(dict(project=record['projectName'],projectId=record['projectId'],
                         oldCuts=len(old),newCuts=len(record['edit']['cuts']),
                         oldRemovedSeconds=round(removed(old),2),
                         newRemovedSeconds=round(removed(record['edit']['cuts']),2),
                         originalProjectPreserved=True),ensure_ascii=False),flush=True)

if __name__=='__main__':
    main()

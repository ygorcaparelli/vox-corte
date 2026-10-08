"""Replace demo narration only; retain authentic before/after test audio."""
import asyncio
from pathlib import Path
import re
import subprocess
import sys

import edge_tts

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / 'backend'))
from app import ffmpeg

async def main():
    source = (root / 'scripts/PrepareLinkedInSpeech.ps1').read_text('utf-8')
    block = source.split('$narrations = @(')[-1] if '$narrations = @(' in source else source.split('$narrations=@(')[-1]
    block = block.split(')')[0]
    phrases = re.findall(r"'([^']+)'", block)
    assert len(phrases) == 12, len(phrases)
    out = root / 'outputs/linkedin'
    for index, phrase in enumerate(phrases):
        mp3 = out / f'narracao-neural-{index}.mp3'
        await edge_tts.Communicate(phrase, 'pt-BR-AntonioNeural', rate='-3%').save(str(mp3))
        subprocess.run([ffmpeg(), '-y', '-v', 'error', '-i', str(mp3), '-ac', '1', '-ar', '48000', str(out / f'narracao-{index}.wav')], check=True)
        print(f'Narracao {index + 1}/12 pronta', flush=True)

if __name__ == '__main__':
    asyncio.run(main())

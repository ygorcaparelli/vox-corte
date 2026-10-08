import math
from pathlib import Path


def merge_cuts(cuts, duration):
    result = []
    for cut in sorted(cuts, key=lambda c: float(c['start'])):
        start, end = max(0, float(cut['start'])), min(duration, float(cut['end']))
        if not math.isfinite(start) or not math.isfinite(end) or end <= start:
            continue
        if result and start <= result[-1]['end']:
            result[-1]['end'] = max(end, result[-1]['end'])
        else:
            result.append({'start': start, 'end': end})
    return result


def kept_intervals(cuts, duration):
    cursor, kept = 0.0, []
    for cut in merge_cuts(cuts, duration):
        if cut['start'] > cursor:
            kept.append((cursor, cut['start']))
        cursor = cut['end']
    if cursor < duration:
        kept.append((cursor, duration))
    return kept


def export_filter(intervals, audio=True, preview=False, zoom=''):
    chains, labels = [], []
    if preview:
        sources = ''.join(f'[source{i}]' for i in range(len(intervals)))
        chains.append(f"[0:v:0]scale=w='min(960,iw)':h=-2:flags=fast_bilinear,fps=30,split={len(intervals)}{sources}")
    for i, (start, end) in enumerate(intervals):
        source = f'[source{i}]' if preview else '[0:v:0]'
        chains.append(f'{source}trim=start={start:.6f}:end={end:.6f},setpts=PTS-STARTPTS,pad=ceil(iw/2)*2:ceil(ih/2)*2[v{i}]')
        labels.append(f'[v{i}]')
        if audio:
            chains.append(f'[0:a:0]atrim=start={start:.6f}:end={end:.6f},asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0[a{i}]')
            labels.append(f'[a{i}]')
    chains.append(''.join(labels) + f'concat=n={len(intervals)}:v=1:a={int(audio)}' + ('[montage]' if zoom else '[video]') + ('[audio]' if audio else ''))
    if zoom:
        chains.append(f'[montage]{zoom}[video]')
    return ';'.join(chains)


def concat_manifest(source, intervals):
    name = Path(source).resolve().as_posix()
    if '\n' in name or '\r' in name:
        raise ValueError('Nome de arquivo invalido para processamento sequencial.')
    escaped = name.replace("'", "'\\''")
    lines = ['ffconcat version 1.0']
    for start, end in intervals:
        lines.extend([f"file '{escaped}'", f'inpoint {start:.6f}', f'outpoint {end:.6f}', f'duration {end-start:.6f}'])
    return '\n'.join(lines) + '\n'

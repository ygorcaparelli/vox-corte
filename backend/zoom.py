import math


def compile_zooms(zooms, intervals, duration):
    if not isinstance(zooms, list) or len(zooms) > 500:
        raise ValueError('Quantidade de efeitos de zoom inválida.')

    def edited(time):
        return sum(max(0, min(time, end) - start) for start, end in intervals if time > start)

    result = []
    previous_end = -1
    for z in sorted(zooms, key=lambda z: float(z['start'])):
        values = {key: float(z[key]) for key in ('start', 'end', 'from', 'to', 'x', 'y')}
        if not all(math.isfinite(v) for v in values.values()) or not 0 <= values['start'] < values['end'] <= duration + .001:
            raise ValueError('Intervalo de zoom inválido.')
        if not all(1 <= values[k] <= 3 for k in ('from', 'to')) or not all(0 <= values[k] <= 1 for k in ('x', 'y')) or z.get('curve') not in ('linear', 'smooth'):
            raise ValueError('Escala ou posição de zoom inválida.')
        if values['start'] < previous_end:
            raise ValueError('Os efeitos de zoom não podem se sobrepor.')
        previous_end = values['end']
        start, end = edited(values['start']), edited(values['end'])
        if end > start:
            motion = z.get('automaticMotion')
            if motion is not None and motion not in ('cut-out', 'slow-in', 'cut'):
                raise ValueError('Movimento automatico de zoom invalido.')
            result.append({**values, 'start': start, 'end': end, 'curve': z['curve'], 'automatic': z.get('automatic') is True, 'automaticMotion': motion})
    return result


def zoom_filter(zooms, width, height, fps):
    if not zooms:
        return ''
    width, height = math.ceil(width / 2) * 2, math.ceil(height / 2) * 2
    fps = min(240, max(1, float(fps)))
    scale, x, y = ['1'], ['0.5'], ['0.5']
    for z in zooms:
        start, end = z['start'], z['end']
        time = f'((on-1)/{fps:.8f})'
        inside = f'gte({time},{start:.8f})*lt({time},{end:.8f})'
        progress = f'(({time}-{start:.8f})/{end-start:.8f})'
        if z['curve'] == 'smooth':
            progress = f'({progress}*{progress}*(3-2*{progress}))'
        amount = f"({z['from']-1:.8f}+({z['to']-z['from']:.8f})*{progress})"
        if z.get('automatic') and not z.get('automaticMotion'):
            ramp = min(.35, (end-start)/4)
            entry = f'max(0,min(1,({time}-{start:.8f})/{ramp:.8f}))'
            exit = f'max(0,min(1,({end:.8f}-{time})/{ramp:.8f}))'
            amount += f'*({entry}*{entry}*(3-2*{entry}))*({exit}*{exit}*(3-2*{exit}))'
        scale.append(f"if({inside},{amount},0)")
        if z['x'] != .5:
            x.append(f"if({inside},{z['x']-.5:.8f},0)")
        if z['y'] != .5:
            y.append(f"if({inside},{z['y']-.5:.8f},0)")
    # Perspective samples fractional source coordinates: no integer/chroma crop snapping,
    # and no oversized intermediate frames needed to hide zoompan's rounding jitter.
    zoom = '(' + '+'.join(scale) + ')'
    left = f'(W-W/{zoom})*({"+".join(x)})'
    top = f'(H-H/{zoom})*({"+".join(y)})'
    right, bottom = f'({left})+W/{zoom}', f'({top})+H/{zoom}'
    corners = [left, top, right, top, left, bottom, right, bottom]
    coordinates = ':'.join(f'{axis}{i//2}=\'{value}\'' for i, (axis, value) in enumerate(zip('xyxyxyxy', corners)))
    enabled = '+'.join(f'gte(t,{z["start"]:.8f})*lt(t,{z["end"]:.8f})' for z in zooms)
    return f'fps={fps:.8f}:eof_action=pass,scale={width}:{height},perspective={coordinates}:sense=source:eval=frame:interpolation=linear:enable=\'{enabled}\''

"""Atomic edit-only recovery snapshots. Media files are never copied."""
import hashlib
import json
import math
import os
from pathlib import Path
import threading
import uuid


def validate(project):
    if not isinstance(project, dict) or project.get('version') != 1:
        raise ValueError('Projeto de recuperação inválido.')
    if not isinstance(project.get('videoPath'), str) or not project['videoPath']:
        raise ValueError('Caminho do vídeo inválido.')
    updated = project.get('updatedAt')
    if not isinstance(updated, (float, int)) or not math.isfinite(updated) or updated <= 0:
        raise ValueError('Data de recuperação inválida.')
    edit = project.get('edit')
    if not isinstance(edit, dict) or not all(isinstance(edit.get(k), list) for k in ('words','cuts')):
        raise ValueError('Edições inválidas.')
    for key in ('words', 'cuts', 'zooms'):
        if not isinstance(edit.get(key, []), list):
            raise ValueError('Lista de edições inválida.')
        for item in edit.get(key, []):
            if not isinstance(item, dict) or not isinstance(item.get('id'), str):
                raise ValueError('Identificador de edição inválido.')
            for edge in ('start','end'):
                if not isinstance(item.get(edge), (float,int)) or not math.isfinite(item[edge]):
                    raise ValueError('Tempo de edição inválido.')
            if item['start'] < 0 or (item['end'] < item['start'] if key == 'words' else item['end'] <= item['start']):
                raise ValueError('Intervalo de edição inválido.')
    return project


class RecoveryStore:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.lock = threading.Lock()

    def _read(self, path):
        try:
            return validate(json.loads(path.read_text('utf-8')))
        except (OSError, ValueError, TypeError):
            return None

    def load(self):
        with self.lock:
            return self._read(self.directory/'latest.json') or self._read(self.directory/'previous.json')

    def _write(self, path, project):
        temp = path.with_suffix('.'+uuid.uuid4().hex+'.tmp')
        try:
            with temp.open('w', encoding='utf-8') as stream:
                json.dump(project, stream, ensure_ascii=False, allow_nan=False)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp, path)
        finally:
            temp.unlink(missing_ok=True)

    def save(self, project):
        validate(project)
        with self.lock:
            self.directory.mkdir(parents=True, exist_ok=True)
            key = hashlib.sha256(project['videoPath'].encode('utf-8')).hexdigest()
            path = self.directory/(key+'.json')
            saved = self._read(path)
            if saved and saved['updatedAt'] > project['updatedAt']:
                return saved
            self._write(path, project)
            latest = self._read(self.directory/'latest.json')
            if latest and latest['updatedAt'] > project['updatedAt']:
                return project
            if latest:
                self._write(self.directory/'previous.json', latest)
            self._write(self.directory/'latest.json', project)
            return project

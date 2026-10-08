"""Persistent edit-only project library; deleting a record never touches media."""
import json
import time
import uuid
from recovery import RecoveryStore, validate


class ProjectStore(RecoveryStore):
    def path(self, identifier):
        try:
            identifier = str(uuid.UUID(identifier))
        except (ValueError, TypeError, AttributeError):
            raise ValueError('Identificador de projeto inválido.')
        return self.directory / (identifier + '.json')

    def list(self):
        with self.lock:
            result = []
            for path in self.directory.glob('*.json'):
                try:
                    p = json.loads(path.read_text('utf-8'))
                    result.append({k: v for k, v in p.items() if k != 'edit'})
                except (ValueError, OSError):
                    continue
            return sorted(result, key=lambda p: p['updatedAt'], reverse=True)

    def get(self, identifier):
        with self.lock:
            return json.loads(self.path(identifier).read_text('utf-8'))

    def create(self, name):
        name = str(name).strip()[:120]
        if not name:
            raise ValueError('Digite o nome do projeto.')
        p = dict(version=1, projectId=str(uuid.uuid4()), projectName=name,
                 videoPath='', videoName='', updatedAt=time.time()*1000,
                 edit=dict(words=[], cuts=[]))
        with self.lock:
            self.directory.mkdir(parents=True, exist_ok=True)
            self._write(self.path(p['projectId']), p)
        return p

    def save(self, project):
        validate({**project, 'videoPath': project.get('videoPath') or 'empty-project'})
        path = self.path(project.get('projectId'))
        with self.lock:
            saved = json.loads(path.read_text('utf-8'))
            if saved['updatedAt'] > project['updatedAt']:
                return saved
            project = {**project, 'projectName': saved['projectName']}
            self._write(path, project)
            return project

    def rename(self, identifier, name):
        name = str(name).strip()[:120]
        if not name:
            raise ValueError('Digite o nome do projeto.')
        with self.lock:
            path = self.path(identifier)
            p = json.loads(path.read_text('utf-8'))
            p['projectName'] = name
            self._write(path, p)
            return p

    def delete(self, identifier):
        with self.lock:
            self.path(identifier).unlink()
        return {'deleted': True}

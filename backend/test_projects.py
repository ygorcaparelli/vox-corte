import tempfile
import unittest
from pathlib import Path
from projects import ProjectStore


class ProjectTests(unittest.TestCase):
    def test_independent_projects_and_restart(self):
        with tempfile.TemporaryDirectory() as d:
            store = ProjectStore(Path(d)/'projects')
            source = Path(d)/'source.mp4'
            source.write_bytes(b'original')
            a, b = store.create('Primeiro'), store.create('Segundo')
            for p in (a,b):
                p.update(videoPath=str(source), videoName=source.name, updatedAt=p['updatedAt']+1)
                store.save(p)
            a['edit']['cuts'] = [dict(id='cut', start=1, end=2)]
            a['updatedAt'] += 1
            store.save(a)
            store = ProjectStore(Path(d)/'projects')
            self.assertEqual(len(store.list()), 2)
            self.assertEqual(store.get(b['projectId'])['edit']['cuts'], [])
            store.rename(a['projectId'], 'Renomeado')
            a['updatedAt'] += 1
            self.assertEqual(store.save(a)['projectName'], 'Renomeado')
            store.delete(a['projectId'])
            self.assertEqual(source.read_bytes(), b'original')
            self.assertEqual(len(store.list()), 1)
            with self.assertRaises(FileNotFoundError):
                store.save(a)

    def test_invalid_path_and_old_write(self):
        with tempfile.TemporaryDirectory() as d:
            store = ProjectStore(d)
            with self.assertRaises(ValueError):
                store.delete('../source')
            p = store.create('Projeto')
            old = {**p, 'updatedAt': p['updatedAt']-1, 'videoName':'old'}
            self.assertEqual(store.save(old)['videoName'], '')
            with self.assertRaises(ValueError):
                store.create(' ')

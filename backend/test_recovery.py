import json
from pathlib import Path
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from recovery import RecoveryStore


class RecoveryTests(unittest.TestCase):
    def project(self, time=1):
        return {'version':1,'videoPath':'D:/videos/original.mp4','videoName':'original.mp4','updatedAt':time,
                'edit':{'words':[],'cuts':[{'id':'cut','start':1,'end':2}], 'zoomSettings':{'frequency':'discreet','intensity':15,'excluded':[]}}}

    def test_persists_edits_not_media_and_ignores_late_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            store=RecoveryStore(directory)
            self.assertIsNone(store.load())
            store.save(self.project(3));store.save(self.project(1))
            self.assertEqual(RecoveryStore(directory).load(),self.project(3))
            self.assertTrue(all(p.suffix=='.json' for p in Path(directory).iterdir()))
            self.assertLess(sum(p.stat().st_size for p in Path(directory).iterdir()),4000)

    def test_backup_survives_corruption_and_parallel_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            store=RecoveryStore(directory)
            with ThreadPoolExecutor(max_workers=4) as pool:
                list(pool.map(lambda t:store.save(self.project(t)), range(1,10)))
            self.assertEqual(store.load()['updatedAt'],9)
            store.save(self.project(10))
            (Path(directory)/'latest.json').write_text('{broken')
            self.assertEqual(store.load()['updatedAt'],9)

    def test_invalid_project_does_not_replace_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            store=RecoveryStore(directory);store.save(self.project())
            for data in ({}, {**self.project(),'updatedAt':float('nan')}, {**self.project(),'edit':{'words':[],'cuts':[{'id':'bad','start':2,'end':1}]}}):
                with self.assertRaises(ValueError):store.save(data)
            self.assertEqual(store.load(),self.project())

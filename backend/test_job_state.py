import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import app


class JobStateTest(unittest.TestCase):
    def test_read_retries_windows_file_lock(self):
        with patch.object(Path, 'read_text', side_effect=[PermissionError(), PermissionError(), '{"state":"running","progress":0.2}']), patch.object(app.time, 'sleep') as sleep:
            self.assertEqual(app.read_job('fixture')['progress'], .2)
            self.assertEqual(sleep.call_count, 2)

    def test_persistent_lock_is_bounded(self):
        with patch.object(Path, 'read_text', side_effect=PermissionError()), patch.object(app.time, 'sleep') as sleep:
            with self.assertRaises(PermissionError):
                app.read_job('fixture')
            self.assertEqual(sleep.call_count, 99)

    def test_status_preserves_result_after_transient_read_lock(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(app, 'DATA', Path(directory)):
            (app.DATA / 'jobs').mkdir()
            path = app.DATA / 'jobs/fixture.json'
            path.write_text(json.dumps({'state':'running','progress':.2}), 'utf-8')
            original = Path.read_text
            count = 0
            def sometimes_locked(p, *args, **kwargs):
                nonlocal count
                count += 1
                if count == 1:
                    raise PermissionError()
                return original(p, *args, **kwargs)
            with patch.object(Path, 'read_text', sometimes_locked):
                app.status('fixture', state='done', result={'path':'video.mp4'})
            self.assertEqual(app.read_job('fixture')['result']['path'], 'video.mp4')


if __name__ == '__main__':
    unittest.main()

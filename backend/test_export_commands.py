from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import app


class ExportCommandTest(unittest.TestCase):
    def test_many_zooms_use_script_on_gpu_and_cpu_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory)
            (data / 'jobs').mkdir()
            output = data / 'export.mp4'
            calls = []
            def launch(command, **kwargs):
                script = Path(command[command.index('-filter_script:v') + 1])
                calls.append((command[:], script.read_text('utf-8')))
                Path(command[-1]).write_bytes(b'test output')
                return SimpleNamespace(pid=123, stdout=[], wait=lambda: 1 if len(calls) == 1 else 0)
            zooms = [{'start': i / 50, 'end': (i + .9) / 50, 'from': 1, 'to': 1.2, 'x': .5, 'y': .5, 'curve': 'smooth'} for i in range(269)]
            with patch.object(app, 'DATA', data), patch.object(app, 'probe', return_value={'duration':6,'width':320,'height':180,'fps':30,'audio':True}), patch.object(app, 'status'), patch.object(app, 'ffmpeg', return_value='ffmpeg'), patch.object(app.subprocess, 'run', return_value=SimpleNamespace(returncode=0)), patch.object(app.subprocess, 'Popen', side_effect=launch):
                result = app.export('fixture', {'path':str(data / 'source.mp4'),'output':str(output),'cuts':[],'zooms':zooms,'sequential':True})
            self.assertEqual(result['encoder'], 'libx264')
            self.assertEqual(len(calls), 2)
            for command, script in calls:
                self.assertLess(len(app.subprocess.list2cmdline(command)), 3000)
                self.assertGreater(len(script), 32767)
                self.assertNotIn('-vf', command)
                self.assertIn('perspective', script)
            self.assertIn('hwdownload,format=nv12', calls[0][1])
            self.assertNotIn('hwdownload', calls[1][1])
            self.assertTrue(output.exists())
            self.assertFalse((data / 'jobs/fixture.video-filter.txt').exists())
            self.assertFalse((data / 'jobs/fixture.filter.txt').exists())


if __name__ == '__main__':
    unittest.main()

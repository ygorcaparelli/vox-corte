import base64
import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from file_dialogs import save_video_dialog


class FileDialogTest(unittest.TestCase):
    def test_paths_are_data_not_executable_code(self):
        with patch('file_dialogs.subprocess.run', return_value=SimpleNamespace(returncode=0,stdout=json.dumps({'path':'D:/Videos/Final.mp4'}),stderr='')) as run:
            result = save_video_dialog('name;$(bad).mp4', "D:/Videos/João's vídeos")
        args, kwargs = run.call_args
        script = base64.b64decode(args[0][-1]).decode('utf-16le')
        self.assertIn('-STA', args[0])
        self.assertNotIn('$(bad)', script)
        self.assertEqual(json.loads(kwargs['input'])['directory'], "D:/Videos/João's vídeos")
        self.assertEqual(result, 'D:/Videos/Final.mp4')

    def test_cancel_returns_no_destination(self):
        with patch('file_dialogs.subprocess.run', return_value=SimpleNamespace(returncode=0,stdout='{"path":null}',stderr='')):
            self.assertIsNone(save_video_dialog('video.mp4'))

    def test_dialog_failure_is_reported(self):
        with patch('file_dialogs.subprocess.run', return_value=SimpleNamespace(returncode=1,stdout='',stderr='Dialog error')):
            with self.assertRaisesRegex(RuntimeError, 'seletor de destino'):
                save_video_dialog('video.mp4')


if __name__ == '__main__':
    unittest.main()

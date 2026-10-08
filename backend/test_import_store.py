from concurrent.futures import ThreadPoolExecutor
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from import_store import ImportStore


class ImportStoreTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.folder = Path(self.directory.name)
        self.store = ImportStore(self.folder)

    def test_repeated_import_reuses_content_even_with_another_name(self):
        first, created = self.store.store(io.BytesIO(b'video content'), 'a.mp4')
        second, repeated = self.store.store(io.BytesIO(b'video content'), 'renamed.mov')
        self.assertTrue(created)
        self.assertFalse(repeated)
        self.assertEqual(first, second)
        self.assertEqual(list(self.folder.iterdir()), [first])

    def test_legacy_path_is_preserved(self):
        legacy = self.folder / 'old-project-video.mp4'
        legacy.write_bytes(b'legacy video')
        path, created = self.store.store(io.BytesIO(b'legacy video'), 'new.mp4')
        self.assertEqual(path, legacy)
        self.assertFalse(created)
        self.assertEqual(len(list(self.folder.iterdir())), 1)

    def test_equal_size_and_name_do_not_mean_equal_content(self):
        first, _ = self.store.store(io.BytesIO(b'1234'), 'same.mp4')
        second, created = self.store.store(io.BytesIO(b'5678'), 'same.mp4')
        self.assertTrue(created)
        self.assertNotEqual(first, second)
        self.assertEqual(first.read_bytes(), b'1234')
        self.assertEqual(second.read_bytes(), b'5678')

    def test_concurrent_imports_only_publish_once(self):
        def send(_):
            return self.store.store(io.BytesIO(b'concurrent video'), 'test.mp4')
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(send, range(4)))
        self.assertEqual(sum(created for _, created in results), 1)
        self.assertEqual(len(list(self.folder.iterdir())), 1)

    def test_failed_copy_removes_partial_file(self):
        with patch('import_store.shutil.copyfileobj', side_effect=OSError('Disk full')):
            with self.assertRaises(OSError):
                self.store.store(io.BytesIO(b'video'), 'test.mp4')
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_large_stream_uses_bounded_reads(self):
        class BoundedStream(io.BytesIO):
            def read(self, size=-1):
                self.assert_size(size)
                return super().read(size)

            def assert_size(self, size):
                if size < 0 or size > 1024 * 1024:
                    raise AssertionError('Unbounded read')
        path, _ = self.store.store(BoundedStream(b'x' * (3 * 1024 * 1024)), 'large.mp4')
        self.assertEqual(path.stat().st_size, 3 * 1024 * 1024)


if __name__ == '__main__':
    unittest.main()

import hashlib
import os
from pathlib import Path
import shutil
import threading
import uuid


class ImportStore:
    def __init__(self, folder):
        self.folder = Path(folder)
        self.lock = threading.Lock()
        self.hashes = {}

    @staticmethod
    def digest(stream):
        stream.seek(0)
        hasher = hashlib.sha256()
        while chunk := stream.read(1024 * 1024):
            hasher.update(chunk)
        stream.seek(0)
        return hasher.hexdigest()

    def store(self, stream, filename):
        digest = self.digest(stream)
        stream.seek(0, os.SEEK_END)
        size = stream.tell()
        stream.seek(0)
        suffix = Path(filename or 'video.mp4').suffix.lower()
        if suffix not in {'.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v'}:
            suffix = '.mp4'
        with self.lock:
            self.folder.mkdir(parents=True, exist_ok=True)
            # Compare legacy imports too, without renaming paths saved in projects.
            for candidate in self.folder.iterdir():
                if candidate.is_symlink() or not candidate.is_file() or candidate.suffix == '.part':
                    continue
                stat = candidate.stat()
                if stat.st_size != size:
                    continue
                key = (str(candidate), stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)
                known = self.hashes.get(key)
                if known is None:
                    with candidate.open('rb') as source:
                        known = self.digest(source)
                    self.hashes[key] = known
                if known == digest:
                    return candidate, False
            target = self.folder / (digest + suffix)
            temporary = self.folder / (uuid.uuid4().hex + '.part')
            try:
                with temporary.open('xb') as output:
                    shutil.copyfileobj(stream, output, 1024 * 1024)
                # Publish without overwriting an import from another server process.
                try:
                    os.link(temporary, target)
                except FileExistsError:
                    with target.open('rb') as existing:
                        if self.digest(existing) != digest:
                            raise ValueError('Arquivo armazenado inconsistente; nenhum arquivo foi sobrescrito.')
                    return target, False
                return target, True
            finally:
                temporary.unlink(missing_ok=True)

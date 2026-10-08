"""Self-contained x64 installer using the Windows .NET compiler."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import os
import zipfile

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--reuse', action='store_true', help='Reuse the already packaged application ZIP.')
args = parser.parse_args()
release = root / 'outputs' / 'release'
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
stage = release / f'instalacao-{version}'
stage.mkdir(exist_ok=True)
source = release / 'win-unpacked'
assert (source / 'Vox Corte.exe').is_file()
package = stage / 'aplicativo.zip'
if not args.reuse or not package.exists():
    with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for file in source.rglob('*'):
            if file.is_file() and '__pycache__' not in file.parts:
                archive.write(file, file.relative_to(source))
with package.open('rb') as stream:
    digest = hashlib.file_digest(stream, 'sha256').hexdigest()
(stage / 'aplicativo.sha256').write_text(digest, encoding='ascii')
shutil.copy2(root / 'scripts' / 'install_current.ps1', stage / 'instalar.ps1')
shutil.copy2(root / 'scripts' / 'install_current.cmd', stage / 'Instalar Vox Corte.cmd')
target = release / f'Vox Corte Instalar {version}.exe'
print('ZIP de instalacao preparado.', flush=True)
compiler = Path(os.environ['SystemRoot']) / 'Microsoft.NET' / 'Framework64' / 'v4.0.30319' / 'csc.exe'
subprocess.run([str(compiler), '/nologo', '/target:exe', '/platform:x64', f'/out:{target}', f'/win32icon:{root / "assets/voxcorte-installer.ico"}',
                f'/resource:{package},ApplicationZip', f'/resource:{stage / "aplicativo.sha256"},ApplicationHash',
                f'/resource:{stage / "instalar.ps1"},InstallScript', str(root / 'scripts' / 'LocalInstaller.cs')], check=True)
print('Instalador criado:', target)

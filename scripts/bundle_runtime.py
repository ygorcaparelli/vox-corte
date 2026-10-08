import shutil
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
target = root / 'runtime'
target.mkdir(exist_ok=True)
base = Path(sys.base_prefix)
for name in ('python.exe', 'pythonw.exe', 'DLLs', 'Lib'):
    source = base / name
    if source.is_dir():
        shutil.copytree(source, target / name, dirs_exist_ok=True, ignore=shutil.ignore_patterns('__pycache__', 'site-packages', 'test', 'tests'))
    elif source.exists():
        shutil.copy2(source, target / name)
for source in base.glob('*.dll'):
    shutil.copy2(source, target / source.name)
packages = target / 'Lib' / 'site-packages'
assert packages.resolve().is_relative_to((root / 'runtime').resolve())
if packages.exists():
    shutil.rmtree(packages)
shutil.copytree(Path(sys.prefix) / 'Lib' / 'site-packages', packages, ignore=shutil.ignore_patterns('__pycache__'))
print('Runtime preparado em', target)

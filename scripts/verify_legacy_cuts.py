"""Check cut intervals and VAD settings against the archived 1.10.2 release."""
import ast
from pathlib import Path
import random
import sys
import zipfile

root=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root/'backend'))
from breaths import dry_cuts
with zipfile.ZipFile(root/'outputs/release/instalacao-1.10.2/aplicativo.zip') as archive:
    legacy={}
    exec(compile(archive.read('resources/backend/breaths.py'),'archived-breaths.py','exec'),legacy)
    old_app=archive.read('resources/backend/app.py').decode('utf-8')
def options(source):
    function=next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name=='breaths')
    call=next(n for n in ast.walk(function) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='VadOptions')
    return ast.dump(call,include_attributes=False)
assert options(old_app)==options((root/'backend/app.py').read_text('utf-8')), 'VAD differs from archived release'
rng=random.Random(10102)
for i in range(200):
    speech=[{'start':a,'end':a+rng.uniform(.02,2)} for a in sorted(rng.uniform(0,28) for _ in range(20))]
    words=[{'start':a,'end':a+.2} for a in sorted(rng.uniform(0,29) for _ in range(10))]
    actual=dry_cuts(speech,words,30)
    expected=legacy['dry_cuts'](speech,words,30)
    def intervals(items):return [(x['start'],x['end'],x['label']) for x in items]
    assert intervals(actual)==intervals(expected), i
print('PASS: archived 1.10.2 VAD settings identical; 200 cut interval comparisons identical (UUID/metadata excluded).')

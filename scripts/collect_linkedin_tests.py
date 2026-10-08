"""Run and retain the real test results referenced by the presentation."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
import time

root=Path(__file__).resolve().parent.parent
out=root/'outputs/linkedin'
parser=argparse.ArgumentParser();parser.add_argument('--node',required=True);args=parser.parse_args()
results=[]
commands=[
 ('TypeScript', [args.node,'node_modules/typescript/bin/tsc','--noEmit']),
 ('Frontend', [args.node,'node_modules/vitest/vitest.mjs','run','--configLoader','runner','--reporter=json',f'--outputFile={out / "vitest.json"}']),
 ('Backend',[sys.executable,'-m','unittest','discover','-s','backend','-p','test_*.py']),
 ('Comparação com 1.10.2',[sys.executable,'scripts/verify_legacy_cuts.py']),
]
for name,command in commands:
    start=time.monotonic()
    result=subprocess.run(command,cwd=root,capture_output=True,text=True,encoding='utf-8',errors='replace')
    log=result.stdout+result.stderr
    filename={'TypeScript':'typescript','Frontend':'frontend','Backend':'backend','Comparação com 1.10.2':'corte-original'}[name]+'.log'
    (out/filename).write_text(log,'utf-8')
    results.append(dict(name=name,passed=result.returncode==0,seconds=round(time.monotonic()-start,2),log=filename))
    print(name, 'PASS' if result.returncode==0 else 'FAIL',flush=True)
    if result.returncode:raise RuntimeError(log)
front=json.loads((out/'vitest.json').read_text('utf-8'))
backend=re.search(r'Ran (\d+) tests',(out/'backend.log').read_text('utf-8'))
report=dict(results=results,frontendTests=front['numPassedTests'],backendTests=int(backend[1]),legacyComparisons=200,
            mockedProcessing=False,fixture='Video de teste com voz sintetica pt-BR, gerada no Windows. Sem dados pessoais.')
report['totalTests']=report['frontendTests']+report['backendTests']
(out/'testes.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
print('Total aprovado:',report['totalTests'])

import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
files = [root / name for name in ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','vite.config.ts','index.html','README.md','Instalar.ps1','Iniciar.ps1','IniciarNavegador.ps1','Abrir Fala Corte no navegador.cmd','Empacotar.ps1','.gitignore']]
for directory in ['backend','electron','src','scripts']:
    files.extend(p for p in (root / directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
with zipfile.ZipFile(root / 'outputs' / 'Fala-Corte-codigo.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        archive.write(file, file.relative_to(root))
print('Código-fonte empacotado.')

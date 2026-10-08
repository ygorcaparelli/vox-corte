$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw 'Instale Python 3.11 ou 3.12 de python.org e marque Add Python to PATH.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Instale Node.js LTS de nodejs.org e reabra o PowerShell.' }
python -m venv .venv
if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar o ambiente Python.' }
& .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar as dependências Python. Confira a conexão.' }
npm.cmd install
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar as dependências do aplicativo.' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Falha na compilação.' }
Write-Host 'Instalação concluída. Execute Iniciar.ps1.'

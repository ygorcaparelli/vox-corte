$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) { throw 'Execute Instalar.ps1 primeiro.' }
# Um runtime completo evita depender da instalação de Python do destinatário.
& .\.venv\Scripts\python.exe scripts\bundle_runtime.py
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar o runtime.' }
npm.cmd run dist
if ($LASTEXITCODE -ne 0) { throw 'Falha ao empacotar o aplicativo.' }

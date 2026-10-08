$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath 'dist\index.html')) { throw 'Execute Instalar.ps1 primeiro.' }
& .\node_modules\.bin\electron.cmd .

param([switch]$Verificar, [switch]$SemAbrir)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$processes = @()
function StopLocalProcesses {
    foreach ($process in $processes) {
        if (-not $process.HasExited) {
            try { & "$env:SystemRoot/System32/taskkill.exe" /PID $process.Id /T /F *> $null }
            catch { Stop-Process -Id $process.Id -ErrorAction SilentlyContinue }
        }
    }
}
try {
    if (-not (Test-Path -LiteralPath 'dist-timeline/index.html')) { throw 'A versao do navegador ainda nao foi compilada.' }
    $python = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
    if (-not (Test-Path -LiteralPath $python)) { throw 'Python local ausente. Execute Instalar.ps1 primeiro.' }
    function FreePort($Candidates) {
        foreach ($port in $Candidates) {
            $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $port)
            try { $listener.Start(); return $port } catch { } finally { $listener.Stop() }
        }
        throw 'Nenhuma porta local disponivel para iniciar o navegador.'
    }
    $apiPort = FreePort (8772..8790)
    $webPort = FreePort @(5176, 5175, 5174, 5173, 5177, 5178, 5179, 5180)
    $logs = Join-Path $PSScriptRoot '.local/logs'
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    $env:TEMP = Join-Path $PSScriptRoot '.local/tmp'
    New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
    $env:TMP = $env:TEMP
    $processes += Start-Process -FilePath $python -ArgumentList @('backend/app.py', '--port', "$apiPort") -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput "$logs/backend-$apiPort.log" -RedirectStandardError "$logs/backend-$apiPort.err.log"
    $processes += Start-Process -FilePath $python -ArgumentList @('-m', 'http.server', "$webPort", '--bind', '127.0.0.1', '--directory', 'dist-timeline') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput "$logs/browser-$webPort.log" -RedirectStandardError "$logs/browser-$webPort.err.log"
    $deadline = (Get-Date).AddSeconds(60)
    function CheckLocalPage($Address) {
        $request = [Net.WebRequest]::Create($Address)
        $request.Proxy = $null
        $request.Timeout = 2000
        $request.Headers['Authorization'] = 'Bearer development-local'
        $response = $request.GetResponse()
        $response.Close()
    }
    do {
        if ($processes | Where-Object { $_.HasExited }) { throw "O servico encerrou. Confira os registros em $logs" }
        $ready = $false
        try {
            CheckLocalPage "http://127.0.0.1:$apiPort/health"
            CheckLocalPage "http://127.0.0.1:$webPort/"
            $ready = $true
        } catch { }
        if (-not $ready) { Start-Sleep -Milliseconds 300 }
    } until ($ready -or (Get-Date) -ge $deadline)
    if (-not $ready) { throw "Os servicos nao responderam. Confira os registros em $logs" }
    $url = "http://127.0.0.1:$webPort/?porta=$apiPort"
    Write-Host "Fala Corte: $url"
    if ($Verificar) {
        StopLocalProcesses
        Write-Host 'Verificacao concluida: pagina e processamento local acessiveis, sem Node.'
    } elseif (-not $SemAbrir) { Start-Process $url }
} catch {
    StopLocalProcesses
    Write-Host $_.Exception.Message -ForegroundColor Red
    if (-not $Verificar) { Read-Host 'Pressione Enter para fechar' }
    exit 1
}

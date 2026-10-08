param(
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\Vox Corte'),
    [switch]$NoShortcuts,
    [switch]$NoLaunch
)
$ErrorActionPreference = 'Stop'
$env:PSModulePath = Join-Path $PSHOME 'Modules'
try {
    Write-Host 'Instalando Vox Corte 1.12.2. Aguarde a extracao dos arquivos...'
    $package = Join-Path $PSScriptRoot 'aplicativo.zip'
    $expected = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'aplicativo.sha256') -Raw).Trim()
    if ((Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash -ne $expected) {
        throw 'O pacote esta incompleto ou foi alterado. Obtenha novamente o instalador.'
    }
    $InstallDir = [IO.Path]::GetFullPath($InstallDir)
    $exe = Join-Path $InstallDir 'Vox Corte.exe'
    $running = Get-Process -Name 'Vox Corte','Fala Corte' -ErrorAction SilentlyContinue
    if ($running) { throw 'Feche o Vox Corte antes de instalar a atualizacao. Salve seu projeto primeiro.' }
    if ((Test-Path -LiteralPath $InstallDir) -and @(Get-ChildItem -LiteralPath $InstallDir -Force).Count -and -not (Test-Path -LiteralPath $exe)) { throw 'Escolha uma pasta vazia para instalar o Vox Corte.' }
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($package)
    try {
        $prefix = $InstallDir.TrimEnd('\') + '\'
        foreach ($entry in $archive.Entries) {
            $destination = [IO.Path]::GetFullPath((Join-Path $InstallDir $entry.FullName))
            if (-not $destination.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Caminho invalido dentro do pacote.' }
            if (-not $entry.Name) { [IO.Directory]::CreateDirectory($destination) | Out-Null; continue }
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $true)
        }
    } finally { $archive.Dispose() }
    if (-not (Test-Path -LiteralPath $exe)) { throw 'O executavel nao foi extraido.' }
    if (-not $NoShortcuts) {
        $shell = New-Object -ComObject WScript.Shell
        foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
            $shortcut = $shell.CreateShortcut((Join-Path $folder 'Vox Corte.lnk'))
            $shortcut.TargetPath = $exe
            $shortcut.WorkingDirectory = $InstallDir
            $shortcut.IconLocation = $exe
            $shortcut.Save()
        }
    }
    Write-Host "Instalacao concluida: $exe" -ForegroundColor Green
    Write-Host 'Seus projetos e videos originais nao foram alterados.'
    if (-not $NoLaunch) { Start-Process -FilePath $exe -WorkingDirectory $InstallDir -WindowStyle Hidden }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

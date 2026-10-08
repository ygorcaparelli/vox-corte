import base64
import json
import os
from pathlib import Path
import subprocess


def save_video_dialog(filename, directory=''):
    if os.name != 'nt':
        raise RuntimeError('O seletor de destino requer Windows. Use o aplicativo Windows para escolher a pasta.')
    # Keep user-controlled paths in stdin JSON, never in executable PowerShell code.
    script = r'''
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$settings = [Console]::In.ReadToEnd() | ConvertFrom-Json
$dialog = New-Object System.Windows.Forms.SaveFileDialog
$dialog.Title = 'Exportar MP4 - Vox Corte'
$dialog.Filter = 'Video MP4 (*.mp4)|*.mp4'
$dialog.DefaultExt = 'mp4'
$dialog.AddExtension = $true
$dialog.OverwritePrompt = $true
$dialog.RestoreDirectory = $true
$dialog.FileName = $settings.filename
if ($settings.directory -and [IO.Directory]::Exists($settings.directory)) { $dialog.InitialDirectory = $settings.directory }
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.Opacity = 0
try {
    $result = $dialog.ShowDialog($owner)
    if ($result -eq [Windows.Forms.DialogResult]::OK) { @{path=$dialog.FileName} | ConvertTo-Json -Compress }
    else { @{path=$null} | ConvertTo-Json -Compress }
} finally { $dialog.Dispose(); $owner.Dispose() }
'''
    name = Path(str(filename).replace('\\', '/')).name
    name = ''.join(c for c in name if c not in '<>:"/\\|?*' and ord(c) >= 32)[:160]
    name = (Path(name or 'video').stem or 'video') + '-editado.mp4'
    executable = Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
    result = subprocess.run([str(executable), '-NoProfile', '-STA', '-EncodedCommand', base64.b64encode(script.encode('utf-16le')).decode('ascii')], input=json.dumps({'filename':name,'directory':str(directory)}, ensure_ascii=False), text=True, encoding='utf-8', capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        raise RuntimeError('Não foi possível abrir o seletor de destino do Windows. ' + result.stderr[-600:])
    return json.loads(result.stdout)['path']

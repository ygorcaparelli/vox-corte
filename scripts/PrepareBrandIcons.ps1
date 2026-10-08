param([Parameter(Mandatory=$true)][string]$InstallerReference, [Parameter(Mandatory=$true)][string]$AppReference)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$folder = Join-Path (Split-Path $PSScriptRoot -Parent) 'assets'
New-Item -ItemType Directory -Path $folder -Force | Out-Null
function ExportIcon($Source, $Name, $Rect) {
    $image = [Drawing.Bitmap]::FromFile($Source)
    try {
        $crop = $image.Clone([Drawing.Rectangle]::new($Rect[0],$Rect[1],$Rect[2],$Rect[3]),[Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            $crop.Save((Join-Path $folder "$Name.png"), [Drawing.Imaging.ImageFormat]::Png)
            $images = @()
            foreach($size in @(16,24,32,48,64,128,256)) {
                $bitmap = [Drawing.Bitmap]::new($size,$size)
                $graphics = [Drawing.Graphics]::FromImage($bitmap)
                try {
                    $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                    $ratio = [Math]::Min($size / $crop.Width, $size / $crop.Height)
                    $w = [int]($crop.Width * $ratio); $h = [int]($crop.Height * $ratio)
                    $graphics.DrawImage($crop,[int](($size-$w)/2),[int](($size-$h)/2),$w,$h)
                    $stream = [IO.MemoryStream]::new()
                    try { $bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png); $images += ,$stream.ToArray() }
                    finally { $stream.Dispose() }
                } finally { $graphics.Dispose(); $bitmap.Dispose() }
            }
            $file = [IO.File]::Create((Join-Path $folder "$Name.ico"))
            $writer = [IO.BinaryWriter]::new($file)
            try {
                $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$images.Count)
                $offset = 6 + 16 * $images.Count
                $sizes = @(16,24,32,48,64,128,256)
                for($i=0;$i -lt $images.Count;$i++) {
                    $dimension = if($sizes[$i] -eq 256){0}else{$sizes[$i]}
                    $writer.Write([byte]$dimension); $writer.Write([byte]$dimension); $writer.Write([byte]0); $writer.Write([byte]0)
                    $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
                    $offset += $images[$i].Length
                }
                foreach($bytes in $images) { $writer.Write([byte[]]$bytes) }
            } finally { $writer.Dispose(); $file.Dispose() }
        } finally { $crop.Dispose() }
    } finally { $image.Dispose() }
}
# Crop the supplied brand-board tiles only; do not redraw the user's artwork.
ExportIcon $InstallerReference 'voxcorte-installer' @(431,542,392,381)
ExportIcon $AppReference 'voxcorte-app' @(362,461,319,299)

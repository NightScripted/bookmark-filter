$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot "assets/icons/bookmark-filter-master.png"
$iconsPath = Join-Path $projectRoot "assets/icons"
$sizes = @(16, 24, 32, 48, 128)

if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
  throw "Icon master not found: $sourcePath"
}

$source = $null
try {
  $source = [System.Drawing.Bitmap]::new($sourcePath)
  foreach ($size in $sizes) {
    $outputPath = Join-Path $iconsPath "icon$size.png"
    $bitmap = $null
    $graphics = $null
    try {
      $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.Clear([System.Drawing.Color]::Transparent)

      $destination = [System.Drawing.Rectangle]::new(0, 0, $size, $size)
      $sourceRectangle = [System.Drawing.Rectangle]::new(0, 0, $source.Width, $source.Height)
      $graphics.DrawImage($source, $destination, $sourceRectangle, [System.Drawing.GraphicsUnit]::Pixel)
      $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      if ($null -ne $graphics) { $graphics.Dispose() }
      if ($null -ne $bitmap) { $bitmap.Dispose() }
    }
  }
} finally {
  if ($null -ne $source) { $source.Dispose() }
}

Write-Output "Built $($sizes.Count) PNG icons from $sourcePath"

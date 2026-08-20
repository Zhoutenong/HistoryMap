# 按实测区块带切割 prompt_1.png 成宫格图（每块带坐标标注），供视觉模型逐块转述。
Add-Type -AssemblyName System.Drawing
$src = "E:\Code\myCode\HistoryMap\docs\design_optimize\prompt_1.png"
$out = "E:\Code\myCode\HistoryMap\docs\design_optimize\prompt_1_sections.png"

$bmp = [System.Drawing.Image]::FromFile($src)
$W = $bmp.Width; $H = $bmp.Height

# 横切成 6 块（依据实测区块带粗分）
$cuts = @(
  @{ y0=0;   y1=130;  label='A topbar 0-130' },
  @{ y0=130; y1=260;  label='B band 130-260' },
  @{ y0=260; y1=540;  label='C 260-540' },
  @{ y0=540; y1=1240; label='D map 540-1240' },
  @{ y0=1240; y1=1450; label='E 1240-1450' },
  @{ y0=1450; y1=$H;  label='F cards/timeline 1450-1808' }
)
$n = $cuts.Count
$cols = [int]3; $rows = [int][Math]::Ceiling($n / $cols)
$cellW = [int][Math]::Ceiling($W / $cols)
$labelH = [int]34
$cellH = [int][Math]::Ceiling((($H / $n) + $labelH) * 1.02)

$canvas = New-Object System.Drawing.Bitmap([int]($cellW * $cols), [int]($cellH * $rows))
$g = [System.Drawing.Graphics]::FromImage($canvas)
$g.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font('Consolas', 14, [System.Drawing.FontStyle]::Bold)
$brush = [System.Drawing.Brushes]::Black

for ($i=0; $i -lt $n; $i++) {
  $c = $cuts[$i]
  $cx = ($i % $cols) * $cellW
  $cy = ([Math]::Floor($i / $cols)) * $cellH
  $w = $c.y1 - $c.y0
  # 缩放到 cellW 宽，保持比例
  $sh = [int](($w / $W) * $cellW)
  if ($sh -gt ($cellH - $labelH)) { $sh = $cellH - $labelH }
  $srcRect = New-Object System.Drawing.Rectangle(0, $c.y0, $W, $w)
  $dstRect = New-Object System.Drawing.Rectangle($cx, ($cy + $labelH), $cellW, $sh)
  $g.DrawImage($bmp, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.DrawString($c.label, $font, $brush, ($cx + 6), ($cy + 6))
  $g.DrawRectangle([System.Drawing.Pens]::Gray, $cx, $cy, $cellW - 1, $cellH - 1)
}

$g.Dispose()
$canvas.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$canvas.Dispose(); $bmp.Dispose()
"written: $out"
Get-Item $out | Select-Object Name, Length | Format-List

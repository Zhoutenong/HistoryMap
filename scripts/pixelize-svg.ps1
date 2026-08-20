# 像素马赛克复刻：读 prompt_1.png，每个 CELL px 取中心像素，原样写进 SVG（<rect> 网格）。
# 同时输出一张 40px 粗色板文本（hex），供人工判读原图结构。
param([int]$Cell = 10)
Add-Type -AssemblyName System.Drawing
$src = "E:\Code\myCode\HistoryMap\docs\design_optimize\prompt_1.png"
$svgOut = "E:\Code\myCode\HistoryMap\docs\design_optimize\prompt_1_pixelized.svg"

$bmp = New-Object System.Drawing.Bitmap($src)
$W = $bmp.Width; $H = $bmp.Height
$rect = New-Object System.Drawing.Rectangle(0,0,$W,$H)
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, $bmp.PixelFormat)
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $H)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($data)

$cols = [math]::Ceiling($W / $Cell); $rows = [math]::Ceiling($H / $Cell)
$sw = [System.Diagnostics.Stopwatch]::StartNew()

$sb = New-Object System.Text.StringBuilder
[void]$sb.Append("<?xml version=`"1.0`" encoding=`"UTF-8`"?>`n")
[void]$sb.Append("<svg xmlns=`"http://www.w3.org/2000/svg`" width=`"$($Cell*$cols)`" height=`"$($Cell*$rows)`" viewBox=`"0 0 $($Cell*$cols) $($Cell*$rows)`">`n")

for ($cy=0; $cy -lt $rows; $cy++) {
  $y = [int]($cy * $Cell + $Cell/2)
  if ($y -ge $H) { $y = $H-1 }
  $ro = $y * $stride
  for ($cx=0; $cx -lt $cols; $cx++) {
    $x = [int]($cx * $Cell + $Cell/2)
    if ($x -ge $W) { $x = $W-1 }
    $i = $ro + $x*3
    $b=$bytes[$i]; $g=$bytes[$i+1]; $r=$bytes[$i+2]
    [void]$sb.Append("<rect x=`"$($cx*$Cell)`" y=`"$($cy*$Cell)`" width=`"$Cell`" height=`"$Cell`" fill=`"#$([Convert]::ToString($r,16).PadLeft(2,'0'))$([Convert]::ToString($g,16).PadLeft(2,'0'))$([Convert]::ToString($b,16).PadLeft(2,'0'))`"/>`n")
  }
}
[void]$sb.Append("</svg>`n")
[System.IO.File]::WriteAllText($svgOut, $sb.ToString(), [System.Text.Encoding]::UTF8)
$sw.Stop()
"SVG written: $svgOut ($($cols)x$($rows) 格, 每格${Cell}px, ${($sb.Length/1MB).ToString('0.0')}MB, ${($sw.ElapsedMilliseconds)}ms)"

# 40px 粗色板：结构化判读
$big = 40
$bcols = [math]::Ceiling($W / $big); $brows = [math]::Ceiling($H / $big)
$lines = @()
$lines += "== 40px 粗色板（${bcols}列 x ${brows}行），每格相对亮度+色调 =="
for ($cy=0; $cy -lt $brows; $cy++) {
  $y=[int]($cy*$big+$big/2); if($y -ge $H){$y=$H-1}; $ro=$y*$stride
  $line=''
  for ($cx=0; $cx -lt $bcols; $cx++) {
    $x=[int]($cx*$big+$big/2); if($x -ge $W){$x=$W-1}; $i=$ro+$x*3
    $b=$bytes[$i];$g=$bytes[$i+1];$r=$bytes[$i+2]
    $lum=0.299*$r+0.587*$g+0.114*$b
    $mx=[Math]::Max($r,[Math]::Max($g,$b));$mn=[Math]::Min($r,[Math]::Min($g,$b));$sat=$mx-$mn
    if($lum -lt 70){$ch='#'}
    elseif($lum -gt 230 -and $sat -lt 20){$ch='.'}
    elseif($lum -gt 190 -and $sat -lt 50){$ch=':'}
    elseif($sat -lt 30){$ch=','}
    elseif($r -gt $g -and $r -gt $b -and ($r-$b) -gt 55){$ch='R'}
    elseif($b -gt $r -and $b -gt $g -and ($b-$g) -gt 20){$ch='B'}
    elseif($g -gt $r -and $g -gt $b -and ($g-$b) -gt 20){$ch='G'}
    elseif($r -gt 140 -and $g -gt 110 -and ($r-$b) -gt 35){$ch='Y'}
    elseif($lum -lt 170 -and $r -ge $g -and $g -ge $b){$ch='O'}
    else{$ch='?'}
    $line += $ch
  }
  $lines += ("{0,4}: {1}" -f ($cy*$big), $line)
}
$board = "$env:TEMP\prompt_1_palette.txt"
$lines -join "`n" | Set-Content -Path $board -Encoding UTF8
"粗色板已写: $board"
$board

# 对原图 prompt_1.png 做真正的像素几何提取：区块带、政权色连通域、图例色块、文字行密度。
Add-Type -AssemblyName System.Drawing
$p = "E:\Code\myCode\HistoryMap\docs\design_optimize\prompt_1.png"
$bmp = New-Object System.Drawing.Bitmap($p)
$rect = New-Object System.Drawing.Rectangle(0,0,$bmp.Width,$bmp.Height)
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, $bmp.PixelFormat)
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $bmp.Height)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($data)

$W = $bmp.Width; $H = $bmp.Height
$bmp.Dispose()

# 逐行：平均亮度 + 深色像素数（文字/线条）+ 饱和彩色像素数
$rowDark = New-Object int[] $H
$rowColored = New-Object int[] $H
for ($y=0; $y -lt $H; $y++) {
  $row = $y * $stride
  $dark = 0; $col = 0
  for ($x=0; $x -lt $W; $x++) {
    $i = $row + $x*3
    $b=$bytes[$i]; $g=$bytes[$i+1]; $r=$bytes[$i+2]
    $lum = 0.299*$r + 0.587*$g + 0.114*$b
    if ($lum -lt 80) { $dark++ }
    $mx=[Math]::Max($r,[Math]::Max($g,$b)); $mn=[Math]::Min($r,[Math]::Min($g,$b))
    if (($mx-$mn) -gt 60 -and $mx -gt 80) { $col++ }
  }
  $rowDark[$y] = $dark
  $rowColored[$y] = $col
}

# 1) 区块带检测：连续"内容行"（深色或彩色像素较多）聚成带
"=== 内容带（行暗>15 或 行彩>30 的连续行）==="
$inBand = $false; $bandStart = 0
for ($y=0; $y -lt $H; $y++) {
  $val = if ($rowDark[$y] -gt 15 -or $rowColored[$y] -gt 30) { $true } else { $false }
  if ($val -and -not $inBand) { $inBand = $true; $bandStart = $y }
  if (-not $val -and $inBand) {
    if ($y - $bandStart -ge 6) { "{0,5}..{1,5}  (高 {2}px, 峰值dark={3}, 峰值col={4})" -f $bandStart, ($y-1), ($y-$bandStart), ($rowDark[$bandStart..($y-1)] | Measure-Object -Maximum).Maximum, ($rowColored[$bandStart..($y-1)] | Measure-Object -Maximum).Maximum }
    $inBand = $false
  }
}
if ($inBand) { "{0,5}..{1,5}  (到尾)" -f $bandStart, ($H-1) }

# 2) 政权主色连通域 bbox（排除顶栏 y<60、时间轴 y>H-130）
"`n=== 政权主色像素 bbox ==="
$colors = [ordered]@{
  '宋-朱砂#b03a2e' = @(0xb0,0x3a,0x2e)
  '辽-蓝#4a6a8a'   = @(0x4a,0x6a,0x8a)
  '金-金#a8873a'   = @(0xa8,0x87,0x3a)
  '西夏#b08d4f'    = @(0xb0,0x8d,0x4f)
  '大理#6a8a5f'    = @(0x6a,0x8a,0x5f)
  '吐蕃#8a6a4a'    = @(0x8a,0x6a,0x4a)
}
foreach ($name in $colors.Keys) {
  $c = $colors[$name]; $tol = 26
  $minX=1e9;$minY=1e9;$maxX=-1;$maxY=-1;$cnt=0;$rowPeak=0;$rowPeakY=-1
  $hist = New-Object int[] ([Math]::Ceiling($H/16)+1)
  for ($y=60; $y -lt $H-130; $y++) {
    $row = $y*$stride; $rc=0
    for ($x=0; $x -lt $W; $x++) {
      $i=$row+$x*3
      $b=$bytes[$i];$g=$bytes[$i+1];$r=$bytes[$i+2]
      if ([Math]::Abs($r-$c[0]) -le $tol -and [Math]::Abs($g-$c[1]) -le $tol -and [Math]::Abs($b-$c[2]) -le $tol) {
        $cnt++
        if($x -lt $minX){$minX=$x}; if($x -gt $maxX){$maxX=$x}
        if($y -lt $minY){$minY=$y}; if($y -gt $maxY){$maxY=$y}
        $rc++
      }
    }
    $hist[ [int]($y/16) ] += $rc
  }
  if ($cnt -gt 50) {
    # 行段聚类（16px 桶），找最集中区域
    $peaks = @()
    for ($b=0; $b -lt $hist.Count; $b++) {
      if ($hist[$b] -gt 0) { $peaks += [pscustomobject]@{ bin=$b; h=$hist[$b]; y=(($b*16)+8) } }
    }
    $top = ($peaks | Sort-Object h -Descending | Select-Object -First 3 | ForEach-Object { "y~$($_.y)(桶$($_.h))" }) -join ", "
    "{0,-14} 命中={1,7}  bbox=({2},{3})-({4},{5})  尺寸={6}x{7}  最集中行段: {8}" -f $name,$cnt,$minX,$minY,$maxX,$maxY,($maxX-$minX+1),($maxY-$minY+1),$top
  } else { "{0,-14} 命中={1} (少于此阈值)" -f $name,$cnt }
}

# 3) 顶栏区 (y 0..64) 内容分布
"`n=== 顶栏 y 0..64 暗像素（找分隔/按钮）==="
for($y=0;$y -lt 66;$y+=4){
  "{0,3}: dark={1,4} col={2,4}" -f $y,$rowDark[$y],$rowColored[$y]
}

# 4) 底部时间轴区
"`n=== 底部 130px 每 8 行暗像素 ==="
for($y=$H-130;$y -lt $H;$y+=8){
  "{0,5}: dark={1,4} col={2,4}" -f $y,$rowDark[$y],$rowColored[$y]
}

# 5) 左边缘列扫描（图例列位置线索）：x 0..120 每 6 列，统计 y=60..H-130 的彩色像素
"`n=== 左区 x 0..120 彩色像素列分布（图例色块所在列）==="
for($x=0;$x -lt 126;$x+=6){
  $cnt=0
  for($y=60;$y -lt $H-130;$y++){
    $i=$y*$stride+$x*3
    $b=$bytes[$i];$g=$bytes[$i+1];$r=$bytes[$i+2]
    $mx=[Math]::Max($r,[Math]::Max($g,$b)); $mn=[Math]::Min($r,[Math]::Min($g,$b))
    if (($mx-$mn) -gt 60 -and $mx -gt 80) { $cnt++ }
  }
  if ($cnt -gt 0) { "x={0,3}: col={1}" -f $x,$cnt }
}

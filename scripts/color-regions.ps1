# 像素级连通域：按政权色在 16px 网格上做连通域标记，输出每块色块的 bbox（地图区 y 60..1670）
Add-Type -AssemblyName System.Drawing
$p = "E:\Code\myCode\HistoryMap\docs\design_optimize\prompt_1.png"
$bmp = New-Object System.Drawing.Bitmap($p)
$rect = New-Object System.Drawing.Rectangle(0,0,$bmp.Width,$bmp.Height)
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, $bmp.PixelFormat)
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $bmp.Height)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($data); $bmp.Dispose()

$W = 870; $H = 1808
$cell = 16
$gw = [Math]::Ceiling($W / $cell); $gh = [Math]::Ceiling($H / $cell)

$colors = [ordered]@{
  '宋R'  = @(0xb0,0x3a,0x2e)
  '辽B'  = @(0x4a,0x6a,0x8a)
  '金Y'  = @(0xa8,0x87,0x3a)
  '西夏Y2'= @(0xb0,0x8d,0x4f)
  '大理G'= @(0x6a,0x8a,0x5f)
  '吐蕃O'= @(0x8a,0x6a,0x4a)
}

# 先算每个 16px 格的"主色命中票数"
function MainClass($r,$g,$b) {
  # 纸面/中性
  $lum = 0.299*$r + 0.587*$g + 0.114*$b
  if ($lum -lt 70) { return [char]0 }   # 深墨
  $mx=[Math]::Max($r,[Math]::Max($g,$b)); $mn=[Math]::Min($r,[Math]::Min($g,$b))
  if (($mx-$mn) -lt 30) { return [char]0 }
  # 最近政权色（带 20% 水彩混合近似用距离）
  $best=''; $bestD=1e9
  foreach ($k in $colors.Keys) {
    $c=$colors[$k]
    $d=[Math]::Abs($r-$c[0])+[Math]::Abs($g-$c[1])+[Math]::Abs($b-$c[2])
    if ($d -lt $bestD) { $bestD=$d; $best=$k }
  }
  if ($bestD -lt 160) { return $best } else { return [char]0 }
}

# 网格投票
$grid = New-Object 'string[,]' $gw, $gh
for ($cy=0; $cy -lt $gh; $cy++) {
  for ($cx=0; $cx -lt $gw; $cx++) {
    $x0=$cx*$cell; $y0=$cy*$cell
    $x1=[Math]::Min($W-1,$x0+$cell-1); $y1=[Math]::Min($H-1,$y0+$cell-1)
    $votes=@{}
    $best=''; $bestN=-1
    $step=3
    for($y=$y0;$y -le $y1;$y+=$step){
      $ro=$y*$stride
      for($x=$x0;$x -le $x1;$x+=$step){
        $i=$ro+$x*3
        $b=$bytes[$i];$g2=$bytes[$i+1];$r=$bytes[$i+2]
        $k = MainClass $r $g2 $b
        if ($k -is [string] -and $k.Length -gt 0) {
          if ($votes.ContainsKey($k)) { $votes[$k]++ } else { $votes[$k]=1 }
        }
      }
    }
    if ($votes.Count -gt 0) {
      foreach ($k in $votes.Keys) { if ($votes[$k] -gt $bestN) { $bestN=$votes[$k]; $best=$k } }
    }
    $grid[$cx,$cy] = $best
  }
}

# 连通域标记（4-邻接，限地图区 y 格 4..gh-12）
$map=@{}
for ($cy=0; $cy -lt $gh; $cy++){ for($cx=0;$cx -lt $gw;$cx++){ $map["$cx,$cy"] = $grid[$cx,$cy] } }
$visited = New-Object bool[] ($gw*$gh)
function Idx($cx,$cy){ return ($cy*$gw+$cx) }

$regions = @()
for ($cy=0; $cy -lt $gh; $cy++) {
  for ($cx=0; $cx -lt $gw; $cx++) {
    $key="$cx,$cy"; $cls=$map[$key]
    if (-not $cls -or $cls.Length -eq 0) { continue }
    if ($visited[(Idx $cx $cy)] ) { continue }
    # BFS
    $q = New-Object System.Collections.Queue
    [void]$q.Enqueue([pscustomobject]@{x=$cx;y=$cy})
    $visited[(Idx $cx $cy)] = $true
    $minX=$cx;$maxX=$cx;$minY=$cy;$maxY=$cy;$cnt=0
    while ($q.Count -gt 0) {
      $pt = $q.Dequeue()
      $cnt++
      if ($pt.x -lt $minX){$minX=$pt.x};if($pt.x -gt $maxX){$maxX=$pt.x}
      if ($pt.y -lt $minY){$minY=$pt.y};if($pt.y -gt $maxY){$maxY=$pt.y}
      foreach ($d in @(@(1,0),@(-1,0),@(0,1),@(0,-1))) {
        $nx=$pt.x+$d[0]; $ny=$pt.y+$d[1]
        if ($nx -lt 0 -or $ny -lt 0 -or $nx -ge $gw -or $ny -ge $gh) { continue }
        $nkey="$nx,$ny"
        if ($map[$nkey] -eq $cls -and -not $visited[(Idx $nx $ny)]) {
          $visited[(Idx $nx $ny)] = $true
          [void]$q.Enqueue([pscustomobject]@{x=$nx;y=$ny})
        }
      }
    }
    if ($cnt -ge 2) {
      $regions += [pscustomobject]@{
        cls=$cls; cells=$cnt
        x0=$minX*$cell; y0=$minY*$cell
        x1=(($maxX+1)*$cell-1); y1=(($maxY+1)*$cell-1)
        w=(($maxX-$minX+1)*$cell); h=(($maxY-$minY+1)*$cell)
      }
    }
  }
}

"=== 连通域（面积>=2格，按网格坐标→像素）==="
$regions | Sort-Object cls, y0, x0 | ForEach-Object {
  if ($_.y0 -ge 40 -and $_.y1 -lt 1700) {
    "{0,-7} {1,5}x{2,5}px @({3,3},{4,4})-({5,3},{6,4})  [{7}格]" -f $_.cls,$_.w,$_.h,$_.x0,$_.y0,$_.x1,$_.y1,$_.cells
  }
}

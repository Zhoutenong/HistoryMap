# 把 prompt_1.png 降采样成彩色分类字符图（真正"看见"像素）
# 每格 12x12 像素取平均色，归类为字符：底纸/浅纸/朱砂/蓝/金/藕褐/绿/棕/深墨文字/浓彩
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
$cell = 13          # 每格 13px → 输出约 67 列 x 139 行
$cw = [Math]::Ceiling($W/$cell); $ch = [Math]::Ceiling($H/$cell)

# 颜色分类
function Classify($r,$g,$b) {
  $lum = 0.299*$r + 0.587*$g + 0.114*$b
  $mx=[Math]::Max($r,[Math]::Max($g,$b)); $mn=[Math]::Min($r,[Math]::Min($g,$b))
  $sat = $mx-$mn
  if ($lum -lt 70) { return '#' }        # 深墨/文字
  if ($lum -gt 225 -and $sat -lt 25) { return '.' } # 近白
  if ($lum -gt 200 -and $sat -lt 60) { return ':' } # 浅纸
  if ($sat -lt 35) { return ',' }        # 灰纸/边缘
  # 彩色
  # 红色系 R 最大且远大于 B
  if ($r -gt $g -and $r -gt $b -and ($r-$b) -gt 60 -and ($r-$g) -gt 20) { return 'R' }
  # 蓝系 B 最大
  if ($b -gt $r -and $b -gt $g -and ($b-$g) -gt 25) { return 'B' }
  # 绿系 G 最大
  if ($g -ge $r -and $g -ge $b -and ($g-$b) -gt 20 -and ($g-$r) -gt 5) { return 'G' }
  # 金黄/沙色：R,G 接近且都大于 B（西夏/金/吐蕃棕黄系）
  if ($r -gt 140 -and $g -gt 110 -and ($r-$b) -gt 40 -and [Math]::Abs($r-$g) -lt 60) { return 'Y' }
  # 棕褐（吐蕃/深描边）：暗且偏暖
  if ($lum -lt 160 -and $r -ge $g -and $g -ge $b) { return 'O' }
  return '?'
}

$rows = @()
for ($cy=0; $cy -lt $ch; $cy++) {
  $line = ''
  for ($cx=0; $cx -lt $cw; $cx++) {
    $rs=0;$gs=0;$bs=0;$n=0
    $x0 = $cx*$cell; $y0 = $cy*$cell
    $x1=[Math]::Min($W-1,$x0+$cell-1); $y1=[Math]::Min($H-1,$y0+$cell-1)
    $step = 2  # 每格内 sparse 采样加速
    for($y=$y0;$y -le $y1;$y+=$step){
      $ro = $y*$stride
      for($x=$x0;$x -le $x1;$x+=$step){
        $i=$ro+$x*3
        $bs+=$bytes[$i];$gs+=$bytes[$i+1];$rs+=$bytes[$i+2];$n++
      }
    }
    if ($n -eq 0) { $line += ' ' }
    else { $line += Classify ([int]($rs/$n)) ([int]($gs/$n)) ([int]($bs/$n)) }
  }
  $rows += $line
}

$out = @()
$out += "原图 ${W}x${H}px，每格 ${cell}px → ${cw} 列 x ${ch} 行"
$out += "图例: #深墨 .近白 :浅纸 ,灰纸 R红 B蓝 G绿 Y金黄/沙 O棕褐 ?其它"
$out += ("-" * 70)
$out += $rows
$out += ("-" * 70)
$outpath = "E:\Code\myCode\HistoryMap\docs\design_optimize\prompt_1_ascii.txt"
$out -join "`n" | Set-Content -Path $outpath -Encoding UTF8
"已写入: $outpath"

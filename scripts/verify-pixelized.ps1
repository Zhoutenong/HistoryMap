# 客观验证像素复制保真度：
#   渲染图(去白边+按内容的像素宽高) vs 原图同尺寸的 8px 中心采样网格 → 逐格色差
Add-Type -AssemblyName System.Drawing
$base = "E:\Code\myCode\HistoryMap\docs\design_optimize"

function ReadPixels($imgPath){
  $bmp = New-Object System.Drawing.Bitmap($imgPath)
  $W=$bmp.Width; $H=$bmp.Height
  $rect = New-Object System.Drawing.Rectangle(0,0,$W,$H)
  $data = $bmp.LockBits($rect,[System.Drawing.Imaging.ImageLockMode]::ReadOnly,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $stride=$data.Stride; $bytes=New-Object byte[] ($stride*$H)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0,$bytes,0,$bytes.Length)
  $bmp.UnlockBits($data); $bmp.Dispose()
  return [pscustomobject]@{W=$W;H=$H;S=$stride;B=$bytes}
}
$orig = ReadPixels "$base\prompt_1.png"
$rend = ReadPixels "$base\pixelized_render.png"
"orig ${($orig.W)}x${($orig.H)}  rend ${($rend.W)}x${($rend.H)}"

# ① 渲染图内容包围盒（去白边）
$minX=$rend.W; $minY=$rend.H; $maxX=-1; $maxY=-1
for($y=0;$y -lt $rend.H;$y++){ for($x=0;$x -lt $rend.W;$x++){
  $i=$y*$rend.S+$x*3
  if($rend.B[$i] -lt 248 -or $rend.B[$i+1] -lt 248 -or $rend.B[$i+2] -lt 248){
    if($x -lt $minX){$minX=$x};if($x -gt $maxX){$maxX=$x}
    if($y -lt $minY){$minY=$y};if($y -gt $maxY){$maxY=$y}
  }
}}
$cw=$maxX-$minX+1; $ch=$maxY-$minY+1
"渲染内容区: ($minX,$minY)-($maxX,$maxY)  ${cw}x${ch}px"

# ② 把渲染内容按网格采样（每格取中心=格中心），原图同样网格采样 → 逐格对比
# 实际像素化 SVG 用 cell=8：W 872(109格), H 1808(226格)。渲染内容区应≈872x1808
$cell=[int]8
$cols=[math]::Ceiling($cw/$cell); $rows=[math]::Ceiling($ch/$cell)
$same=0; $tot=0; $acc=0.0; $over=0; $worst=0.0
for($cy=0;$cy -lt $rows;$cy++){
  for($cx=0;$cx -lt $cols;$cx++){
    # 渲染内容区的格中心
    $rx=$minX+([int]($cx*$cell+$cell/2)); $ry=$minY+([int]($cy*$cell+$cell/2))
    if($rx -ge $rend.W){$rx=$rend.W-1}; if($ry -ge $rend.H){$ry=$rend.H-1}
    $ri=$ry*$rend.S+$rx*3
    $rr=$rend.B[$ri+2]; $rg=$rend.B[$ri+1]; $rb=$rend.B[$ri]
    # 对应原图位置
    $ox=[int]($cx*$cell+$cell/2); $oy=[int]($cy*$cell+$cell/2)
    if($ox -ge $orig.W){$ox=$orig.W-1}; if($oy -ge $orig.H){$oy=$orig.H-1}
    $oi=$oy*$orig.S+$ox*3
    $or=$orig.B[$oi+2]; $og=$orig.B[$oi+1]; $ob=$orig.B[$oi]
    $avg=([math]::Abs($rr-$or)+[math]::Abs($rg-$og)+[math]::Abs($rb-$ob))/3.0
    $acc+=$avg; $tot++
    if($avg -ge 4){ if($avg -le 24) { $same++ } else { $over++ } } else {}
    if($avg -gt $worst){$worst=$avg}
  }
}
"网格 ${cols}x${rows}（cell=${cell}px）"
"平均格色差: $([math]::Round($acc/[math]::Max(1,$tot),2))/255"
"几乎一致(差4-24): $same 格  |  明显偏差(>24): $over 格 ($([math]::Round(100*$over/$tot,2))%)"
"最大单格差: $([math]::Round($worst,1))"

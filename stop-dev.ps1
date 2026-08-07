# HistoryMap 停止器（由 stop-dev.bat 调用）
# 按端口结束占用 3001(后端) / 5173(前端) 的进程，避免误伤其他程序。
Write-Host "  正在停止 HistoryMap 前后端服务 ..."

$found = $false
foreach ($port in @(3001, 5173)) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
        $found = $true
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
        Write-Host "  已停止端口 $port 的进程 (PID $($_.OwningProcess))"
    }
}

if (-not $found) {
    Write-Host "  未发现运行中的 HistoryMap 服务（端口 3001/5173 均空闲）。"
} else {
    Write-Host "  已停止 HistoryMap 前后端服务。"
}
Write-Host ""

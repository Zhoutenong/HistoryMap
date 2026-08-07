# HistoryMap 开发环境启动器（由 start-dev.bat 调用）
# 逻辑全部放在 PowerShell：规避 cmd 解析 .bat 的 512 字节块边界坑（中文乱码错位）。
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "  ================================================"
Write-Host "    HistoryMap 宋朝历史地图 · 开发环境启动器"
Write-Host "  ================================================"
Write-Host ""

# 1. Node.js 检查
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "  [错误] 未检测到 Node.js，请先安装：https://nodejs.org" -ForegroundColor Red
    exit 1
}
$nodeVer = (& node -v).Trim()
Write-Host "  [1/5] Node.js $nodeVer OK"

# 2. 依赖检查（根 / server / client 三处）
foreach ($d in @('node_modules', 'server\node_modules', 'client\node_modules')) {
    if (-not (Test-Path (Join-Path $PSScriptRoot $d))) {
        Write-Host "  [错误] 依赖未安装完整。请先打开终端执行：npm run install:all" -ForegroundColor Red
        exit 1
    }
}
Write-Host "  [2/5] 依赖已安装 OK"

# 3. 端口占用检查
foreach ($port in @(3001, 5173)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        Write-Host "  [错误] 端口 $port 已被占用（服务可能已在运行）。" -ForegroundColor Red
        Write-Host "         请先运行 stop-dev.bat 或关闭旧服务。" -ForegroundColor Red
        exit 1
    }
}
Write-Host "  [3/5] 端口 3001 / 5173 空闲 OK"

# 4. 启动后端（独立 cmd 窗口，node --watch 自动重启）
Write-Host "  [4/5] 启动后端 http://localhost:3001 ..."
Start-Process cmd -ArgumentList '/k', 'node --watch index.js' -WorkingDirectory (Join-Path $PSScriptRoot 'server')

# 5. 启动前端（独立 cmd 窗口，vite 会自动打开浏览器）
Write-Host "  [5/5] 启动前端 http://localhost:5173 ..."
Start-Process cmd -ArgumentList '/k', 'npx vite' -WorkingDirectory (Join-Path $PSScriptRoot 'client')

Write-Host ""
Write-Host "  ================================================"
Write-Host "    启动完成！两个服务窗口已分别打开："
Write-Host "      后端 API : http://localhost:3001"
Write-Host "      前端页面 : http://localhost:5173"
Write-Host "    浏览器稍后会自动打开，若无反应请手动访问。"
Write-Host ""
Write-Host "    停止服务：双击运行 stop-dev.bat"
Write-Host "  ================================================"
Write-Host ""

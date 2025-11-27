# DeepCall 生产环境启动脚本 (Windows PowerShell)

Write-Host "🚀 Starting DeepCall in production mode..." -ForegroundColor Cyan

Set-Location backend

# 设置环境变量
$env:NODE_ENV = "production"

# 显示环境信息
Write-Host "Environment: $env:NODE_ENV" -ForegroundColor Green

# 启动服务
node dist/index.js


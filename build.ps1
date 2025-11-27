# DeepCall 生产环境构建脚本 (Windows PowerShell)

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "🚀 DeepCall Production Build Script" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# 1. 构建前端
Write-Host ""
Write-Host "📦 Step 1: Building frontend..." -ForegroundColor Yellow
Set-Location frontend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Frontend build failed!" -ForegroundColor Red
    Set-Location ..
    exit 1
}
Set-Location ..

# 2. 构建后端
Write-Host ""
Write-Host "📦 Step 2: Building backend..." -ForegroundColor Yellow
Set-Location backend
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Backend build failed!" -ForegroundColor Red
    Set-Location ..
    exit 1
}
Set-Location ..

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "✅ Build completed successfully!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "To start the production server:" -ForegroundColor Cyan
Write-Host "  cd backend" -ForegroundColor White
Write-Host '  $env:NODE_ENV="production"; npm start' -ForegroundColor White
Write-Host ""
Write-Host "Or use PM2 for production:" -ForegroundColor Cyan
Write-Host "  pm2 start backend/dist/index.js --name deepcall" -ForegroundColor White
Write-Host ""


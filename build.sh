#!/bin/bash

# DeepCall 生产环境构建脚本

set -e

echo "======================================"
echo "🚀 DeepCall Production Build Script"
echo "======================================"

# 1. 构建前端
echo ""
echo "📦 Step 1: Building frontend..."
cd frontend
npm run build
cd ..

# 2. 构建后端
echo ""
echo "📦 Step 2: Building backend..."
cd backend
npm run build
cd ..

echo ""
echo "======================================"
echo "✅ Build completed successfully!"
echo "======================================"
echo ""
echo "To start the production server:"
echo "  cd backend"
echo "  npm start"
echo ""
echo "Or use PM2 for production:"
echo "  pm2 start backend/dist/index.js --name deepcall"
echo ""


#!/bin/bash

# DeepCall 生产环境启动脚本

cd backend
export NODE_ENV=production
node dist/index.js


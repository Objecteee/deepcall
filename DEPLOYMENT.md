# DeepCall 生产环境部署指南

本文档详细说明如何将 DeepCall 项目部署到生产环境。

---

## 📋 部署架构

生产环境架构：
- **前端**：构建为静态文件（HTML/CSS/JS）
- **后端**：Node.js Express 服务器托管前端静态文件并提供 API 和 WebSocket 服务
- **端口**：单一端口（默认 3000）同时提供前端和后端服务

---

## 🚀 快速部署

### 步骤 1：构建项目

```bash
# Windows PowerShell
.\build.ps1

# Linux/macOS
chmod +x build.sh
./build.sh
```

### 步骤 2：配置环境变量

在 `backend/.env` 文件中配置：

```env
# 必填：阿里云 DashScope API Key
DASHSCOPE_API_KEY=your_api_key_here

# 可选：端口配置（默认 3000）
PORT=3000

# 可选：运行环境（production/development）
NODE_ENV=production

# 可选：CORS 配置（生产环境建议设置为 false）
CORS_ORIGIN=false

# 可选：代理配置（如需要）
# HTTP_PROXY=http://127.0.0.1:7890
# HTTPS_PROXY=http://127.0.0.1:7890
```

### 步骤 3：启动服务

```bash
# Windows PowerShell
.\start-production.ps1

# Linux/macOS
chmod +x start-production.sh
./start-production.sh

# 或手动启动
cd backend
npm start
```

### 步骤 4：访问应用

打开浏览器访问: **http://localhost:3000**

---

## 🔧 手动构建步骤

如果不使用自动化脚本，可以手动执行以下命令：

### 1. 构建前端

```bash
cd frontend
npm install  # 如果是首次部署
npm run build
cd ..
```

前端构建产物将输出到 `frontend/dist/` 目录。

### 2. 构建后端

```bash
cd backend
npm install  # 如果是首次部署
npm run build
cd ..
```

后端构建产物将输出到 `backend/dist/` 目录。

### 3. 启动后端

```bash
cd backend

# Windows PowerShell
$env:NODE_ENV="production"
npm start

# Linux/macOS
NODE_ENV=production npm start
```

---

## 📦 使用 PM2 部署（推荐）

PM2 是一个专业的 Node.js 进程管理器，适合生产环境使用。

### 1. 安装 PM2

```bash
npm install -g pm2
```

### 2. 构建项目

```bash
# Windows
.\build.ps1

# Linux/macOS
./build.sh
```

### 3. 启动应用

```bash
cd backend

# 启动服务
pm2 start dist/index.js --name deepcall --node-args="--env NODE_ENV=production"

# 查看状态
pm2 status

# 查看日志
pm2 logs deepcall

# 实时监控
pm2 monit
```

### 4. 设置开机自启

```bash
# 生成启动脚本
pm2 startup

# 保存当前进程列表
pm2 save
```

### 5. PM2 常用命令

```bash
pm2 list                  # 查看所有进程
pm2 restart deepcall      # 重启应用
pm2 stop deepcall         # 停止应用
pm2 delete deepcall       # 删除应用
pm2 logs deepcall         # 查看日志
pm2 logs deepcall --lines 100  # 查看最近100行日志
pm2 flush deepcall        # 清空日志
```

---

## 🌐 使用 Nginx + HTTPS 部署

对于公网访问，建议使用 Nginx 作为反向代理并配置 HTTPS。

### 1. 安装 Nginx

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
```

### 2. 配置 SSL 证书

使用 Let's Encrypt 免费证书：

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx  # Ubuntu/Debian
sudo yum install certbot python3-certbot-nginx  # CentOS/RHEL

# 获取证书
sudo certbot --nginx -d yourdomain.com
```

或使用阿里云 SSL 证书（手动配置）。

### 3. 配置 Nginx

创建配置文件 `/etc/nginx/sites-available/deepcall`：

```nginx
# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS 主配置
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL 证书配置
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # SSL 优化
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # 日志配置
    access_log /var/log/nginx/deepcall.access.log;
    error_log /var/log/nginx/deepcall.error.log;

    # 反向代理到 Node.js 后端（后端已托管前端静态文件）
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        
        # WebSocket 支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # 请求头转发
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 缓存控制
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置（WebSocket 需要较长超时）
        proxy_read_timeout 86400;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
    }

    # 静态资源缓存优化（可选）
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3000;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 4. 启用配置并重启 Nginx

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/deepcall /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## 🐳 使用 Docker 部署（可选）

创建 `Dockerfile`（根项目）：

```dockerfile
# 构建阶段
FROM node:18 AS builder

WORKDIR /app

# 复制项目文件
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/

# 安装依赖
RUN npm install
RUN cd frontend && npm install
RUN cd backend && npm install

# 复制源代码
COPY . .

# 构建前端和后端
RUN cd frontend && npm run build
RUN cd backend && npm run build

# 生产阶段
FROM node:18-slim

WORKDIR /app

# 只复制必要文件
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/package.json ./backend/
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY --from=builder /app/backend/.env ./backend/.env

WORKDIR /app/backend

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
```

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  deepcall:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    env_file:
      - backend/.env
    restart: unless-stopped
    volumes:
      - ./backend/.env:/app/backend/.env:ro
```

启动：

```bash
docker-compose up -d
```

---

## 🔍 故障排查

### 问题 1: 前端无法加载

**症状**: 访问 `http://localhost:3000` 显示 JSON 响应而非页面

**解决方案**:
1. 确认 `NODE_ENV=production` 已设置
2. 检查 `frontend/dist` 目录是否存在
3. 重新构建前端：`cd frontend && npm run build`

### 问题 2: WebSocket 连接失败

**症状**: 控制台显示 WebSocket 连接错误

**解决方案**:
1. 检查防火墙是否开放了端口 3000
2. 如果使用 Nginx，确认 `proxy_set_header Upgrade` 和 `Connection` 配置正确
3. 检查后端日志：`pm2 logs deepcall`

### 问题 3: 跨域错误（CORS）

**症状**: 浏览器控制台显示 CORS 错误

**解决方案**:
1. 生产环境下后端已托管前端，不应出现跨域问题
2. 如果使用 Nginx，确保 `proxy_set_header Host $host` 配置正确
3. 检查 `.env` 中的 `CORS_ORIGIN` 设置

### 问题 4: 麦克风/摄像头权限问题

**症状**: 浏览器无法访问麦克风或摄像头

**解决方案**:
1. 必须使用 HTTPS（localhost 除外）
2. 检查浏览器权限设置
3. 使用 Chrome/Edge 最新版本

---

## 📊 性能优化建议

1. **启用 Gzip 压缩**（Nginx）:
```nginx
gzip on;
gzip_vary on;
gzip_min_length 256;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
```

2. **配置静态资源缓存**（见上文 Nginx 配置）

3. **使用 CDN**（可选）:
   - 将 `frontend/dist/assets` 上传到 CDN
   - 修改 `index.html` 中的资源路径

4. **监控和日志**:
   - 使用 PM2 监控：`pm2 monit`
   - 配置日志轮转：`pm2 install pm2-logrotate`

---

## 🔐 安全建议

1. **保护 API Key**:
   - 永远不要将 `.env` 文件提交到 Git
   - 使用环境变量或密钥管理服务

2. **限制 CORS**:
   - 生产环境设置 `CORS_ORIGIN=false`
   - 或明确指定允许的域名

3. **使用 HTTPS**:
   - 麦克风/摄像头权限要求 HTTPS
   - 保护用户数据传输安全

4. **更新依赖**:
```bash
npm audit fix
npm update
```

5. **配置防火墙**:
```bash
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

---

## 📝 维护和更新

### 更新应用

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建
.\build.ps1  # Windows
./build.sh   # Linux/macOS

# 3. 重启服务
pm2 restart deepcall

# 4. 查看状态
pm2 status
pm2 logs deepcall --lines 50
```

### 备份数据

```bash
# 备份配置文件
cp backend/.env backend/.env.backup

# 备份日志（如果使用 PM2）
pm2 save
```

### 监控和告警

推荐使用 PM2 Plus 或其他监控工具：
- PM2 Plus: https://pm2.io/
- 自定义监控脚本
- Prometheus + Grafana

---

## 📞 技术支持

如遇问题，请检查：
1. 后端日志：`pm2 logs deepcall`
2. Nginx 日志：`/var/log/nginx/deepcall.error.log`
3. 浏览器控制台：F12 查看错误信息

---

**祝部署顺利！🎉**


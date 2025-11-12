## DeepCall：实时 AI 语音通话（仿豆包打电话）最优可行方案

本方案目标是实现“用户点开始通话 → 与 AI 模型（如 GPT‑4o Realtime）进行低延迟双向语音对话 → 实时字幕与打断”的完整闭环，同时满足日志留存与可扩展的工程化需求。

---

### 一、总体结论（最优方案）
- **架构**：前端（React）通过 WebRTC 直接连接 OpenAI Realtime；后端（Node.js/Express）只负责签发“临时会话令牌（ephemeral token）”与会话配置，以及接收日志（文本/音频）上报。
- **优势**：最低延迟（无需媒体中继）、最低带宽/运维成本、实现复杂度最低、安全性更好（长密钥仅在后端）。
- **可选增强**：若有监管/录音/旁听/多厂商路由等强控需求，再引入“媒体中继后端”作为备选拓扑。

架构示意：

```
[React 前端]  <=WebRTC 音频/数据通道=>  [OpenAI Realtime]
       \                                     ^
        \---- REST ----> [Node 后端] --------/
              - /session：签发临时令牌（短效）
              - /logs：文本对话记录（ASR/LLM）
              - /logs/audio：音频片段（可选）
```

---

### 二、用户交互与体验细节（UX）
- **进入页**：
  - 显示“开始通话”按钮与麦克风授权提示；提供设备选择（输入/输出设备）。
  - 说明录音与数据存储策略（可选勾选同意）。
- **通话进行中**：
  - 状态机三态：Listening（听你说）/ Thinking（思考中）/ Speaking（在说话）。
  - 双字幕：上方显示“用户 ASR 文本增量”，下方显示“AI 回复增量/最终文本”。
  - 语音播放可视化（音量条/波形），支持“静音/暂停播放/音量调节”。
  - **打断**：用户开始说话或点“打断”，立即取消当前 TTS 并将新语音送入模型。
  - 网络指示：弱网提示、重连中提示、降码率策略提示。
  - 辅助功能：按住说话（Push-to-Talk）、键盘触发（如空格键）、快捷键切换设备。
- **结束通话**：
  - 一键结束，关闭 `RTCPeerConnection`，回收资源。
  - 弹窗是否保存本轮对话（文本/音频），并可输入标题与标签。
  - 成功后可跳转“历史记录/复盘页”，支持全文检索与音频回放。

---

### 三、模块职责与技术选型
- **前端（React + TypeScript）**
  - 采集麦克风（`getUserMedia`）并通过 WebRTC 发送至 Realtime。
  - 通过 `ontrack` 播放 AI 返回的 TTS 音频流。
  - 通过 DataChannel/事件订阅 ASR 增量与 LLM Token 增量，驱动 UI。
  - 可选用 `MediaRecorder` 录制"本地双轨音频"（mic/ai）以会后上报。
  - **UI 组件库要求**：
    - **设计风格**：简洁、大方、现代化，遵循扁平化设计或 Neumorphism 设计语言
    - **推荐选型**：
      - **shadcn/ui**（基于 Radix UI + Tailwind CSS）：高度可定制、无侵入、组件质量高、内置无障碍
      - **Ant Design 5.x**：企业级、开箱即用、中文友好、组件丰富（适合快速交付）
      - **Mantine**：现代、Hooks 驱动、内置深色模式、动画流畅
      - **Chakra UI**：简洁优雅、可访问性好、主题系统成熟
    - **交互细节要求**：
      - 微动效：按钮悬停/点击态微弹跳（scale 1.02）、波纹扩散（ripple）、渐进式加载动画
      - 状态反馈：加载时的骨架屏（skeleton）、操作成功的 toast 提示、错误时的震动反馈
      - 语音可视化：实时音频波形（Canvas/SVG）、麦克风能量圈动画、AI 说话时的呼吸灯效果
      - 流畅过渡：状态切换时的淡入淡出（200ms ease-out）、字幕滚动的缓动（smooth scroll）
      - 响应式：移动端适配手势操作（长按说话/滑动取消）、平板/桌面多列布局
      - 无障碍：键盘导航、ARIA 标签、高对比模式支持、屏幕阅读器友好
    - **核心组件设计**：
      - 通话按钮：大型圆形按钮（直径 80px+），渐变背景，脉冲动画吸引点击
      - 字幕区域：毛玻璃背景（backdrop-filter blur）、圆角卡片、逐字打字机效果
      - 设备选择器：下拉弹窗带设备图标、支持快捷切换、实时预览音量
      - 控制条：底部固定吸附、图标按钮（静音/挂断/打断）带工具提示（tooltip）
      - 历史记录：卡片列表、悬浮展开详情、支持标签筛选与模糊搜索
- **后端（Node.js + Express）**
  - `POST /session`：使用服务端长密钥创建"短期临时令牌"，返回会话配置（模型、voice、ICE servers 等）。
  - `POST /logs`：接收文本级对话记录（会话元数据 + 轮次）。
  - `POST /logs/audio`：接收前端录制的 WebM/Opus 切片（可选）。
- **LLM 实时服务（OpenAI Realtime）**
  - 模型：`gpt-4o-realtime-preview`
  - 模式：`modalities=["audio", "text"]`，`voice="alloy"`（可选其他）
  - 编解码：浏览器上行/下行使用 Opus（20ms 帧、DTX 可启用），无需手工重采样。

---

### 四、详细时序（逻辑）
1. 用户点“开始通话”，前端向后端 `POST /session` 获取临时令牌与会话配置。
2. 前端创建 `RTCPeerConnection`，拉取麦克风流并 `addTrack`。
3. 前端发起 WebRTC SDP offer，携带临时令牌直连 OpenAI Realtime，换回 SDP answer，完成握手。
4. 双向音频开始：用户语音 → ASR → LLM → TTS → 前端播放；文本增量通过数据通道推送给前端。
5. 用户说话或点击“打断”，前端通过数据通道向 Realtime 发送取消/清空缓冲指令，模型立即停止 TTS 并开始新一轮。
6. 前端持续汇聚 ASR/LLM 文本为回合，实时或会后 `POST /logs`；若开启录音，同步 `POST /logs/audio`。
7. 用户点击“结束通话”，前端关闭 PeerConnection，后端/Realtime 自动回收短期会话。

---

### 五、API 设计（后端）
#### 1) POST /session
用途：签发短期临时令牌（ephemeral token）与前端运行所需配置。

请求：
```http
POST /session
Content-Type: application/json

{
  "clientId": "optional-user-id-or-device-id"
}
```

响应示例：
```json
{
  "ephemeralToken": "eyJhbGciOi...",              // 短效令牌（有效期如 1~5 分钟）
  "expiresAt": 1731400000,
  "realtime": {
    "model": "gpt-4o-realtime-preview",
    "voice": "alloy",
    "modalities": ["audio","text"]
  },
  "rtc": {
    "iceServers": [
      { "urls": ["stun:stun.l.google.com:19302"] }
      // 若企业网环境，可配置自有 TURN
    ]
  },
  "sessionId": "sess_abc123"
}
```

#### 2) POST /logs
用途：保存文本级对话记录（建议会话内分段上报以降低丢失风险）。

请求：
```http
POST /logs
Content-Type: application/json

{
  "sessionId": "sess_abc123",
  "startedAt": "2025-11-12T08:00:00Z",
  "endedAt": "2025-11-12T08:05:12Z",
  "turns": [
    { "role": "user", "text": "我想订明天去上海的高铁", "startedAt": "...", "endedAt": "..." },
    { "role": "assistant", "text": "好的，请问您出发城市？", "startedAt": "...", "endedAt": "..." }
  ],
  "meta": {
    "clientId": "user_001",
    "labels": ["demo","booking"]
  }
}
```

响应：
```json
{ "ok": true, "conversationId": "conv_789" }
```

#### 3) POST /logs/audio（可选）
用途：上传音频片段（如 mic.webm、ai.webm），可分片或会后一次性上传。

表单：
```http
POST /logs/audio
Content-Type: multipart/form-data

fields:
  sessionId: sess_abc123
  track: "mic" | "ai"
  startedAt: 2025-11-12T08:00:01Z
  endedAt: 2025-11-12T08:00:11Z
files:
  file: <webm/opus blob>
```

响应：
```json
{ "ok": true, "objectKey": "sessions/sess_abc123/mic_0001.webm" }
```

> 生产建议用“预签名 URL（S3/OSS）”直传，后端仅生成签名与记录元数据。

---

### 六、数据模型（建议）
- 表：`conversations`
  - `conversation_id`（PK）、`session_id`、`client_id`
  - `title`、`labels`（JSONB）
  - `started_at`、`ended_at`、`created_at`
- 表：`conversation_turns`
  - `turn_id`（PK）、`conversation_id`（FK）
  - `role`（user/assistant/system）
  - `text`（TEXT）、`started_at`、`ended_at`
- 表：`audio_objects`（可选）
  - `object_id`（PK）、`session_id`、`track`（mic/ai）
  - `object_key`（对象存储路径）、`started_at`、`ended_at`、`duration_ms`

---

### 七、前端实现要点（伪代码）
```ts
// 1) 获取临时令牌与 RTC/模型配置
const sess = await fetch('/session', { method: 'POST' }).then(r => r.json());

// 2) 准备 WebRTC
const pc = new RTCPeerConnection({ iceServers: sess.rtc.iceServers });
const local = await navigator.mediaDevices.getUserMedia({ audio: true });
for (const track of local.getTracks()) pc.addTrack(track, local);

// 播放远端音频
pc.ontrack = (ev) => {
  const audio = new Audio();
  audio.srcObject = ev.streams[0];
  audio.autoplay = true;
  audio.play().catch(() => {/* 需用户手势 resume() */});
};

// 3) 与 Realtime 进行 SDP 交换（以官方文档为准）
const offer = await pc.createOffer({ offerToReceiveAudio: true });
await pc.setLocalDescription(offer);

const answerSdp = await fetch(
  `https://api.openai.com/v1/realtime?model=${sess.realtime.model}&voice=${sess.realtime.voice}`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sess.ephemeralToken}`,
      'Content-Type': 'application/sdp'
    },
    body: offer.sdp
  }
).then(r => r.text());

await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

// 4) 订阅增量事件（可通过 DataChannel 或 SDK）
// 示例：收到 ASR/LLM 增量文本，更新 UI 与本地缓存，定时 POST /logs
```

> 说明：不同版本的 Realtime 可能提供 WebRTC/WS 两种接入方式，上述示例展示 WebRTC SDP 直连思路；具体以官方最新文档为准。

---

### 八、后端实现要点（伪代码）
```ts
// Express 路由简化示例（仅示意）
import express from 'express';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

// 1) 签发临时令牌（使用服务端长密钥）
app.post('/session', async (req, res) => {
  // 以 OpenAI 官方 SDK/REST 创建 ephemeral token（有效期短）
  // const token = await openai.realtime.sessions.create({ ... });
  // 这里用伪代码代替
  const ephemeralToken = 'ephemeral_token_from_openai';

  res.json({
    ephemeralToken,
    expiresAt: Date.now() + 60_000,
    realtime: { model: 'gpt-4o-realtime-preview', voice: 'alloy', modalities: ['audio','text'] },
    rtc: { iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }] },
    sessionId: 'sess_' + Math.random().toString(36).slice(2)
  });
});

// 2) 文本日志
app.post('/logs', async (req, res) => {
  // 写入数据库（会话元数据 + 轮次）
  res.json({ ok: true, conversationId: 'conv_' + Date.now() });
});

// 3) 音频上传（或换成预签名 URL）
app.post('/logs/audio', async (req, res) => {
  // 解析 multipart 并存入对象存储，记录元数据
  res.json({ ok: true, objectKey: 'sessions/sess_xxx/mic_0001.webm' });
});

app.listen(3000);
```

---

### 九、性能与稳定性策略
- **延迟控制**：WebRTC 使用 Opus、20ms 帧、开启 DTX；设置合理的 `maxBitrate`；启用回声消除/降噪。
- **打断体验**：前端做 VAD/能量门限检测；一旦用户发声，立即发送“取消当前 TTS”的控制指令。
- **弱网处理**：ICE 重试、TCP 回落、降码率；断线自动重建 `RTCPeerConnection`。
- **浏览器策略**：首次播放需用户手势触发 `AudioContext.resume()`；处理自动播放限制。
- **设备管理**：支持列出与切换 `MediaDeviceInfo`，记忆用户选择。

---

### 十、安全与合规
- **密钥安全**：长密钥仅在后端；前端只拿短效临时令牌（分钟级）。
- **最小化存储**：默认只存文本；敏感场景开启音频存储时需用户明确同意与可撤回。
- **脱敏**：对文本做基础脱敏（手机号/身份证/卡号）；或按需仅存摘要。
- **传输与存储加密**：HTTPS、对象存储加密；日志接口鉴权与速率限制。
- **保留策略**：可配置留存时长、自动清理；支持用户“下载与删除我的数据”。

---

### 十一、UI/UX 详细设计规范
#### 1) 色彩系统
- **主色调（Primary）**：蓝紫渐变（#667eea → #764ba2）或科技蓝（#3b82f6），用于主按钮/强调元素
- **次要色（Secondary）**：柔和灰（#64748b）、成功绿（#10b981）、警告橙（#f59e0b）、错误红（#ef4444）
- **背景**：浅色模式白底（#ffffff）+ 浅灰面板（#f8fafc），深色模式暗底（#0f172a）+ 深灰面板（#1e293b）
- **文本**：主文本（#0f172a / #f1f5f9）、次要文本（#64748b / #94a3b8）
- **透明度**：毛玻璃效果（rgba(255,255,255,0.8) + backdrop-blur(12px)）

#### 2) 排版与间距
- **字体**：
  - 西文：Inter / SF Pro Display（优雅几何）
  - 中文：思源黑体 / 苹方（简洁现代）
  - 等宽：JetBrains Mono（代码/数字）
- **字号梯度**：标题 28/24/20px，正文 16/14px，辅助 12px
- **行高**：1.5~1.6（提升可读性）
- **间距**：8px 网格系统（8/16/24/32/48px）

#### 3) 动画时长与曲线
- **微交互**：100~150ms（悬停/点击反馈）
- **内容过渡**：200~300ms（淡入淡出/滑动）
- **页面切换**：400~500ms（路由转场）
- **曲线**：ease-out（自然减速）、spring（弹性）、cubic-bezier(0.34, 1.56, 0.64, 1)（回弹）

#### 4) 核心页面布局
- **首页/待机**：
  - 居中大型通话按钮 + 脉冲动画（吸引点击）
  - 顶部导航：历史记录入口/设置齿轮
  - 底部版权与隐私说明链接
- **通话中**：
  - 顶部：状态指示器（Listening/Thinking/Speaking）+ 网络延迟 Ping 值
  - 中部：双字幕区域（用户上方/AI 下方），自动滚动最新消息
  - 右侧/悬浮：实时音频波形可视化
  - 底部控制条：静音/挂断/打断/音量滑块/设备切换
- **历史记录页**：
  - 搜索框 + 标签筛选按钮
  - 卡片列表：标题/时间/时长/标签，悬浮展开详情与音频播放器
  - 支持删除/导出/分享

#### 5) 组件库选型对比表
| 组件库 | 优点 | 缺点 | 推荐度 |
|--------|------|------|--------|
| **shadcn/ui** | 无依赖打包、自由定制、TypeScript 友好、Radix 无障碍 | 需手动集成组件、初期配置略多 | ⭐⭐⭐⭐⭐ |
| **Ant Design** | 开箱即用、组件丰富、中文文档完善、企业案例多 | 体积较大、定制受主题限制 | ⭐⭐⭐⭐ |
| **Mantine** | 现代 Hooks API、内置深色模式、动画流畅 | 社区相对小、中文资源少 | ⭐⭐⭐⭐ |
| **Chakra UI** | 简洁 API、主题系统强、可访问性好 | 性能优化需手动处理 | ⭐⭐⭐⭐ |

**最终建议**：若追求极致定制与性能，选 **shadcn/ui + Tailwind**；若快速交付企业项目，选 **Ant Design 5.x**。

#### 6) 动效库推荐
- **Framer Motion**：React 声明式动画，支持手势/拖拽/布局动画
- **React Spring**：基于物理的弹性动画，流畅自然
- **GSAP**（GreenSock）：专业级动画引擎，性能极致（适合复杂可视化）

#### 7) 音频可视化方案
- **波形绘制**：Canvas 2D + Web Audio API `AnalyserNode`（FFT 频谱分析）
- **实时更新**：`requestAnimationFrame` 驱动，60fps 绘制
- **样式**：柱状图（bars）或平滑曲线（waveform），颜色随能量级渐变

---

### 十二、项目结构（建议）
```
deepcall/
  frontend/                    # React + TS（Vite/Next 均可）
    src/
      app/                     # 页面与路由
      components/              # UI 组件（通话控制、字幕、设备选择）
        CallButton.tsx         # 主通话按钮（脉冲动画）
        SubtitlePanel.tsx      # 字幕面板（打字机效果）
        AudioVisualizer.tsx    # 音频波形可视化
        DeviceSelector.tsx     # 设备选择器
        ControlBar.tsx         # 底部控制条
        HistoryCard.tsx        # 历史记录卡片
      rtc/                     # WebRTC/Realtime 封装、VAD、打断控制
      store/                   # 状态管理（会话状态/字幕/设备）
      utils/                   # 工具（ASR/LLM 事件聚合、日志缓冲）
      styles/                  # 全局样式/主题/动画
    index.html
    package.json
  backend/                     # Node + Express
    src/
      routes/
        session.ts             # /session
        logs.ts                # /logs, /logs/audio
      services/
        openai.ts              # 创建 ephemeral token
        storage.ts             # 对象存储（S3/OSS）与 DB
      db/
        schema.sql             # conversations/turns/audio_objects
    package.json
  infra/                       # 可选：IaC、Docker、Nginx 反代、TURN
  README.md
```

---

### 十三、环境配置与运行（摘要）
- 环境变量（后端）：
  - `OPENAI_API_KEY`：服务端长密钥（仅后端持有）
  - `DB_URL`：日志数据库连接
  - `STORAGE_BUCKET`/`STORAGE_KEY`：对象存储（若启用音频）
  - `TURN_URLS`/`TURN_USERNAME`/`TURN_PASSWORD`（企业网环境建议配置）
- 本地开发：
  - Windows/PowerShell 可通过 `setx` 或 `.env` 管理变量。
  - 前后端分别 `npm i && npm run dev`（按脚手架选择）。
  - 浏览器需 HTTPS/localhost + 用户手势，确保音频权限正常。

---

### 十四、备选拓扑：媒体中继（仅在强控诉求时）
- **后端桥接媒体**：Node 同时与前端/Realtime 建立 WebRTC，会中继或混音/录音/旁路分发。
- **适用**：强合规录音、关键词审计、旁听、多租户统一路由/熔断。
- **代价**：更高延迟/成本/运维复杂度（TURN、带宽、转码与缓存）。

---

### 十五、故障排查
- 音频不播放：检查浏览器自动播放策略，确保用户点击后 `AudioContext.resume()`。
- 只收不到远端音频：确认 SDP 里 `offerToReceiveAudio=true` 且远端 track 正常。
- 连接失败：检查临时令牌是否过期、CORS、ICE/TURN 可达性、企业网 UDP 限制。
- 字幕延迟/缺失：优先使用 Realtime 返回的 ASR 增量；若网络抖动，启用补偿与重传策略。

---

### 十六、路线图
- v0：前端直连 Realtime，文本日志；基础 UI（开始/结束/字幕/打断）。
- v1：设备管理、弱网鲁棒性、会话历史页与全文检索。
- v2：可选音频录音上传、回放与质检标注；预签名直传。
- v3：企业增强（自有 TURN、审计策略、旁听与多厂商路由）。

---

如需，我可以在此结构上输出最小可运行的前后端代码骨架与脚本（保持你的代码库整洁）。如有合规/部署环境限制，可进一步调整。 


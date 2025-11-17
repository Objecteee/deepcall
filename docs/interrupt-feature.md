# 打断功能实现说明

## 功能概述

实现了用户在AI说话时通过语音打断的功能。当用户开始说话时，系统会：
1. 立即停止所有正在播放的AI音频
2. 清空音频播放队列
3. 向服务器发送取消响应命令
4. 状态切换回"listening"（监听中）

## 实现原理

### 1. 音频播放器增强 (`PcmPlayer.ts`)

**新增功能：**
- 跟踪所有活跃的音频源（`activeSources: AudioBufferSourceNode[]`）
- 提供 `stopAll()` 方法立即停止所有播放

**关键代码：**
```typescript
stopAll() {
  // 停止所有活跃音频源
  for (const source of this.activeSources) {
    try {
      source.stop();
      source.disconnect();
    } catch {}
  }
  this.activeSources = [];
  // 重置队列时间
  if (this.ctx) {
    this.queueTime = this.ctx.currentTime;
  }
}
```

### 2. 音频流增强 (`AudioStreamer.ts`)

**新增功能：**
- 实时语音活动检测（VAD - Voice Activity Detection）
- 基于RMS（均方根）的简单语音检测算法
- 新增 `onUserSpeaking` 回调，当检测到用户开始说话时触发

**语音检测参数：**
- `SILENCE_THRESHOLD = 0.01`：静音阈值（RMS）
- `SPEECH_FRAMES_THRESHOLD = 3`：需要连续3帧有声音才算开始说话
- 连续10帧静音后认为停止说话

**检测逻辑：**
```typescript
private detectSpeech(audioData: Float32Array) {
  // 计算RMS
  let sum = 0;
  for (let i = 0; i < audioData.length; i++) {
    sum += audioData[i] * audioData[i];
  }
  const rms = Math.sqrt(sum / audioData.length);
  
  if (rms > this.SILENCE_THRESHOLD) {
    this.silenceFrames = 0;
    if (!this.isSpeaking) {
      // 从静音→说话状态转换时触发回调
      this.isSpeaking = true;
      this.options.onUserSpeaking();
    }
  } else {
    this.silenceFrames++;
    if (this.silenceFrames > 10 && this.isSpeaking) {
      this.isSpeaking = false;
    }
  }
}
```

### 3. 主应用集成 (`App.tsx`)

**新增状态跟踪：**
- `isAiSpeakingRef`：跟踪AI是否正在说话

**打断逻辑：**
```typescript
onUserSpeaking: () => {
  if (isAiSpeakingRef.current) {
    console.log('用户打断，停止AI播放');
    // 1. 停止本地播放
    playerRef.current?.stopAll();
    // 2. 向服务器发送取消命令
    wsRef.current?.sendJson({ 
      type: 'response.cancel',
      event_id: eid()
    });
    // 3. 更新状态
    isAiSpeakingRef.current = false;
    setStatus('listening');
  }
}
```

**AI说话状态管理：**
- 收到 `response.audio_transcript.delta` 或 `response.audio.delta` 时，设置 `isAiSpeakingRef.current = true`
- 收到 `response.done` 或 `response.cancelled` 时，设置 `isAiSpeakingRef.current = false`

## API协议

### 客户端→服务器

**取消当前响应：**
```json
{
  "type": "response.cancel",
  "event_id": "event_xxx"
}
```

### 服务器→客户端

**响应完成：**
```json
{
  "type": "response.done",
  ...
}
```

**响应被取消：**
```json
{
  "type": "response.cancelled",
  ...
}
```

## 工作流程

```
用户开始说话
    ↓
AudioStreamer 检测到语音（RMS > 阈值）
    ↓
触发 onUserSpeaking 回调
    ↓
检查 AI 是否正在说话
    ↓ (是)
停止本地音频播放 (PcmPlayer.stopAll())
    ↓
发送 response.cancel 到服务器
    ↓
状态切换为 listening
    ↓
服务器停止生成并返回 response.cancelled
    ↓
清理 AI 说话状态标记
```

## 优化空间

### 当前方案的局限性：

1. **简单的VAD算法**：基于RMS的检测可能对环境噪音敏感
2. **固定阈值**：`SILENCE_THRESHOLD = 0.01` 可能不适用于所有麦克风和环境
3. **无自适应调整**：未根据环境噪音动态调整阈值

### 可能的改进方向：

1. **使用更复杂的VAD算法**
   - 集成 WebRTC VAD 或其他成熟的 VAD 库
   - 考虑频谱分析，而不仅仅是音量

2. **自适应阈值**
   - 启动时采样环境噪音
   - 动态调整 `SILENCE_THRESHOLD`

3. **延迟触发机制**
   - 设置短暂的延迟（如100ms），避免误触发
   - 需要连续多帧超过阈值才触发打断

4. **用户可配置**
   - 提供灵敏度设置选项
   - 支持开关打断功能

5. **视觉反馈**
   - 显示当前语音活动状态
   - 提示用户打断成功

## 测试建议

1. **基础功能测试**
   - AI说话时开始说话 → 应立即停止AI播放
   - AI说话时保持静音 → AI应继续播放完成

2. **边界情况测试**
   - 多次快速打断
   - AI刚开始说话就打断
   - AI即将结束时打断

3. **环境鲁棒性测试**
   - 安静环境
   - 有背景噪音的环境
   - 不同麦克风设备

4. **延迟测试**
   - 测量从用户说话到AI停止的延迟
   - 目标：< 200ms

## 相关文件

- `frontend/src/rtc/PcmPlayer.ts` - 音频播放器，支持stopAll
- `frontend/src/rtc/AudioStreamer.ts` - 音频流，包含VAD检测
- `frontend/src/App.tsx` - 主应用逻辑，集成打断功能

## 更新日期

2025-01-XX


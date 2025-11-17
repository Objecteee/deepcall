# Qwen实时模型事件处理修复

## 问题分析

根据Qwen-Omni Python SDK文档，发现了关键问题：

### 问题1: AI只显示"清嗓子"等内容

**原因：** 
- `response.audio_transcript.delta` 返回的是**语音合成的转录文本**（如"清嗓子"、"整理衣袖"）
- 这不是AI的对话内容，而是TTS过程的文本表示
- 真正的对话内容在 `response.text.delta` 事件中

**修复：**
```typescript
// ❌ 错误：把语音转录当作对话内容
else if (msg?.type === 'response.audio_transcript.delta' && msg?.delta) {
  useCallStore.getState().appendToLastSubtitle(msg.delta, 'assistant');
}

// ✅ 正确：忽略语音转录，使用文本内容
else if (msg?.type === 'response.audio_transcript.delta' && msg?.delta) {
  console.log('AI语音转录（忽略）:', msg.delta);
}
else if (msg?.type === 'response.text.delta' && msg?.delta) {
  // 这才是真正的对话内容！
  useCallStore.getState().appendToLastSubtitle(msg.delta, 'assistant');
}
```

### 问题2: 用户说话文字不显示

**原因：**
- 用户输入转录事件类型可能不匹配
- Qwen使用 `conversation.item.input_audio_transcription.delta` 事件
- 需要启用 `gummy-realtime-v1` 转录模型

**修复：**
```typescript
// 用户输入音频转录（流式）
else if (msg?.type === 'conversation.item.input_audio_transcription.delta' && msg?.delta) {
  useCallStore.getState().appendToLastSubtitle(msg.delta, 'user');
}
// 用户输入转录完成
else if (msg?.type === 'conversation.item.input_audio_transcription.completed' && msg?.transcript) {
  useCallStore.getState().markLastSubtitleComplete();
}
```

## Qwen实时模型事件流程

### 用户输入流程

```
1. 用户开始说话
   ↓
   input_audio_buffer.speech_started
   
2. 持续输入音频
   ↓
   (通过 append_audio 发送)
   
3. 用户停止说话（VAD检测）
   ↓
   input_audio_buffer.speech_stopped
   
4. 音频自动提交（VAD模式）
   ↓
   input_audio_buffer.committed
   
5. 转录开始（gummy-realtime-v1）
   ↓
   conversation.item.input_audio_transcription.delta (流式)
   ↓
   conversation.item.input_audio_transcription.completed
```

### AI响应流程

```
1. 服务端开始生成响应
   ↓
   response.created
   
2. 添加输出项
   ↓
   response.output_item.added
   
3. 添加内容部分
   ↓
   response.content_part.added
   
4. 生成文本（对话内容）
   ↓
   response.text.delta (流式) ← 真正的对话内容！
   ↓
   response.text.done
   
5. 生成音频
   ↓
   response.audio.delta (流式)
   ↓
   response.audio.done
   
6. 生成语音转录（仅供参考）
   ↓
   response.audio_transcript.delta (如"清嗓子") ← 不要显示！
   ↓
   response.audio_transcript.done
   
7. 内容完成
   ↓
   response.content_part.done
   ↓
   response.output_item.done
   
8. 响应完成
   ↓
   response.done
```

## 关键事件对比

| 事件类型 | 用途 | 是否显示 |
|---------|------|---------|
| `conversation.item.input_audio_transcription.delta` | 用户语音→文字 | ✅ 显示 |
| `response.text.delta` | AI对话内容 | ✅ 显示 |
| `response.audio_transcript.delta` | AI语音转录（TTS过程） | ❌ 不显示 |
| `response.audio.delta` | AI语音音频 | ✅ 播放 |

## 完整事件列表

### 会话管理
- `session.created` - 会话已创建
- `session.updated` - 会话配置已更新

### 用户输入
- `input_audio_buffer.speech_started` - 用户开始说话
- `input_audio_buffer.speech_stopped` - 用户停止说话
- `input_audio_buffer.committed` - 音频已提交
- `input_audio_buffer.cleared` - 音频缓冲区已清空
- `conversation.item.input_audio_transcription.delta` - 用户输入转录（流式）
- `conversation.item.input_audio_transcription.completed` - 用户输入转录完成

### AI响应
- `response.created` - 响应创建
- `response.output_item.added` - 输出项添加
- `response.content_part.added` - 内容部分添加
- `response.text.delta` - **AI文本内容（流式）** ← 显示这个！
- `response.text.done` - AI文本完成
- `response.audio.delta` - AI音频（流式）
- `response.audio.done` - AI音频完成
- `response.audio_transcript.delta` - AI语音转录（流式）← 忽略这个！
- `response.audio_transcript.done` - AI语音转录完成
- `response.content_part.done` - 内容部分完成
- `response.output_item.done` - 输出项完成
- `response.done` - 响应完成
- `response.cancelled` - 响应被取消

## 配置要点

```typescript
session: {
  // 必须包含TEXT才能收到 response.text.delta
  output_modalities: ['TEXT', 'AUDIO'],
  
  // 必须启用转录才能看到用户说话内容
  enable_input_audio_transcription: true,
  input_audio_transcription_model: 'gummy-realtime-v1',
  
  // 启用VAD自动检测语音起止
  enable_turn_detection: true,
  turn_detection_type: 'server_vad',
  
  // 口语化输出（推荐）
  smooth_output: true,
}
```

## 常见错误

### ❌ 错误1：显示语音转录而不是对话内容
```typescript
// 错误
if (msg?.type === 'response.audio_transcript.delta') {
  showMessage(msg.delta); // 会显示"清嗓子"
}
```

### ✅ 正确：显示文本内容
```typescript
// 正确
if (msg?.type === 'response.text.delta') {
  showMessage(msg.delta); // 显示真正的对话
}
```

### ❌ 错误2：未启用输入转录
```typescript
// 忘记启用
enable_input_audio_transcription: false,
```

### ✅ 正确：启用输入转录
```typescript
// 正确配置
enable_input_audio_transcription: true,
input_audio_transcription_model: 'gummy-realtime-v1',
```

## 调试技巧

1. **打印所有事件**
```typescript
if (msg?.type) {
  console.log('收到消息:', msg.type, msg);
}
```

2. **区分不同的delta**
```typescript
if (msg?.type.includes('delta')) {
  console.log(`${msg.type}: ${msg.delta}`);
}
```

3. **监控完整的响应周期**
```typescript
if (msg?.type.startsWith('response.')) {
  console.log('响应事件:', msg.type);
}
```

## 参考文档

- [DashScope Python SDK - Qwen-Omni实时模型](https://help.aliyun.com/zh/model-studio/developer-reference/qwen-omni-realtime)
- [实时多模态交互流程](https://help.aliyun.com/zh/model-studio/getting-started/real-time-audio-and-video-streaming-interaction)

## 更新日期

2025-01-XX


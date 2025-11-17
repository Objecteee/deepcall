# Qwen实时模型实际行为分析

## 问题总结

基于实际测试，发现Qwen实时模型的行为与官方文档描述有所不同。

## 关键发现

### 1. AI对话内容在 `audio_transcript` 中

**文档说明：**
- `response.text.delta` - AI对话内容（文本）
- `response.audio_transcript.delta` - AI语音转录（如"清嗓子"）

**实际情况：**
- ❌ 没有收到 `response.text.delta` 事件
- ✅ `response.audio_transcript.delta` 包含真实的对话内容

**实际事件流：**
```
📨 response.audio_transcript.delta {delta: "我是"}
📨 response.audio_transcript.delta {delta: "Qwen"}
📨 response.audio_transcript.delta {delta: "-Omni"}
📨 response.audio_transcript.delta {delta: "，"}
📨 response.audio_transcript.delta {delta: "是"}
📨 response.audio_transcript.delta {delta: "阿里巴巴"}
...
```

**结论：** 
需要显示 `response.audio_transcript.delta` 的内容，这才是真正的对话文本！

### 2. 用户输入是完整转录而非流式

**文档说明：**
- `conversation.item.input_audio_transcription.delta` - 流式转录
- `conversation.item.input_audio_transcription.completed` - 转录完成

**实际情况：**
- ❌ 没有收到任何 `.delta` 事件
- ✅ 直接收到 `.completed` 事件，包含完整的`transcript`

**实际事件：**
```
📨 input_audio_buffer.speech_started
📨 input_audio_buffer.speech_stopped
📨 input_audio_buffer.committed
📨 conversation.item.input_audio_transcription.completed
  transcript: 你是谁？
```

**结论：**
用户输入是一次性返回完整文本，不是流式的。

## 修复方案

### 修复1: 显示AI对话内容

```typescript
// ✅ 正确：显示 audio_transcript 作为对话内容
else if (msg?.type === 'response.audio_transcript.delta' && msg?.delta) {
  useCallStore.getState().appendToLastSubtitle(msg.delta, 'assistant');
  setStatus('speaking');
  isAiSpeakingRef.current = true;
}
```

### 修复2: 处理完整的用户转录

```typescript
// ✅ 正确：直接添加完整的用户消息
else if (msg?.type === 'conversation.item.input_audio_transcription.completed') {
  const transcript = msg?.transcript || '';
  if (transcript) {
    useCallStore.getState().addSubtitle({ 
      role: 'user', 
      text: transcript,
      isComplete: true 
    });
  }
}
```

## 完整事件流程

### 用户说话流程

```
1. 用户开始说话
   ↓
   input_audio_buffer.speech_started

2. (持续发送音频数据)

3. 用户停止说话（VAD检测）
   ↓
   input_audio_buffer.speech_stopped

4. 音频自动提交
   ↓
   input_audio_buffer.committed

5. 会话项创建
   ↓
   conversation.item.created

6. 转录完成（一次性返回完整文本）
   ↓
   conversation.item.input_audio_transcription.completed
   {transcript: "你是谁？"}
```

### AI回复流程

```
1. 开始生成响应
   ↓
   response.created

2. 添加输出项
   ↓
   response.output_item.added

3. 创建会话项
   ↓
   conversation.item.created

4. 添加内容部分
   ↓
   response.content_part.added

5. 流式生成文本（通过audio_transcript）
   ↓
   response.audio_transcript.delta {delta: "我"}
   response.audio_transcript.delta {delta: "是"}
   response.audio_transcript.delta {delta: "Qwen"}
   ...

6. 同时流式生成音频
   ↓
   response.audio.delta (base64音频数据)
   ...

7. 完成
   ↓
   response.audio_transcript.done
   response.audio.done
   response.content_part.done
   response.output_item.done
   response.done
```

## 配置建议

```typescript
{
  // 必须包含 TEXT 和 AUDIO
  output_modalities: ['TEXT', 'AUDIO'],
  
  // 启用输入转录
  enable_input_audio_transcription: true,
  input_audio_transcription_model: 'gummy-realtime-v1',
  
  // 启用VAD
  enable_turn_detection: true,
  turn_detection_type: 'server_vad',
  
  // 口语化输出
  smooth_output: true,
}
```

## 与文档的差异对比

| 功能 | 文档描述 | 实际行为 |
|------|---------|---------|
| AI文本内容 | `response.text.delta` | `response.audio_transcript.delta` |
| AI转录用途 | 仅TTS过程描述 | 包含真实对话内容 |
| 用户转录方式 | 流式 `.delta` | 完整 `.completed` |
| 用户转录字段 | `delta` | `transcript` |

## 注意事项

1. **不要忽略 `audio_transcript`**
   - 虽然文档说这是"TTS转录"，但实际包含对话内容
   - 必须显示这个字段才能看到AI回复

2. **用户输入不是流式的**
   - 不要等待 `.delta` 事件
   - 直接在 `.completed` 事件中获取完整文本

3. **配置必须包含 TEXT**
   - `output_modalities` 必须包含 `'TEXT'`
   - 否则可能不会返回文本内容

4. **转录模型必须配置**
   - 必须设置 `input_audio_transcription_model: 'gummy-realtime-v1'`
   - 否则不会有用户输入的文字

## 调试技巧

### 查看所有事件

```typescript
if (msg?.type) {
  console.log('📨 收到消息:', msg.type);
  if (msg.delta) console.log('  delta:', msg.delta);
  if (msg.transcript) console.log('  transcript:', msg.transcript);
}
```

### 查看AI回复内容

```javascript
// 在控制台筛选
response.audio_transcript.delta
```

### 查看用户输入

```javascript
// 在控制台筛选
conversation.item.input_audio_transcription.completed
```

## 更新日期

2025-01-XX

## 相关问题

- [x] AI只显示"清嗓子"等内容 → 改为显示 `audio_transcript`
- [x] 用户说话不显示文字 → 处理 `.completed` 事件的 `transcript` 字段
- [ ] 文档与实际行为不一致 → 待反馈给阿里云团队


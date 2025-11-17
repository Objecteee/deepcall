# 转录显示问题排查指南

## 问题现象

1. ❌ 用户说话的文字没有显示
2. ❌ 所有消息都显示为"AI助手"
3. ❌ 自动滚动不生效

## 排查步骤

### 第1步：查看控制台输出

打开浏览器开发者工具（F12），在对话时查看控制台输出，找到类似这样的日志：

```
收到消息: session.created {type: "session.created", ...}
收到消息: session.updated {type: "session.updated", ...}
收到消息: response.audio_transcript.delta {type: "response.audio_transcript.delta", delta: "你好", ...}
```

### 第2步：确认用户输入转录事件

**需要找到的事件类型：**

可能的事件名称（不同API版本可能不同）：
- `conversation.item.input_audio_transcription.delta` - 用户语音流式转录
- `conversation.item.input_audio_transcription.completed` - 用户语音转录完成
- `input_audio_buffer.speech_started` - 用户开始说话
- `input_audio_buffer.speech_stopped` - 用户停止说话
- `conversation.item.created` - 会话项创建（可能包含用户消息）

**如果看到了其他事件名称**，请记录下来并在 `App.tsx` 中添加处理。

### 第3步：检查事件数据结构

在控制台点击展开事件对象，查看数据结构：

```javascript
// 示例1：OpenAI格式
{
  type: "conversation.item.input_audio_transcription.delta",
  delta: "你好",
  item_id: "xxx",
  ...
}

// 示例2：Qwen格式（可能）
{
  type: "input_audio_transcription",
  text: "你好",
  is_final: false,
  ...
}
```

### 第4步：修改事件处理代码

根据实际的事件类型，在 `frontend/src/App.tsx` 中添加处理：

```typescript
// 在 onMessage 中添加
} else if (msg?.type === '实际的事件类型' && msg?.delta) {
  // 用户语音转文字（流式）
  useCallStore.getState().appendToLastSubtitle(msg.delta, 'user');
}
```

## 常见问题

### Q1: 没有收到任何转录事件

**可能原因：**
1. 没有启用转录功能
2. API key没有转录权限
3. 转录模型未正确配置

**解决方案：**
检查 `session.update` 配置：

```typescript
enable_input_audio_transcription: true,
input_audio_transcription_model: 'gummy-realtime-v1',
```

### Q2: 收到的是完整文本而不是流式

**现象：** 只在用户说完话后才一次性显示完整句子

**解决方案：**
这可能是正常的，某些API只提供完整转录。修改处理逻辑：

```typescript
} else if (msg?.type === 'transcription.completed' && msg?.text) {
  useCallStore.getState().addSubtitle({ 
    role: 'user', 
    text: msg.text,
    isComplete: true 
  });
}
```

### Q3: AI消息显示正常，用户消息不显示

**可能原因：**
1. 用户转录事件未被处理
2. 事件类型或字段名不匹配

**调试方法：**
1. 在控制台搜索包含您说话内容的事件
2. 检查该事件的 `type` 和数据字段
3. 添加对应的处理代码

### Q4: 自动滚动不工作

**已修复的方案：**
- ✅ 使用 `scrollIntoView()` 而不是 `scrollTop`
- ✅ 在 `subtitles` 变化时触发
- ✅ 添加底部锚点元素

**如果还不工作：**
检查CSS：
```css
.chat-scroll {
  overflow-y: auto !important;
  scroll-behavior: smooth;
}
```

## 调试代码模板

在 `App.tsx` 的 `onMessage` 开头添加详细日志：

```typescript
onMessage: async (msg) => {
  try {
    // 详细调试日志
    if (msg?.type) {
      console.group(`📨 收到消息: ${msg.type}`);
      console.log('完整消息:', msg);
      if (msg.delta) console.log('Delta内容:', msg.delta);
      if (msg.text) console.log('Text内容:', msg.text);
      if (msg.transcript) console.log('Transcript内容:', msg.transcript);
      if (msg.item) console.log('Item内容:', msg.item);
      console.groupEnd();
    }
    
    // ... 原有的事件处理逻辑
  } catch (err) {
    console.error('处理消息出错:', err, msg);
  }
}
```

## 事件映射表

根据不同API版本，可能的事件映射：

| 功能 | OpenAI格式 | Qwen可能的格式 |
|------|-----------|---------------|
| 用户转录流式 | `conversation.item.input_audio_transcription.delta` | `input_audio_transcription.delta` |
| 用户转录完成 | `conversation.item.input_audio_transcription.completed` | `input_audio_transcription.completed` |
| AI回复流式 | `response.audio_transcript.delta` | `response.text.delta` |
| AI回复完成 | `response.done` | `response.completed` |

## 解决方案代码

如果确认收到的是不同的事件类型，使用以下模板：

```typescript
// App.tsx - onMessage 中添加
} else if (msg?.type === 'YOUR_EVENT_TYPE') {
  // 判断是用户还是AI
  const role = msg?.role || msg?.speaker || 'user';
  const text = msg?.delta || msg?.text || msg?.transcript || '';
  
  if (text) {
    useCallStore.getState().appendToLastSubtitle(text, role);
  }
  
  // 如果是完成事件
  if (msg?.is_final || msg?.completed) {
    useCallStore.getState().markLastSubtitleComplete();
  }
}
```

## 联系支持

如果按照以上步骤仍无法解决，请提供：
1. 控制台输出的完整事件日志
2. `session.update` 的完整配置
3. 使用的模型名称和API密钥类型

## 更新日期

2025-01-XX


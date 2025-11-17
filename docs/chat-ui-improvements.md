# 聊天界面改进文档

## 改进概述

将原有的简单字幕显示升级为类似微信的流式聊天界面，提供更好的用户体验。

## 主要改进

### 1. 流式文本更新

**问题：** 之前每次收到`delta`都创建新的字幕项，导致显示不连贯。

**解决方案：** 实现流式更新逻辑，同一条消息的多个`delta`会追加到同一个气泡中。

#### Store改进 (`callStore.ts`)

**新增字段：**
```typescript
type Subtitle = {
  role: 'user' | 'assistant';
  text: string;
  timestamp?: number;
  isComplete?: boolean; // 标记消息是否完整
};
```

**新增方法：**
- `appendToLastSubtitle(text, role)`: 追加文本到最后一条消息（如果角色匹配且未完成）
- `markLastSubtitleComplete()`: 标记最后一条消息为完整

**逻辑：**
```typescript
appendToLastSubtitle: (text, role) => set((st) => {
  const lastIdx = st.subtitles.length - 1;
  if (lastIdx >= 0 && st.subtitles[lastIdx].role === role && !st.subtitles[lastIdx].isComplete) {
    // 更新最后一条消息（流式追加）
    const updated = [...st.subtitles];
    updated[lastIdx] = { ...updated[lastIdx], text: updated[lastIdx].text + text };
    return { subtitles: updated };
  } else {
    // 创建新消息
    return { subtitles: [...st.subtitles, { role, text, timestamp: Date.now(), isComplete: false }] };
  }
}),
```

### 2. 微信风格UI

#### 样式改进 (`global.css`)

**气泡样式：**
- 用户消息：微信绿色 `#95ec69`，右对齐，右上角直角
- AI消息：白色 `#ffffff`，左对齐，左上角直角
- 圆角：8px（除了说话方向的上角为2px）
- 阴影：轻微阴影增强立体感

**自定义滚动条：**
```css
.chat-scroll::-webkit-scrollbar {
  width: 6px;
}
.chat-scroll::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 3px;
}
```

**打字指示器动画：**
```css
.typing-indicator {
  animation: blink 1s infinite;
}
@keyframes blink {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 0.1; }
}
```

#### 组件改进 (`SubtitlePanel.tsx`)

**新增功能：**
1. **自动滚动到底部**
   ```typescript
   useEffect(() => {
     if (scrollRef.current) {
       scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
     }
   }, [subtitles]);
   ```

2. **消息进入动画**（framer-motion）
   ```typescript
   <motion.div
     initial={{ opacity: 0, y: 10 }}
     animate={{ opacity: 1, y: 0 }}
     transition={{ duration: 0.2 }}
   >
   ```

3. **显示发言者标签**
   - 用户："我"
   - AI："AI助手"

4. **打字中指示器**
   - 未完成的消息显示闪烁的光标 `▊`

### 3. 事件处理改进

#### App.tsx 事件映射

**用户输入转录：**
```typescript
// 流式接收用户语音转文字
'conversation.item.input_audio_transcription.delta' -> appendToLastSubtitle(delta, 'user')

// 用户语音转文字完成
'conversation.item.input_audio_transcription.completed' -> markLastSubtitleComplete()
```

**AI回复转录：**
```typescript
// 流式接收AI回复文字
'response.audio_transcript.delta' -> appendToLastSubtitle(delta, 'assistant')

// AI回复完成
'response.done' / 'response.cancelled' -> markLastSubtitleComplete()
```

## UI效果对比

### 改进前
- ❌ 每个delta创建新气泡，消息碎片化
- ❌ 简单的左右对齐，无明显区分
- ❌ 无动画效果
- ❌ 无打字中提示
- ❌ 样式单调

### 改进后
- ✅ 流式更新，消息完整连贯
- ✅ 微信风格绿白气泡，视觉清晰
- ✅ 淡入动画，体验流畅
- ✅ 打字中光标闪烁，实时反馈
- ✅ 自动滚动，始终显示最新消息
- ✅ 显示发言者标签
- ✅ 自定义滚动条

## 技术细节

### 状态管理流程

```
用户说话
  ↓
接收 conversation.item.input_audio_transcription.delta
  ↓
appendToLastSubtitle('你好', 'user')
  → 检查最后一条是否为user且未完成
  → 是：追加文本 "你" -> "你好"
  → 否：创建新消息
  ↓
接收 conversation.item.input_audio_transcription.completed
  ↓
markLastSubtitleComplete()
  → 设置 isComplete = true
  → 停止显示打字光标
```

### 自动滚动时机

- 监听`subtitles`数组变化
- 每次更新后将滚动位置设置为最大值
- 使用`scrollTop = scrollHeight`实现

### 动画性能优化

- 使用`framer-motion`的`AnimatePresence`管理动画
- 只在消息首次出现时播放动画
- 避免在流式更新时重复触发动画

## API事件列表

### Qwen实时API事件

**用户输入转录：**
- `conversation.item.input_audio_transcription.delta`: 流式转录片段
- `conversation.item.input_audio_transcription.completed`: 转录完成

**AI响应转录：**
- `response.audio_transcript.delta`: AI回复文字片段
- `response.audio.delta`: AI音频片段
- `response.done`: 响应完成
- `response.cancelled`: 响应被取消

## 兼容性

- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ⚠️ 自定义滚动条仅在Webkit浏览器生效

## 未来改进方向

1. **时间戳显示**
   - 显示每条消息的发送时间
   - 间隔较长时显示时间分隔线

2. **消息状态**
   - 发送中/已发送/已读状态
   - 失败重试机制

3. **长文本优化**
   - 超长消息折叠显示
   - 点击展开/收起

4. **多媒体支持**
   - 显示音频波形
   - 支持图片消息

5. **搜索功能**
   - 关键词高亮
   - 快速定位历史消息

6. **导出功能**
   - 导出聊天记录为TXT/JSON
   - 支持分享

## 相关文件

- `frontend/src/store/callStore.ts` - 状态管理
- `frontend/src/components/SubtitlePanel.tsx` - 聊天面板组件
- `frontend/src/styles/global.css` - 全局样式
- `frontend/src/App.tsx` - 事件处理逻辑

## 更新日期

2025-01-XX


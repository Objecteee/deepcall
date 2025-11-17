# AI语音输出断断续续问题修复

## 问题现象

AI在回答时会突然中断，导致内容不完整。

**示例：**
- 期望输出：`昨夜星辰昨夜风，画楼西畔桂堂东。身无彩凤双飞翼，心有灵犀一点通。`
- 实际输出：`昨夜星辰昨夜风，画楼西畔（中断）桂堂东（又中断）`

## 根本原因

**客户端VAD（语音活动检测）误触发**，把**AI播放的声音**误认为**用户在说话**！

### 问题流程

```
1. AI开始说话
   ↓
2. 音频从扬声器播放
   ↓
3. 音频回传到麦克风（回声）
   ↓
4. 客户端VAD检测到"声音"
   ↓
5. 误认为用户开始说话
   ↓
6. 触发打断机制
   ↓
7. 发送 response.cancel
   ↓
8. AI停止输出 ❌
```

### 为什么会发生回声？

1. **没有使用耳机** - 扬声器声音直接被麦克风捕获
2. **回声消除不完善** - 浏览器的AEC（声学回声消除）未完全屏蔽AI声音
3. **环境噪音** - 键盘声、背景音乐等被误判为用户说话

## 解决方案

### 方案1：禁用客户端VAD（已实施）✅

**最简单有效的方案**：完全禁用客户端VAD打断功能，改用**服务端VAD**。

```typescript
const streamer = new AudioStreamer({ 
  // 禁用客户端VAD，避免误触发
  enableClientVAD: false,
  // ...
});
```

**优点：**
- ✅ 彻底避免误触发
- ✅ 服务端VAD更准确（不会被AI音频干扰）
- ✅ 无需调整参数

**缺点：**
- ❌ 失去客户端打断功能（但服务端VAD已有打断）

### 方案2：提高VAD阈值（已实施）✅

即使启用客户端VAD，也提高了检测阈值，减少误触发：

```typescript
// 之前
SILENCE_THRESHOLD = 0.01  // 太敏感
SPEECH_FRAMES_THRESHOLD = 3  // 太容易触发

// 现在
SILENCE_THRESHOLD = 0.02  // 提高2倍
SPEECH_FRAMES_THRESHOLD = 5  // 需要连续5帧
```

**改进：**
- 需要**连续5帧**超过阈值才触发（约100ms持续声音）
- 瞬时噪音不会触发
- 降低误判率

### 方案3：服务端VAD打断（Qwen内置）✅

Qwen已经支持服务端VAD打断，配置如下：

```typescript
session: {
  enable_turn_detection: true,
  turn_detection_type: 'server_vad',
  turn_detection_threshold: 0.2,
  turn_detection_silence_duration_ms: 800,
}
```

**优点：**
- ✅ 服务端处理，不受客户端音频干扰
- ✅ 更准确的打断检测
- ✅ 自动处理，无需客户端逻辑

## 最佳实践

### 推荐配置

```typescript
// 1. 禁用客户端VAD
enableClientVAD: false

// 2. 使用服务端VAD
session: {
  enable_turn_detection: true,
  turn_detection_type: 'server_vad',
}

// 3. 建议用户使用耳机
// 在UI中提示："建议使用耳机以获得最佳体验"
```

### 如果需要启用客户端VAD

```typescript
enableClientVAD: true

// 调整参数
SILENCE_THRESHOLD: 0.03  // 提高到0.03
SPEECH_FRAMES_THRESHOLD: 8  // 需要连续8帧（约160ms）
```

## 调试技巧

### 查看打断日志

```typescript
// 客户端VAD触发
🎤 检测到用户说话（连续 5 帧超过阈值）
⚠️ 用户打断AI，停止播放

// 如果频繁出现但你没有说话 → 误触发！
```

### 检查回声问题

1. **测试方法：**
   - AI说话时保持完全安静
   - 观察是否有打断日志
   - 如果有 → 回声问题

2. **解决方法：**
   - 使用耳机 🎧
   - 降低音量
   - 启用浏览器回声消除

### 控制台监控

```javascript
// 查看所有打断事件
🎤 检测到用户说话
⚠️ 用户打断AI
🔇 用户停止说话

// 正常情况：只在你真正说话时出现
// 异常情况：AI说话时频繁出现
```

## 问题排查清单

- [ ] 是否使用耳机？
- [ ] 客户端VAD是否禁用？（enableClientVAD: false）
- [ ] 服务端VAD是否启用？（enable_turn_detection: true）
- [ ] 控制台是否有频繁的打断日志？
- [ ] AI说话时是否保持安静？

## 配置对比

### 之前的配置（有问题）

```typescript
// ❌ 客户端VAD过于敏感
enableClientVAD: true  // 默认启用
SILENCE_THRESHOLD: 0.01  // 太低
SPEECH_FRAMES_THRESHOLD: 3  // 太容易触发

// 结果：AI音频回声被误判 → 频繁打断
```

### 现在的配置（已修复）

```typescript
// ✅ 禁用客户端VAD，使用服务端
enableClientVAD: false  // 默认禁用
SILENCE_THRESHOLD: 0.02  // 提高（如果启用）
SPEECH_FRAMES_THRESHOLD: 5  // 增加（如果启用）

// 结果：无误触发 → AI可以完整说完
```

## 性能影响

### 禁用客户端VAD

- CPU使用：降低（不需要实时分析音频）
- 延迟：无影响（服务端VAD同样快速）
- 准确性：提高（服务端VAD更准确）

### 提高VAD阈值

- CPU使用：不变
- 延迟：增加约50-100ms（需要更多帧确认）
- 准确性：提高（减少误判）

## 未来改进方向

1. **自适应阈值**
   - 根据环境噪音动态调整
   - 学习用户说话特征

2. **频谱分析**
   - 区分人声和AI声音
   - 使用ML模型提高准确性

3. **UI控制**
   - 添加"打断敏感度"设置
   - 允许用户手动调整

4. **回声消除增强**
   - 使用更高级的AEC算法
   - 实时监测回声水平

## 相关文档

- [interrupt-feature.md](./interrupt-feature.md) - 打断功能实现
- [Qwen实时API文档](https://help.aliyun.com/zh/model-studio/developer-reference/qwen-omni-realtime)

## 更新日期

2025-01-XX


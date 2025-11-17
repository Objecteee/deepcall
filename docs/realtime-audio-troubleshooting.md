### 实时语音“全是噪声”问题排查与修复记录

更新时间：2025-11-14

### 问题现象
- 前端已与实时服务连通，但 AI 返回的音频播放为“纯噪声/杂音”，几乎听不出人声。

### 根因分析
- 解码路径误判（主要原因）
  - Qwen-Omni 实时模型下行音频为 PCM_24000HZ_MONO_16BIT（24 kHz、16 bit、单声道）。
  - 旧播放器在分片长度能被 3 整除时，会优先尝试按 24 位 PCM（PCM24）进行解码，导致解码完全错误，从而听到“纯噪声”。
- 会话参数字段不匹配 Qwen 规范（次要但重要）
  - `session.update` 里使用了 OpenAI 风格的字段名（如 `modalities`、`input_audio_format: 'pcm16'`）。
  - Qwen 需要的是诸如 `output_modalities`、`PCM_16000HZ_MONO_16BIT`、`PCM_24000HZ_MONO_16BIT` 等字段名与枚举值。如果字段不匹配，服务端可能不会按预期下发 24k/16bit PCM。

### 采取的修复
- 播放器解码修复（frontend/src/rtc/PcmPlayer.ts）
  - 强制按 PCM16LE 路径解码，移除对 PCM24 的“优先尝试”。
  - 增加“容器格式”保护：若分片前 4 字节显示为 `"OggS"`（Opus Ogg）或 `"RIFF"`（WAV），直接告警并跳过该分片，避免误当作原始 PCM 解码造成噪声。
  - 播放时使用 `AudioBuffer` 的通道数据 `set()` 拷贝，规避类型兼容问题。

- 会话参数对齐 Qwen 规范（frontend/src/App.tsx）
  - 使用 `output_modalities: ['TEXT', 'AUDIO']`、`input_audio_format: 'PCM_16000HZ_MONO_16BIT'`、`output_audio_format: 'PCM_24000HZ_MONO_16BIT'`。
  - 打开服务端 VAD：`enable_turn_detection: true`、`turn_detection_type: 'server_vad'`、`turn_detection_threshold: 0.2`、`turn_detection_silence_duration_ms: 800`。
  - 开启转写：`enable_input_audio_transcription: true`、`input_audio_transcription_model: 'gummy-realtime-v1'`。
  - 语气风格：`smooth_output: true`（Qwen3-Omni-Flash-Realtime 支持，获得更口语化的回复）。

### 验证结果
- 修复后，返回音频恢复为清晰、可理解的人声，不再是“纯噪声”。
- 控制台无“容器格式误解码”的告警日志；如出现“OggS/RIFF”警告，说明当前通道返回的是容器格式，建议切换到 WebRTC 远端音轨播放或加入相应解码器（Opus/WAV）。

### 经验与建议
- 优先方案：WebRTC 远端音轨播放
  - 让浏览器内置的解码器处理 Opus，延迟低、音质稳定、无需自行编解码。
  - WS 仅用于文本/控制（如字幕、事件）。
- 若仍走 WS 音频流：
  - 需要确保服务端确实下发的是原始 PCM 16bit/24kHz；若为 Ogg/Opus 或 WAV，需要引入对应解码器（如 WebAssembly 版 Opus/WAV 解码）。
  - 在播放器增加首字节签名判断（"OggS"/"RIFF"）以避免误解码。
- 上行音频建议保持：麦克风采样 48k → 下采样 16k/mono/16bit PCM（符合 Qwen 输入要求）。
- 使用耳机播放，避免回声触发服务端 VAD 的“打断”。

### 变更文件清单
- `frontend/src/rtc/PcmPlayer.ts`
  - 强制按 PCM16LE 解码；新增 Ogg/WAV 容器保护；优化通道写入方式。
- `frontend/src/App.tsx`
  - 调整 `session.update` 字段为 Qwen 规范；指定输入/输出音频格式为 16k/24k 16bit；开启 VAD 与转写。

### 自检清单（故障再现时快速定位）
- 会话字段是否使用了 Qwen 的命名与枚举值（特别是 `output_audio_format: 'PCM_24000HZ_MONO_16BIT'`）。
- 播放器是否强制按 PCM16LE 解码；是否存在错误的 PCM24 解码路径。
- 控制台是否出现“容器格式”警告（"OggS"/"RIFF"）；若有，当前并非原始 PCM，需要 WebRTC 或对应解码器。
- 上行是否按 16k/mono/16bit 发送；是否开启服务端 VAD 参数并设置合理的阈值与静音时长。

—— 以上为本次“噪声问题”的排查与修复要点，如需切换到 WebRTC 远端音轨方案，可在保留现有 UI/字幕逻辑的情况下将音频播放改为 `RTCPeerConnection.ontrack` → `<audio>` 播放，进一步提升稳定性与音质。


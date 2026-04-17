# 本地会议链路 Bring-up

这个目录只解决一件事：让仓库里的站内 Web 会议客户端能连上真实 LiveKit，而不是继续依赖 `mock`。

当前提供两类资产：

- `compose.yaml`
  - 本地启动 `redis + livekit + egress`
- `livekit.yaml.example`
  - LiveKit 最小配置模板（含 room / participant webhook）
- `egress.yaml.example`
  - LiveKit Egress 最小配置模板
- `.env.example`
  - Compose 端口与镜像模板

## 当前真实打通范围

现在能正式打通的是：

- 项目内创建 / 启动 / 加入会议
- 站内 Web 客户端音视频
- `video` 会议的屏幕共享与共享音频
- guest 分享页进入同一套 Web 客户端
- 基于 LiveKit Egress 的本地录制落盘与录制资源沉淀

当前还没有完整打通的是：

- 云存储型录制 artifact 拉取编排

原因很明确：

- 站内 Web 客户端现在已经会把本地麦克风 PCM 音频帧推到应用服务，服务端也会在会议结束时调用 `finishSession()`
- 但如果你仍然使用本目录里的 `ASR dev bridge` 纯桥接模式，它不会自动回调真实字幕
- `RtcProviderGateway.startRecording()` 现在已经会调用 `LiveKit Egress`
- 录制 worker 也已经支持从 `egress_ended` webhook 里的本地文件路径或 URL 导入 artifact

所以这个目录当前能做到的是：

- 真媒体
- 真音频上行协议
- 本地自建 LiveKit Egress 录制导入

还没有完全做满的是：

- 真 partial 字幕流
- 生产级远端对象存储编排
- 自定义录制布局

## 和后台管理页的配合方式

这个目录只负责把本地 `LiveKit + Egress (+ 可选 ASR bridge)` 拉起来。

真正让项目页会议功能切到真链路，还需要管理员在后台完成保存：

- 进入 `/admin/meeting-providers`
- 填写 RTC
  - `provider = livekit`
  - `serverUrl = http://127.0.0.1:7880`
  - `apiKey = devkey`
  - `apiSecret = devsecret`
- 再按你的 ASR 路线二选一：
  - `provider = http`
    - `serviceUrl = http://127.0.0.1:8790`
  - `provider = openai-compatible`
    - `serviceUrl = https://api.openai.com/v1`
    - `apiKey = <你的转写服务密钥>`

注意：

- 这里只解决基础设施 bring-up，不再通过 env 给应用偷偷回退 `mock`。
- 如果后台没保存完成，项目里的新建会议页会直接报“会议链路未就绪”。
- 管理页“测试连通性”通过后，再去项目页做创建/加入/结束验证。

## 1. 启动 LiveKit

在当前目录执行：

```bash
cp ".env.example" ".env"
cp "livekit.yaml.example" "livekit.yaml"
cp "egress.yaml.example" "egress.yaml"
docker compose --env-file ".env" up -d
docker compose ps
```

默认会暴露：

- `http://127.0.0.1:7880`
- `tcp://127.0.0.1:7881`
- `udp://127.0.0.1:50000-50100`

默认示例密钥：

- `apiKey = devkey`
- `apiSecret = devsecret`

默认录制输出目录：

- `/tmp/winloop-meeting-egress`

说明：

- 请先在应用侧显式配置开发态地址契约：`WINLOOP_DEV_HOST`、`WINLOOP_DEV_PORT`
- `livekit.yaml` 里的 webhook URL 应与当前开发态地址保持一致，推荐按 `http://host.docker.internal:${WINLOOP_DEV_PORT}/api/internal/meetings/provider-events` 填写
- `egress` 会把录制文件写到 `/tmp/winloop-meeting-egress`，应用服务会在收到 `egress_ended` 后自动导入为项目录制资源

如果你要让其它设备通过局域网访问：

- 把 `livekit.yaml` 里的 `use_external_ip` 改成符合你网络环境的值
- 同时把后台里的 `RTC serverUrl` 改成对应的可访问地址

## 2. 启动本地 ASR dev bridge

仓库根目录执行：

```bash
pnpm meeting:asr:dev
```

默认监听：

- `http://127.0.0.1:8790`

它只实现最小协议：

- `GET /healthz`
- `GET /sessions`
- `POST /sessions/start`
- `POST /sessions/frame`
- `POST /sessions/finish`

默认情况下，这个 bridge 只是开发联调桥接，不做真实识别。

它的作用是：

- 让会议启动时 `ASR provider = http` 的健康检查成立
- 让 `startSession()` / `pushAudioFrame()` / `finishSession()` 调用不报错
- 帮你观察 session / frame 计数

它不会自动生成假字幕，也不会篡改会议纪要语义。

### 可选：接真实转写

如果你已经有一个兼容 OpenAI Audio Transcriptions 的服务，可以把这个 bridge 直接当适配器用：

```bash
MEETING_ASR_DEV_TRANSCRIBE_URL="http://127.0.0.1:8000/v1/audio/transcriptions" \
MEETING_ASR_DEV_TRANSCRIBE_MODEL="whisper-1" \
MEETING_ASR_DEV_CALLBACK_URL="http://127.0.0.1:3000/api/internal/meetings/asr-events" \
MEETING_ASR_DEV_CALLBACK_SECRET="your-asr-webhook-secret" \
MEETING_ASR_DEV_MIN_CHUNK_MS="4000" \
pnpm meeting:asr:dev
```

这时它会：

- 按参与者缓存 PCM 音频分片
- 达到阈值后转成 `wav`
- 调用 `MEETING_ASR_DEV_TRANSCRIBE_URL`
- 再把识别结果回调到应用的 `/api/internal/meetings/asr-events`

约束：

- `MEETING_ASR_DEV_TRANSCRIBE_URL` 与 `MEETING_ASR_DEV_CALLBACK_URL` 需要同时配置
- `MEETING_ASR_DEV_CALLBACK_SECRET` 要与后台 ASR 配置里的 `webhookSecret` 一致
- 当前按“分片 final utterance”回调，不生成真正的 partial 字幕
- 共享音频不会走这条链路，仍然只转写本地麦克风

## 3. 可选：完全不启 bridge，直接走内置 OpenAI Compatible ASR

如果你不想再维护一个单独的 ASR bridge，可以直接在后台把 ASR 配成：

- `provider = openai-compatible`
- `serviceUrl = https://api.openai.com/v1`
- `apiKey = <你的转写服务密钥>`

这条路线下：

- 会议 Web 客户端仍然上传 PCM 音频帧到应用服务
- 应用内按参与者缓存分片
- 达到阈值后直接调用 `audio/transcriptions`
- 再由应用自己回写 `/api/internal/meetings/asr-events`

当前默认会优先尝试：

- `gpt-4o-mini-transcribe`
- 若不支持，再回退 `whisper-1`

这样可以做到：

- 不额外依赖 `MEETING_ASR_DEV_TRANSCRIBE_*` 环境变量
- ASR 仍然完全通过后台会议配置切换
- 本地只需起 `LiveKit + 应用服务`
- 管理页“测试连通性”会直接发一段最小 `wav` 到 `audio/transcriptions`，能更早发现 key / model / endpoint 问题

## 4. 在后台填写会议配置

管理员进入：

- `/admin/meeting-providers`

推荐填写：

- RTC
  - `provider = livekit`
  - `serverUrl = http://127.0.0.1:7880`
  - `apiKey = devkey`
  - `apiSecret = devsecret`
  - `roomPrefix = winloop`
- ASR
  - `provider = http`
  - `serviceUrl = http://127.0.0.1:8790`

或者：

- ASR
  - `provider = openai-compatible`
  - `serviceUrl = https://api.openai.com/v1`
  - `apiKey = <你的转写服务密钥>`
- Worker
  - 默认值即可

注意：

- 会议配置现在以后台存储为准
- 如果后台没配完整，项目里的新建会议页会直接报配置问题并禁用创建
- 不再静默回退 `mock`

## 5. 本地验证顺序

建议按下面顺序验证：

1. 启动 `deploy/meeting` 里的 `docker compose`
2. 二选一：
   - 启动 `pnpm meeting:asr:dev`
   - 或直接准备一个 `openai-compatible` 转写服务
3. 在后台保存 RTC / ASR 配置
4. 可先在管理页执行“测试连通性”
5. 打开项目页，进入 `meeting-create:video` 或 `meeting-create:audio`
6. 确认创建页不再提示运行时缺失
7. 创建会议并进入详情页
8. 验证麦克风 / 摄像头 / 屏幕共享
9. 结束会议后确认资源区出现“会议录制”

如果你要验证“当前整条后台链已经通了”，最低验收建议是：

1. 能稳定加入站内 Web 会议客户端，不出现刚入会就断开。
2. 结束会议后 `transcript_finalize` 成功。
3. 结束会议后 `meeting_summary` 成功，并生成纪要资源。
4. 结束会议后 `recording_finalize` 成功，并生成录制资源。

如果只有第 1、3、4 步成功而没有实时字幕，通常不是 RTC 问题，而是当前 ASR 仍停留在桥接模式，没有接真实识别后端。

## 6. 明确边界

如果你现在看到的是：

- 能进会议
- 能开麦 / 开摄像头
- 能看屏幕共享
- `http` bridge 的 `/sessions` 里能看到 frame 计数持续增长
- 但没有实时字幕

这不是 LiveKit 没通，也不是前端没上传音频，而是你当前 ASR 仍停留在“协议桥接模式”，还没有接真实转写后端，或者还没切到内置 `openai-compatible`。

下一步真正要补的是：

1. 给 bridge 接一个生产级或本地可跑的真实转写后端
2. 远端对象存储型 provider 录制 / artifact 拉取编排
3. 录制布局与 egress 编排

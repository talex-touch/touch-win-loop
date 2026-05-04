# 会议真链路接入说明

## 目标

- 会议不再依赖默认 `mock`。
- RTC / ASR 业务参数改为后台动态配置。
- 未配置完成时，项目会议创建页直接提示并禁用创建。
- 研发状态总览见：
  - [project-meeting-rd-status.md](/Users/talexdreamsoul/Workspace/Projects/touch-win-loop/docs/project-meeting-rd-status.md)

## 当前落地方案摘要

- 第一阶段采用“托管/自建 RTC + 自有会议业务、转写、总结、资源沉淀”。
- 站内 Web 客户端正式以 `livekit` 为唯一真媒体实现；未配置完成时不再回退 `mock`。
- 会议中的“谁在说话”优先绑定登录成员与会议席位，不做声纹识别。
- 会后产物固定沉淀两类资源：
  - 录制文件落为项目 `binary/upload`
  - 会议纪要落为项目 `markdown/collab`
- 纪要链路固定由 `transcript_finalize -> meeting_summary -> recording_finalize` 这一组后台任务承接。
- 后台管理页是会议运行时配置的唯一来源；环境变量不再承担 RTC / ASR 业务配置职责。

## 当前已验证闭环

截至 2026-04-17，本地 sandbox 已完成一轮真实闭环验证：

- 管理页保存后台 RTC / ASR 配置成功。
- 管理页“测试连通性”已能探测真实 LiveKit API 与真实 ASR 探针。
- 项目页可创建 active 会议并进入站内 Web 客户端。
- 浏览器授权麦克风后，成员端已能稳定保持 `已连接`，不再出现“刚 join 就主动离房”。
- 结束会议后，已验证以下后台任务能自动跑通：
  - `transcript_finalize`
  - `meeting_summary`
  - `recording_finalize`
- 已验证会议能自动生成：
  - 会议纪要资源
  - 会议录制资源

当前尚需按实际部署环境决定的是“真实字幕来源”：

- 若 ASR 使用 `http` bridge 的纯协议模式，只能验证音频帧上行，不一定有真实字幕。
- 若 ASR 使用 `openai-compatible`，或 bridge 背后接了真实转写服务，才会有真实字幕输出。

## 当前实现边界

- 站内 Web 会议客户端正式支持 `provider = livekit`。
- 转写网关正式支持：
  - `provider = http`
  - `provider = openai-compatible`
- 会议业务配置现在以后台持久化记录为准，不再把 env 当作会议配置来源。
- 仍然保留一个基础设施级根密钥：`WINLOOP_CONFIG_MASTER_KEY`。
  - 它只用于加密后台保存的 secret。
  - 会议业务参数本身不再要求直接写在环境变量里。
- 站内 Web 会议客户端现在会把本地麦克风 PCM 音频帧上传到应用服务，再由服务转发给 ASR 网关。
- 会议结束时，服务端会尝试调用 `finishSession()` 结束当前会议的 ASR 会话。
- 当前录制已经接通 `LiveKit Egress -> provider webhook -> recording worker -> project resource` 这条本地最小链路。
- 当前正式支持的录制 artifact 形态是：
  - `egress webhook` 直接携带可下载 URL
  - 或本地自建 egress 写入 `/tmp/winloop-meeting-egress` 后由应用读取本地文件
- 远端录制 URL 导入已经带超时与重试，最终资源会写入全局 Storage。
- 全局 Storage 可在 `/admin/storage-service` 配置为 `local`、`s3` 或 `minio` 渠道池，后台会用 `WINLOOP_CONFIG_MASTER_KEY` 加密 accessKey / secretKey。
- 当前是否能看到真实字幕，取决于你采用哪种 ASR 路线：
  - `http`
    - 由外部 ASR 服务消费 `/sessions/frame` 并回调 `/api/internal/meetings/asr-events`
  - `openai-compatible`
    - 由应用内置缓冲器直接把 PCM 分片转成 `wav`，再调用兼容 `audio/transcriptions` 的服务
    - 内置链路会先广播 pending partial，再把稳定 final 写入逐句稿
- 仓库内置的 `ASR dev bridge` 现在既能做纯协议桥接，也能在额外配置真实转写后端后充当开发适配器。

## 本地 Bring-up

如果你要先把“真媒体链路”跑起来，推荐直接使用仓库内置的本地部署包：

- [deploy/meeting/README.zh-CN.md](/Users/talexdreamsoul/Workspace/Projects/touch-win-loop/deploy/meeting/README.zh-CN.md)
- [deploy/meeting/compose.yaml](/Users/talexdreamsoul/Workspace/Projects/touch-win-loop/deploy/meeting/compose.yaml)
- [deploy/meeting/livekit.yaml.example](/Users/talexdreamsoul/Workspace/Projects/touch-win-loop/deploy/meeting/livekit.yaml.example)
- [deploy/meeting/egress.yaml.example](/Users/talexdreamsoul/Workspace/Projects/touch-win-loop/deploy/meeting/egress.yaml.example)
- [scripts/meeting-asr-dev-bridge.mjs](/Users/talexdreamsoul/Workspace/Projects/touch-win-loop/scripts/meeting-asr-dev-bridge.mjs)

最短路径：

1. 启动本地 LiveKit：

```bash
cd "/Users/talexdreamsoul/Workspace/Projects/touch-win-loop/deploy/meeting"
cp ".env.example" ".env"
cp "livekit.yaml.example" "livekit.yaml"
cp "egress.yaml.example" "egress.yaml"
docker compose --env-file ".env" up -d
```

2. 启动本地 ASR dev bridge：

```bash
cd "/Users/talexdreamsoul/Workspace/Projects/touch-win-loop"
pnpm meeting:asr:dev
```

3. 在后台填写：

- RTC
  - `provider = livekit`
  - `serverUrl = http://127.0.0.1:7880`
  - `apiKey = devkey`
  - `apiSecret = devsecret`
- ASR
  - `provider = http`
  - `serviceUrl = http://127.0.0.1:8790`

如果你不想单独起 bridge，也可以直接在后台填写：

- ASR
  - `provider = openai-compatible`
  - 在 `/admin/ai-prompts` 的 AI 场景 `meeting_asr` 绑定 ASR Provider 与模型

这条链路下，应用会直接消费会议 PCM 分片，并按 `meeting_asr` 场景解析到的 Provider/模型调用 `audio/transcriptions`，不再依赖额外的 ASR bridge 环境变量。

默认情况下，`ASR dev bridge` 只负责把 `/sessions/start|frame|finish` 协议跑通，并记录帧计数；它不生成伪字幕。

如果额外提供：

- `MEETING_ASR_DEV_TRANSCRIBE_URL`
- `MEETING_ASR_DEV_TRANSCRIBE_MODEL`
- `MEETING_ASR_DEV_TRANSCRIBE_MODEL_FALLBACKS`
- `MEETING_ASR_DEV_TRANSCRIBE_LANGUAGE`
- `MEETING_ASR_DEV_CALLBACK_URL`
- `MEETING_ASR_DEV_CALLBACK_SECRET`

它会把 PCM 分片转成 `wav`，调用兼容 OpenAI Audio Transcriptions 的服务，再回调：

- `/api/internal/meetings/asr-events`

这样可以在不改应用主架构的前提下，把本地联调提升到“真媒体 + 真识别结果回调”。

推荐开发态默认接法：

```bash
MEETING_ASR_DEV_TRANSCRIBE_URL="https://api.groq.com/openai/v1/audio/transcriptions" \
MEETING_ASR_DEV_TRANSCRIBE_MODEL="whisper-large-v3-turbo" \
MEETING_ASR_DEV_TRANSCRIBE_MODEL_FALLBACKS="whisper-large-v3" \
MEETING_ASR_DEV_TRANSCRIBE_LANGUAGE="zh" \
MEETING_ASR_DEV_TRANSCRIBE_API_KEY="<GROQ_API_KEY>" \
MEETING_ASR_DEV_CALLBACK_URL="http://127.0.0.1:3510/api/internal/meetings/asr-events" \
pnpm meeting:asr:dev
```

说明：

- 当前 bridge 默认模型已调整为 `whisper-large-v3-turbo`
- 若未显式指定 fallback，且上游是 Groq，则会自动按 `whisper-large-v3-turbo -> whisper-large-v3` 回退
- 后续若要私有化，只需要替换 bridge 背后的转写上游，不需要改后台 `provider=http` / `serviceUrl=http://127.0.0.1:8790`

## 推荐落地方式

### 1. RTC

二选一：

- 自建 LiveKit。
  - 可用 Docker / 容器服务部署。
  - 需要至少准备：
    - `serverUrl`
    - `apiKey`
    - `apiSecret`
    - `webhookSecret`
- 购买托管 LiveKit。
  - 后台同样只填上述连接参数。

参考官方文档：

- [LiveKit Self-Hosting Deployment](https://docs.livekit.io/home/self-hosting/deployment/)
- [LiveKit Egress](https://docs.livekit.io/home/self-hosting/egress/)

### 2. ASR

当前支持两种接法。

`provider = http`

- 需要提供一个 HTTP 网关，服务端会调用：
  - `POST /sessions/start`
  - `POST /sessions/frame`
  - `POST /sessions/finish`
- 适合你已经有独立 ASR worker / bridge 的情况。

`provider = openai-compatible`

- 不需要额外起 ASR bridge。
- 应用内会按参与者缓存 PCM 分片，达到阈值后直接请求：
  - `POST <meeting_asr Provider baseURL>/audio/transcriptions`
- 若 `meeting_asr` 绑定的是 Coze 语音 Provider，则复用 Coze audio transcriptions，不要求传统模型池。
- 若 `meeting_asr` 绑定的是百炼 DashScope Provider，则按 `qwen3-asr-flash` 兼容 `chat/completions` 分片转写；`qwen3-asr-flash-realtime` profile 继续用于实时 sidecar。
- Provider、API Key 与模型/profile 只来自 AI 场景 `meeting_asr` 的绑定，不再从会议 ASR 配置读取默认模型或转写密钥。
- 适合直接接 OpenAI 兼容音频转写、Coze 语音或百炼 ASR。

公共最小要求：

- `http` provider 需要 `serviceUrl`
- `openai-compatible` provider 需要 AI 场景 `meeting_asr` 已绑定可用 ASR Provider/模型或 Coze/百炼语音 Provider
- 可选 `webhookSecret`

## 后台配置入口

管理员进入：

- [meeting-providers.vue](/Users/talexdreamsoul/Workspace/Projects/touch-win-loop/app/pages/admin/meeting-providers.vue)

对应接口：

- [providers.get.ts](/Users/talexdreamsoul/Workspace/Projects/touch-win-loop/server/api/admin/meeting/providers.get.ts)
- [providers.patch.ts](/Users/talexdreamsoul/Workspace/Projects/touch-win-loop/server/api/admin/meeting/providers.patch.ts)
- [providers/test.post.ts](/Users/talexdreamsoul/Workspace/Projects/touch-win-loop/server/api/admin/meeting/providers/test.post.ts)

需要填写的字段：

- RTC
  - `provider = livekit`
  - `serverUrl`
  - `apiKey`
  - `apiSecret`
  - `embedBaseUrl` 可选
  - `webhookSecret` 仅在你使用自定义转发 webhook / adapter 时需要
  - `roomPrefix` 可选
- ASR
  - `provider = http` 或 `openai-compatible`
  - `provider = http` 时填写 `serviceUrl`，`apiKey` 可选
  - `provider = openai-compatible` 时在 AI 场景 `meeting_asr` 维护 Provider、API Key 与模型/profile，可绑定 OpenAI 兼容、Coze 语音或百炼 DashScope
  - `webhookSecret` 可选

说明：

- 会议配置会保存在后台。
- 没有后台配置时，项目页不会回退到 env 或 `mock`。
- `WINLOOP_CONFIG_MASTER_KEY` 只负责 secret 加密，不参与 provider 参数决策。
- 管理页“测试连通性”对 `openai-compatible` 不再只测端口，而是会发一段最小 `wav` 到 `meeting_asr` 绑定 Provider 做真实转写探针。

## 管理员落地顺序

建议后台管理员按下面顺序操作：

1. 先准备 RTC 基础设施。
   - 本地/测试环境可直接使用 `deploy/meeting` 里的 `docker compose`
   - 线上可使用自建或托管 LiveKit
2. 选择 ASR 路线。
   - `http`：对接独立 ASR bridge / worker
   - `openai-compatible`：应用内按 `meeting_asr` 场景绑定直接调用 OpenAI 兼容、Coze 或百炼 ASR
3. 进入后台管理页 `/admin/meeting-providers` 保存 RTC / ASR / worker 配置。
4. 点击“测试连通性”。
   - RTC 通过只代表房间/录制控制链路可达
   - ASR 通过只代表转写入口可达，不代表业务字幕一定已接真实识别结果
5. 回到项目页验证。
   - 创建页不再显示运行时缺失
   - 能创建并加入站内会议客户端
   - 结束会议后能看到纪要/录制资源补齐
6. 若要验证真实字幕，再补充真实 ASR 后端并复测语音输入。

## Webhook 与回调

### RTC Provider 回调

服务端入口：

- [provider-events.post.ts](/Users/talexdreamsoul/Workspace/Projects/touch-win-loop/server/api/internal/meetings/provider-events.post.ts)

建议把 provider webhook 指向：

- `/api/internal/meetings/provider-events`

当前 RTC 回调支持两种鉴权模式：

- 原生 LiveKit webhook
  - 服务端会校验 `Authorization` 里的签名 JWT
  - 同时校验 JWT claim 中的 `sha256` 与原始 body
  - 使用的是后台配置的 `apiKey / apiSecret`
- 自定义转发 / adapter webhook
  - 若配置了 `webhookSecret`，也支持：
    - `Authorization: Bearer <secret>`
    - `x-winloop-meeting-secret: <secret>`

### ASR 回调

服务端入口：

- [asr-events.post.ts](/Users/talexdreamsoul/Workspace/Projects/touch-win-loop/server/api/internal/meetings/asr-events.post.ts)

建议把 ASR 结果回调指向：

- `/api/internal/meetings/asr-events`

若配置了 `webhookSecret`，服务端会校验：

- `Authorization: Bearer <secret>`
- 或 `x-winloop-asr-secret: <secret>`

## 当前用户侧行为

- 项目会议列表接口会返回 `runtimeHealth`。
- 新建会议页会先检查运行状态。
- 未完成 RTC / ASR 配置时：
  - 快速创建按钮禁用。
  - 完整表单提交按钮禁用。
  - 页面直接展示缺失项。
- 即使绕过前端，后端创建 / 启动 / 加入接口也会返回明确的中文错误。

## 代码入口

- 运行时健康检查：
  - [meeting-runtime.ts](/Users/talexdreamsoul/Workspace/Projects/touch-win-loop/server/services/meeting/meeting-runtime.ts)
- 后台动态配置存储：
  - [platform-meeting-config-store.ts](/Users/talexdreamsoul/Workspace/Projects/touch-win-loop/server/utils/platform-meeting-config-store.ts)
- 项目会议列表接口：
  - [index.get.ts](/Users/talexdreamsoul/Workspace/Projects/touch-win-loop/server/api/projects/[id]/meetings/index.get.ts)
- 创建页前端阻断：
  - [WorkspaceMeetingCreatePanel.vue](/Users/talexdreamsoul/Workspace/Projects/touch-win-loop/app/components/workspace/WorkspaceMeetingCreatePanel.vue)

## 建议上线顺序

1. 先准备 `WINLOOP_CONFIG_MASTER_KEY`。
2. 部署 LiveKit。
3. 部署 ASR HTTP 网关。
4. 在后台填写会议配置并保存。
5. 配好 RTC / ASR webhook。
6. 回到项目页验证：
   - 能打开会议总览 / 创建页 / 详情页。
   - 创建页状态变为可创建。
   - 新建会议后可加入站内 Web 客户端。
   - 结束会议后能自动看到“会议录制”资源。
7. 如果要继续打通完整会后链路，再补：
   - 生产级 ASR 服务对 `/sessions/frame` 的真实识别与 webhook 回调
   - 对象存储生命周期 / 大文件导入压测
   - 录制版式与 egress 编排

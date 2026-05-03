# 项目会议研发状态

更新时间：2026-05-03

## 目标范围

本期会议能力的目标是：

- 在项目内提供站内视频会议 / 语音会议。
- 以后台动态配置驱动 RTC / ASR，不再默认回退 `mock`。
- 让会议结束后自动沉淀录制资源与会议纪要资源。
- 支持成员端站内 Web 客户端，以及单会议单链接的外部 guest 参会。

## 已完成

### 会议模型与接口

- 已落地项目会议领域模型：
  - `project_meetings`
  - `project_meeting_participants`
  - `project_meeting_utterances`
  - `project_meeting_jobs`
  - `project_meeting_invitees`
  - `project_meeting_guest_shares`
- 已落地会议生命周期接口：
  - 创建 `POST /api/projects/:id/meetings`
  - 详情 `GET /api/projects/:id/meetings/:meetingId`
  - 启动 `POST /api/projects/:id/meetings/:meetingId/start`
  - 加入 `POST /api/projects/:id/meetings/:meetingId/join`
  - 结束 `POST /api/projects/:id/meetings/:meetingId/end`
  - 逐句稿 `GET /api/projects/:id/meetings/:meetingId/utterances`
- 已落地 provider / ASR 回调入口：
  - `POST /api/internal/meetings/provider-events`
  - `POST /api/internal/meetings/asr-events`

### 工作区与前端交互

- 已落地固定 `meeting` 总览 tab。
- 已落地 `meeting:<id>` 会议详情 tab。
- 已落地 `meeting-create:audio` / `meeting-create:video` 创建 tab。
- 左侧会议入口已收敛为：
  - `发起视频会议`
  - `发起语音会议`
- 已落地创建页的：
  - 快速创建
  - 完整表单
  - 项目成员邀请选择
  - 套餐时长限制
- 已落地预约会议与 active 会议的差异化详情展示。

### RTC / Web 客户端

- 站内 Web 客户端已正式接入 `livekit-client`。
- 成员端已支持：
  - 入会
  - 麦克风
  - 摄像头
  - 视频会议中的屏幕共享
  - 视频会议中的共享音频尽力而为发布
- guest 分享页已接入同一套站内 Web 客户端。
- guest 端当前只可观看，不可发起共享。
- `audio` 会议不会展示共享入口。

### 外部分享

- 已落地单会议单链接的 guest share。
- 已落地 host-only：
  - 生成链接
  - 重新生成链接
  - 撤销链接
- 已落地 guest token、meeting 级 realtime 订阅与严格脱敏快照。

### 实时字幕 / 纪要 / 录制

- 已复用现有 `/api/realtime/ws`，支持 meeting 维度事件。
- 已落地会中字幕上行链路：
  - Web 客户端上传 PCM 音频帧
  - 应用服务转发给 ASR gateway
- 已落地内置 ASR 分片 partial 广播：
  - 转写前先广播 `meeting.caption.partial`
  - 转写完成后再广播并落库 `meeting.caption.final`
- 已落地两条 ASR 路线：
  - `provider = http`
  - `provider = openai-compatible`
- 已落地会后任务链：
  - `transcript_finalize`
  - `meeting_summary`
  - `recording_finalize`
- 已落地纪要资源沉淀。
- 已落地录制资源沉淀。
- 录制资源导入支持远端 URL 超时与重试，并可直接落到后台配置的 S3 / MinIO / local storage。
- 会议详情页已接入 Coze / 百炼实时语音 sidecar 控制，复用答辩 realtime session，不替代 LiveKit RTC。

### 后台管理

- 已落地会议服务后台配置页 `/admin/meeting-providers`。
- 已支持后台保存：
  - RTC 配置
  - ASR 配置
  - worker 配置
- 已支持 `/admin/runtime-settings` 配置全局 Storage：
  - `local`
  - `s3`
  - `minio`
  - accessKey / secretKey 加密保存
  - 写入 / 读取 / 删除探针
- 已支持后台“测试连通性”：
  - LiveKit API 探测
  - `http` ASR 健康探测
  - `openai-compatible` 最小 `wav` 真转写探针
- 会议业务配置当前以后台配置为唯一来源。

## 当前已验证

以下链路已在本地 sandbox 实际验证通过：

- 后台会议配置保存成功。
- 后台“测试连通性”返回 `ready`。
- 项目页可创建 active 会议。
- 浏览器授权麦克风后，成员端可稳定停留在站内 Web 客户端中。
- 已修复“刚 join 就主动离房”的前端 join session 竞态问题。
- 结束会议后可自动完成：
  - `transcript_finalize`
  - `meeting_summary`
  - `recording_finalize`
- 结束会议后可自动生成：
  - 会议纪要资源
  - 会议录制资源

## 未完成 / 未正式支持

### ASR 能力边界

- `http` bridge 的纯协议模式只保证音频帧上行，不保证真实字幕。
- 若要得到真实字幕，仍需：
  - 给 `http` bridge 接真实识别服务
  - 或直接使用 `openai-compatible`
- 内置 ASR 已提供 pending partial；真实模型级 incremental partial 仍取决于外部 ASR / realtime Provider 是否回调 partial。

### RTC / 录制边界

- 目前站内真媒体前端只正式支持 `livekit`。
- `Agora / TRTC` 等 provider 的站内 Web SDK 适配尚未实现。
- 自定义录制布局、录制转场、主持人治理能力尚未实现。
- 远端 URL artifact 已支持重试导入并可落 S3 / MinIO；超大文件分片搬运、生命周期策略仍建议在对象存储侧继续治理。

### 会议产品边界

- 暂未实现：
  - 声纹识别
  - 跨会议人物识别
  - 外部会议平台 bot 接入
  - 会议取消 / RSVP / 重复会议
  - guest 细粒度邀请链接
  - 主持人强制停止他人共享
  - 会中持续滚动总结

## 当前已知边界

- 当前业务路径已经不再默认回退 `mock`，但代码中仍保留部分非 `livekit` provider 的占位提示逻辑，用于明确告知“暂不支持站内原生客户端”。
- `WINLOOP_CONFIG_MASTER_KEY` 仍然保留，用于后台 secret 加密；它不是会议 provider 选择来源。
- 本地 Docker 模式下，provider webhook 回调依赖 `host.docker.internal` 可达。
- 如果没有真实 ASR，会议仍然可以完成 RTC、录制、纪要链路，但字幕内容不会完整。

## 建议下一步

1. 把真实 ASR 能力接上，优先验证“开口即出字幕”。
2. 补一轮 guest 分享页的真实端到端自动化验证。
3. 对生产对象存储补生命周期、跨区容灾和大文件分片搬运压测。
4. 视产品优先级决定是否继续做：
   - 其他 RTC provider 适配
   - 共享治理
   - 会中总结
   - 更细粒度的 guest 权限模型

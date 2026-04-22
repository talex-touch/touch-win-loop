# 答辩工作台改造进度

更新时间：2026-04-20

本文记录 `defense` 工作台本轮已经落地的能力、仍未完成的事项，以及当前前后端数据通路，供后续研发和联调继续推进。

## 1. 本轮已完成

### 1.1 工作台形态

- `workbenchMode === 'defense'` 已切成独立答辩布局，不再复用研发工作台的左侧资源模块和中区 tabs。
- 工作台切换已接入统一场景容器：
  - 先显示 `WinLoop` 场景级加载条
  - 再执行整块内容区轮播
  - 顶部 `WorkspaceHeader` 和底部 `WorkspaceStatusBar` 保持固定，不参与滑动
- 顶部工作台顺序固定为：
  - `project`
  - `defense`
  - `final_review`

### 1.2 答辩主界面

- 左栏 `WorkspaceDefenseSidebar` 已固定为只读状态面板：
  - 答辩概述
  - 语音会议状态
  - 评委 / persona 列表
- 中区 `WorkspaceDefenseWorkbench` 已从纯 cockpit 摘要壳升级为可工作的答辩驾驶舱：
  - 比赛状态 / 倒计时
  - 比赛 timeline 节点列表
  - 当前答辩席状态
  - 最新评分卡
  - 会话时间轴
  - 总结 / 动作项 / 证据缺口
  - 实时答辩控制台
- 右栏继续复用 `WorkspaceRightSidebar`，但答辩语义已切到 `AgentDef`。

### 1.3 Realtime 音视频 sidecar

- 答辩 realtime 已保留 LiveKit 会议壳，不把 Qwen / Coze 改成会议 RTC provider。
- 前端新增共享媒体控制层：
  - 麦克风 / 摄像头权限申请
  - 本地预览
  - PCM16 音频采样
  - 视频帧抽样
  - 设备开关与资源释放
- 已落地统一 provider bridge：
  - `QwenBridge`
  - `CozeBridge`
- Qwen 已改为通过服务端 relay 建立上游 WebSocket，避免浏览器直连无法附加鉴权头的问题。
- 当前验收主链路固定为 `qwen + audio_video`；若仅做最短路径联调，优先补齐 `WINLOOP_DEFENSE_REALTIME_QWEN_*`。
- `nuxt runtimeConfig` 已暴露独立的 `defenseRealtime.qwen / defenseRealtime.coze` 段，不再出现“Env 写了但服务端读不到”的问题。
- Coze 已是正式依赖，当前保留浏览器侧按需动态导入，仅作为加载时机策略，不再是“未正式接入”的降级方案。

### 1.4 答辩数据组织

- `AiDefenseSessionDetail` 现已返回：
  - `session`
  - `state`
  - `personas`
  - `turns`
  - `latestRounds`
  - `latestSummary`
- 前端同时维护两份答辩数据：
  - `defenseTurns`
    - 完整 turn 历史，供中区时间轴使用
  - `defenseRounds`
    - 当前最新一轮评委输出，供左栏和局部状态展示使用
- 文本答辩流和 realtime sidecar 两条链路都会同步更新时间轴，不再只有 realtime 路径可驱动中区状态。

### 1.5 主流程疏通补充

- `final_review` 已进入服务端 workspace view-state 归一化白名单，刷新或跨设备恢复时不再被降级回 `project`。
- 进入终审工作台或打开终审资料抽屉时，会轻量刷新项目资料、共享链接、issue、项目设置与竞赛详情；刷新失败不打断终审驾驶舱，只保留现有空态或状态栏提示。
- 终审助手继续复用现有 workspace chat 链路，但已接入 AI 未配置禁用态与原因提示，不新增终审专属会话模型。
- 本轮只疏通答辩/终审主流程，不扩展终审快照表、发布终审流或 realtime 真机联调范围。

## 2. 当前最小可用数据通路

### 2.1 比赛状态

- 来源：
  - `selectedContest`
  - `selectedContestDetail.timelines`
- 当前中区使用方式：
  - 优先按结构化 `ContestTimeline[]` 推导当前节点、下一节点和倒计时
  - 如果比赛没有结构化 timeline，则回退到 `contest.submissionDeadline`

### 2.2 会话时间轴

- 来源：
  - `GET /projects/:id/defense/sessions/:sessionId`
  - `detail.turns`
  - 文本答辩 SSE `judge` / `done`
  - realtime sidecar `assistant.transcript.final`
- 当前中区使用方式：
  - 优先使用完整 `turns`
  - 若还没有持久化 turn，则回退显示当前 `latestRounds`

### 2.3 Persona / 评委席状态

- 来源：
  - `GET /projects/:id/defense/personas`
  - `GET /projects/:id/defense/sessions/:sessionId`
  - realtime state 中的 `latestSpeakerLabel`
- 当前中区使用方式：
  - persona 启用态来自 `enabled`
  - 当前轮次命中优先按 `turns / latestRounds.personaId`
  - 如果当前轮次没有明确 `personaId`，则回退按发言标签匹配 persona 名称

## 3. 本轮未完成

### 3.1 Realtime 联调

- 未完成 Chromium 真实联调验收：
  - `qwen/audio`
  - `qwen/audio_video`
  - `coze/audio`
  - `coze/audio_video`
- 还没有把 provider 输出音频回灌到 LiveKit 录制轨。
- 还没有做多评委多音色切换，当前仍是一场会话只用一个 session 级 voice。

### 3.2 工作台能力深挖

- 中区还没有加入“轮次对比”或“分阶段评分趋势”。
- 左栏 persona 列表仍是只读状态视图，没有提供中区级快速过滤或按评委聚焦时间轴。
- `final_review` 工作台当前仍沿用聚合模型，数据来自竞赛 / rubric / 资料 / issue / 共享链接 / 项目草案字段；还没有独立终审快照、审核记录或发布审批流。

### 3.3 数据完整性

- realtime `assistant.transcript.final` 当前会回写 turn，但文本字段仍以单条最终文本为主。
- 如果 provider 后续要支持更精细的 question / comment / followUp 分段，需要继续扩展事件标准化与入库映射。

## 4. 已知边界

- v1 默认仅面向现代 Chromium 浏览器，不额外处理 Safari 特殊媒体兼容。
- 一个答辩 session 只允许一个 provider 激活，不支持并发双 provider。
- 若 `audio_video` 权限申请失败，当前策略是不自动降级，而是要求用户显式切回 `audio` 再重试。
- 全仓 `typecheck` 仍有历史类型债，本轮只确保答辩 workbench / realtime 改动没有新增专属错误。

## 5. 已完成验证

- UI / source tests 已覆盖：
  - defense 独立布局
  - workbench 场景切换
  - AgentDef 右栏语义
  - realtime sidecar 接线
  - 中区比赛状态 / persona / timeline 数据接线
- 本轮通过的关键命令：

```bash
pnpm exec vitest run \
  "scripts/tests/workspace-defense-ui.test.mjs" \
  "scripts/tests/workspace-defense-realtime-ui.test.mjs" \
  "scripts/tests/workspace-right-sidebar-ui.test.mjs" \
  "scripts/tests/project-meeting-integration.test.mjs" \
  "scripts/tests/workspace-workbench-transition-ui.test.mjs" \
  "scripts/tests/workspace-initial-loading-ui.test.mjs"
```

## 6. 建议后续顺序

1. 先做 Qwen / Coze 的真实浏览器联调，确认设备权限、音频播放、turn 入库和异常恢复链路。
2. 再补答辩时间轴的阶段聚合和评分趋势，让中区从“最新状态”升级成“过程复盘视图”。
3. 最后再把同类模式推广到 `final_review`，避免两个工作台的数据深度继续分叉。

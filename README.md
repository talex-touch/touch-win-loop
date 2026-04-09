# Touch WinLoop

WinLoop AI（赛帮帮）当前是一套面向竞赛团队的项目工作台，核心链路是：

`选赛 -> 建项 -> 沉淀项目资源 -> 协作梳理 -> 提交与答辩准备`

当前仓库已经不再只是早期骨架，而是围绕 `Workspace / Project / Resource / Collab` 这套模型持续演进。

## 当前产品模型

### 1. Workspace

- 个人或 Team 维度的项目空间。
- 负责成员、邀请、席位、配额与权限边界。

### 2. Project

- 工作推进的主对象。
- 挂载项目设置、竞赛绑定、资料池、协作资源、AI 改动提案与问题清单。

### 3. Resource

- 项目内唯一一等资料对象。
- 所有文件、协作文档、画布都统一作为 `project resource` 存储与展示。

当前资源形态：

| resourceKind | collabPurpose | 用户侧名称 | 说明                     |
| ------------ | ------------- | ---------- | ------------------------ |
| `binary`     | -             | 资料预览   | 上传文件或系统资料库引用 |
| `markdown`   | `notes`       | 协作文档   | 面向结构化文字协作       |
| `draw`       | `workflow`    | 流程画布   | 项目唯一主流程画布       |
| `draw`       | `freeform`    | 自由画布   | 非主流程用途的自由画布   |

### 4. Outline

- `ProjectOutline` 是派生视图，不是独立编辑对象。
- 由项目设置和资料内容自动聚合，用于导航、浏览和结构梳理。

## 当前协作约定

- 左侧“流程”入口始终打开项目唯一的 `workflow` 画布。
- 左侧资源菜单只保留：
  - `新建协作文档`
  - `新建自由画布`
  - `从系统资源库导入`
  - `从本地设备中上传`
- 固定 `flow` tab 的用户可见名称统一为 `流程画布`。
- `流程画布` 与资源列表中的同一条 workflow 资源指向同一个底层对象。

## 当前页面入口

- `/team/:teamId/project/:projectId`：项目工作区主界面
- `/workspace/:workspaceId/project/:projectId`：工作区项目页别名入口
- `/admin/integrations/feishu`：飞书集成中心

## 开发启动

```bash
pnpm install
pnpm dev
```

默认开发地址：

- `http://localhost:3510`

## 基础环境变量

至少需要显式配置以下运行时依赖：

```txt
WINLOOP_PG_URL=postgresql://user:password@127.0.0.1:5432/winloop
WINLOOP_REDIS_URL=redis://:password@127.0.0.1:6379/0
WINLOOP_CONFIG_MASTER_KEY=your-strong-master-key
WINLOOP_CONTEST_AUTO_SEED=false
```

补充说明：

- PostgreSQL 是当前运行时强依赖。
- Redis 主要用于运行时配置信息与预留能力。
- AI / 飞书等敏感配置支持加密存储。
- 资源回收 worker 参数改为后台 UI 管理，不再从 Env 读取。
- Sentry 为可选能力；未配置 `WINLOOP_SENTRY_DSN` / `WINLOOP_SENTRY_ENVIRONMENT` 时应用仍可正常运行，只是不启用错误上报。

## 会议能力环境变量

项目内置会议默认支持 `mock` 模式，本地未接真实 RTC / ASR 时也能跑通页面和后端链路。切到真实 provider 时，至少补齐以下参数：

```txt
WINLOOP_MEETING_RTC_PROVIDER=mock
WINLOOP_MEETING_RTC_SERVER_URL=
WINLOOP_MEETING_RTC_API_KEY=
WINLOOP_MEETING_RTC_API_SECRET=
WINLOOP_MEETING_RTC_EMBED_BASE_URL=
WINLOOP_MEETING_RTC_WEBHOOK_SECRET=
WINLOOP_MEETING_RTC_ROOM_PREFIX=winloop

WINLOOP_MEETING_ASR_PROVIDER=mock
WINLOOP_MEETING_ASR_SERVICE_URL=
WINLOOP_MEETING_ASR_API_KEY=
WINLOOP_MEETING_ASR_WEBHOOK_SECRET=

WINLOOP_MEETING_WORKER_ENABLED=true
WINLOOP_MEETING_WORKER_INTERVAL_MS=5000
WINLOOP_MEETING_WORKER_BATCH_SIZE=6
WINLOOP_MEETING_WORKER_MAX_ATTEMPTS=5
```

说明：

- `RTC` 负责房间、入会 token、录制与 webhook。
- `ASR` 负责实时字幕输入；partial 只广播，final 才会落库。
- `WORKER` 负责会后录制入库、纪要生成和失败重试。
- 默认按 `LiveKit` 风格能力建模，但通过 `RtcProviderGateway` / `MeetingAsrGateway` 做了适配隔离。

## 相关文档

- [工作台信息架构](./docs/workspace-information-architecture.md)
- [协作资源模型](./docs/collab-resource-model.md)
- [当前重构计划](./plan.md)
- [Jenkins 部署说明](./deploy/jenkins/README.zh-CN.md)
- [在线编辑选型 ADR（未来能力）](./docs/online-editor-selection.md)
- [飞书多维同步教程](./docs/feishu-bitable-sync-guide.md)

## 关于在线 Office 编辑

当前产品现状是：

- `binary` 资源支持上传、转换、预览。
- `markdown/draw` 资源支持实时协作。

ONLYOFFICE / Office 在线编辑属于后续能力规划，不属于当前已经落地的产品能力。相关背景和选型结论已整理为 ADR，而不是现状说明文档。

# WinLoop 项目功能全景说明书

更新时间：2026-05-13

本文基于当前仓库代码、页面入口、服务端 API、共享类型、数据库 schema、迁移脚本与已有专题文档整理，目标是把 `touch-win-loop` 当前具备的功能能力完整铺开，作为产品理解、研发交接、测试设计和后续重构的统一参考。

## 1. 项目定位

`Touch WinLoop` 当前产品名在 README 中写作 `WinLoop AI（赛帮帮）`，是一套面向竞赛团队的 AI 项目工作台。核心业务链路是：

```txt
选赛 -> 建项 -> 沉淀项目资源 -> 协作梳理 -> 智能分析 -> 提交与答辩准备
```

从代码结构看，它已经不是单纯的竞赛信息展示站，而是一个覆盖“竞赛资料库 + 团队项目台 + 项目协作空间 + AI/RAG + 飞书同步 + 答辩会议 + 管理后台 + 运维观测”的 Nuxt 全栈系统。

核心价值可以概括为：

- 为学生、教师、创业团队或竞赛团队提供竞赛筛选、资料管理、项目协作、答辩准备的一体化工作台。
- 为平台运营方提供竞赛库维护、资源治理、发布审核、飞书多维同步、用户与计费管理、AI/会议/存储运行时配置。
- 为 AI 能力提供项目内上下文、知识索引、引用渲染、工作流编排、答辩陪练、流程画布辅助与协作文档补齐。

## 2. 技术架构概览

### 2.1 技术栈

主要技术栈来自 `package.json` 和 `nuxt.config.ts`：

| 层级 | 技术/库 | 用途 |
| --- | --- | --- |
| Web 框架 | Nuxt 3 / Vue 3 / TypeScript | 全栈应用、页面路由、Nitro API |
| UI | Arco Design Vue / UnoCSS / 自定义 CSS tokens | 管理后台、工作台、基础组件 |
| 状态与组合式逻辑 | Pinia / VueUse / composables | 前端业务状态、工作台状态拆分 |
| 协同编辑 | Yjs / y-protocols / Tiptap | Markdown 协作文档、presence、富文本能力 |
| 画布 | draw.io embed / tldraw / Vue Flow / CanvasKit Host 相关组件 | 流程图、自由画布、设计画布、设备编排 |
| AI | LangChain / OpenAI-compatible runtime / DashScope / Coze / deepagents | LLM 调用、embedding、workflow、语音/实时能力 |
| 数据库 | PostgreSQL / pg / pgvector 可选 | 业务持久化、向量索引 |
| 文件与存储 | 本地存储 / S3 / MinIO / OnlyOffice 转换 | 资源上传、预览、会议录制、文档转换 |
| 实时通信 | WebSocket / LiveKit client | 工作台实时事件、协作 presence、会议 |
| 可观测 | Sentry / worker 状态 API | 错误上报、后台任务观测 |
| 测试 | Vitest / Playwright 脚本 | 单元测试、smoke、浏览器链路验证 |
| 部署 | Docker / Netlify / Jenkins / 1Panel 脚本 | 构建、部署、CI/CD |

### 2.2 应用形态

项目采用 Nuxt 全栈目录结构：

- `app/pages`：前端页面入口。
- `app/components`：工作台、后台、登录、通知、编辑器等 Vue 组件。
- `app/composables`：前端业务逻辑封装，例如项目资源、项目 AI、会议、知识索引、显示偏好。
- `server/api`：Nitro API 路由，覆盖公共端、项目端、团队端、后台端、内部 webhook。
- `server/services`：领域服务与外部系统适配，例如 AI、会议、飞书、文档转换、知识视觉投影。
- `server/utils`：store、权限、运行时配置、数据库访问、计费、实时、存储等基础工具。
- `server/plugins`：后台 worker 和运行时插件。
- `shared/types` 与 `internal/shared-types`：前后端共享领域类型。
- `scripts/migrations`：显式 SQL 迁移。
- `docs`：架构、专项方案、部署、竞赛技术材料。

### 2.3 核心运行依赖

当前运行至少依赖：

- PostgreSQL：主业务数据持久化，README 中已明确为运行时强依赖。
- Redis：运行时配置缓存与预留能力。
- `WINLOOP_CONFIG_MASTER_KEY`：敏感配置加密根密钥。
- 可选 Sentry：错误上报、source map 上传、worker smoke。
- 可选 draw.io embed：流程画布宿主，默认 `https://embed.diagrams.net`。
- 可选 tldraw license：生产环境自由画布需要。
- 可选 AI Provider：文本模型、embedding、视觉、多模态、语音 ASR/TTS、实时答辩。
- 可选 LiveKit/ASR：项目会议真实音视频与转写链路。
- 可选对象存储：本地、S3、MinIO 渠道池。

开发启动入口：

```bash
pnpm install
pnpm dev
```

本地推荐地址：

```txt
http://127.0.0.1:3510
```

## 3. 核心领域模型

### 3.1 Workspace / Team

Workspace 是个人或团队级空间，代码里仍保留 `Workspace` 命名，同时页面入口已经明显偏向 `Team`：

- `/team/:teamId`
- `/team/:teamId/project/:projectId`
- `/team/:teamId/billing`

Workspace/Team 承担：

- 成员、角色与邀请。
- 项目归属。
- 席位、配额、计费套餐。
- AI 使用额度边界。
- 飞书工作区集成。
- 工作台显示偏好默认值。

相关类型：

- `WorkspaceType = personal | team`
- `WorkspaceMemberRole = owner | admin | manager | member`
- `WorkspaceWithQuota`
- `TeamQuota`
- `WorkspaceDisplayPreferenceSnapshot`

关键数据表：

- `workspaces`
- `workspace_members`
- `team_quotas`
- `team_subscriptions`
- `workspace_billing`
- `workspace_billing_orders`
- `workspace_display_defaults`
- `user_workspace_display_overrides`
- `user_workspace_last_projects`

### 3.2 Project

Project 是项目推进的主对象，绑定在 Workspace/Team 下。它承载：

- 项目基本信息。
- 竞赛绑定与赛道适配。
- 项目资料池。
- 项目成员。
- 项目设置草稿。
- 工作台视图状态。
- AI 改动提案。
- Issue 与风险。
- 会议、答辩、最终评审、导出包。

相关类型：

- `ProjectStatus = draft | in_progress | completed`
- `ProjectSource = chat | form`
- `ProjectWorkbenchMode = project | defense | final_review`
- `ProjectDisplayIcon`
- `ProjectSettingsDraft`

关键数据表：

- `projects`
- `project_members`
- `project_contest_bindings`
- `project_contest_adaptations`
- `project_settings_drafts`
- `project_workspace_view_states`
- `project_seat_quotas`

### 3.3 ProjectResource

ProjectResource 是项目内资料的一等对象，当前所有上传文件、系统资料引用、协作文档、画布都统一收敛为资源。

核心字段：

- `resourceKind`：`binary | markdown | draw`
- `collabPurpose`：`workflow | freeform | design | notes`
- `parentResourceId` / `sortOrder`：资源树结构。
- `previewStatus`：预览转换状态。
- `documentId`：文档解析/预览关联。
- `metadata`：扩展元数据。

资源形态：

| resourceKind | collabPurpose | 用户侧名称 | 说明 |
| --- | --- | --- | --- |
| `binary` | 空 | 资料预览 | 上传文件或系统资料库引用 |
| `markdown` | `notes` | 协作文档 | 结构化文字协作，支持 AI 补齐 |
| `draw` | `workflow` | 流程画布 | 项目唯一主流程画布 |
| `draw` | `freeform` | 自由画布 | 非主流程用途的自由画布 |
| `draw` | `design` | 设计/设备画布 | 设计画布、设备编排等扩展用途 |

关键数据表：

- `project_resources`
- `project_resource_bindings`
- `project_resource_documents`
- `project_resource_document_tasks`
- `project_resource_collab_docs`
- `project_resource_device_arrangements`
- `project_resource_upload_sessions`
- `project_resource_upload_chunks`
- `project_resource_shares`
- `project_resource_comment_threads`
- `project_resource_comment_messages`
- `project_resource_review_jobs`
- `project_resource_review_findings`

### 3.4 Contest / Track / Resource

平台竞赛库负责沉淀竞赛、赛道、时间线、评分规则、FAQ、资料与发布状态。

主要对象：

- `Contest`
- `Track`
- `ContestTimeline`
- `TrackTimeline`
- `Rubric`
- `ContestFaqItem`
- `Resource`
- `ReleaseVersion`

竞赛资源分类包括：

- 基础信息
- 时间线
- 赛道
- 评分规则
- 往届真题
- 获奖作品
- 模板
- FAQ
- 评委指南
- 赛道详解
- AI prompts
- 提交样例
- 政策通知
- 合规

关键数据表：

- `contests`
- `contest_tracks`
- `contest_timelines`
- `contest_track_timelines`
- `contest_rubrics`
- `contest_resources`
- `contest_faq_items`
- `contest_resource_documents`
- `contest_resource_document_tasks`
- `contest_resource_profiles`
- `contest_resource_relations`
- `contest_resource_search_events`
- `contest_resource_governance_tasks`
- `contest_audit_logs`
- `release_versions`
- `release_review_logs`

### 3.5 AI / Knowledge / Workflow

AI 相关能力不是单点调用，而是一组模型：

- 用户 AI 设置与记忆。
- AI 聊天会话与消息。
- DeepAgent checkpoint 与 store。
- 项目知识索引与 RAG。
- 工作台 AI 流式响应。
- AI 改动提案审批。
- Intelligence Workflow v1。
- 答辩 AI session。

关键数据表：

- `ai_usage_ledger`
- `ai_chat_sessions`
- `ai_chat_messages`
- `ai_chat_session_context`
- `ai_deepagent_checkpoints`
- `ai_deepagent_store_items`
- `user_ai_settings`
- `user_ai_memories`
- `ai_project_change_requests`
- `ai_workflow_definitions`
- `ai_workflow_runs`
- `ai_workflow_run_steps`
- `project_knowledge_sources`
- `project_knowledge_index_tasks`
- `project_knowledge_chunks`
- `project_knowledge_index_snapshots`
- `project_knowledge_relations`
- `project_knowledge_semantic_layouts`
- `project_knowledge_semantic_points`

## 4. 用户侧功能

## 4.1 登录、注册与账号绑定

页面入口：

- `/login`
- `/auth/bind`
- `/auth/onboarding`

API 能力：

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/session`
- `GET /api/auth/sessions`
- `GET /api/auth/meta`
- `POST /api/auth/avatar`
- `DELETE /api/auth/avatar`
- `GET /api/auth/avatar/:userId`
- `GET /api/auth/magic-login`

第三方登录/绑定：

- 飞书登录与绑定：
  - `/api/auth/feishu/authorize`
  - `/api/auth/feishu/callback`
  - `/api/auth/feishu/bind-status`
  - `/api/auth/feishu/unbind`
  - `/api/auth/feishu/websdk-login`
  - `/api/auth/feishu/audits`
- Casdoor：
  - `/api/auth/casdoor/authorize`
  - `/api/auth/casdoor/callback`
  - `/api/auth/casdoor/bind-status`
- 通用 OAuth：
  - `/api/auth/oauth/authorize`
  - `/api/auth/oauth/callback`
  - `/api/auth/oauth/bind-status`

主要功能：

- 用户名/密码登录。
- 会话 cookie 管理。
- 注册开关由运行时配置控制。
- 外部身份绑定与冲突提示。
- 新用户 onboarding 信息补齐。
- 用户头像上传、删除、回显。
- 用户登录历史、第三方绑定、团队成员等个人设置面板。

关键实现：

- `server/utils/auth.ts`
- `server/services/auth/login-session.ts`
- `server/services/auth/external-identity.ts`
- `server/services/auth/user-avatar-sync.ts`
- `server/services/feishu/login-flow.ts`
- `server/services/casdoor/login-flow.ts`
- `app/composables/useLoginPage.ts`
- `app/components/login/*`
- `app/components/user-settings/*`

## 4.2 首页、仪表盘与数据分析

页面入口：

- `/`
- `/dashboard`
- `/dashboard/analytics`

主要功能：

- 进入工作台或团队项目台。
- 平台概览、竞赛动态、洞察面板、右侧信息栏。
- 综合数据分析页面，支持按时间范围、工作区、项目、竞赛过滤。
- 分析维度包括概览、趋势、获奖特征、能力画像、难度完成度、准备节奏。

API 能力：

- `GET /api/dashboard/overview`
- `GET /api/analytics/overview`
- `GET /api/analytics/trends`
- `GET /api/analytics/awards`
- `GET /api/analytics/profile`
- `GET /api/analytics/difficulty`
- `GET /api/analytics/preparation`
- `POST /api/analytics/events`
- `GET /api/pageview`

关键实现：

- `app/pages/dashboard.vue`
- `app/pages/dashboard/analytics.vue`
- `app/components/dashboard/*`
- `app/composables/useAnalyticsDashboard.ts`
- `server/utils/analytics-store.ts`
- `server/utils/analytics-filters.ts`

## 4.3 赛事总库

页面入口：

- `/contests`
- `/contests/:id`
- `/contests/:id/resources`

主要功能：

- 浏览平台发布的赛事列表。
- 按学科门类、级别、交付物类型、时间状态过滤。
- 支持网格/列表切换、排序、分页。
- 查看赛事详情、赛道信息、时间线、提交要求、参赛信息。
- 查看竞赛资料中心。
- 资料按分类、标签、年份、访问级别、排序方式筛选。
- 资料详情弹窗、资料点击统计。

API 能力：

- `GET /api/contests`
- `GET /api/contests/:id`
- `GET /api/contests/:id/resources`
- `POST /api/contests/:id/resources/:resourceId/click`
- `GET /api/contests/:id/tracks/:trackId/cover`

关键实现：

- `app/pages/contests/index.vue`
- `app/pages/contests/[id].vue`
- `app/pages/contests/[id]/resources.vue`
- `server/utils/contest-store.ts`
- `server/utils/resource-knowledge-event.ts`

## 4.4 平台资料中心

页面入口：

- `/resources`

主要功能：

- 跨竞赛浏览平台资料。
- 按竞赛、分类、标签、年份、可访问性、排序方式过滤。
- 显示资料卡片、AI 标签、摘要、来源信息。
- 打开资料详情弹窗。
- 记录资源搜索与点击事件，用于资源治理与热度分析。

API 能力：

- `GET /api/resources`
- `GET /api/contests/:id/resources`
- `POST /api/contests/:id/resources/:resourceId/click`

关键实现：

- `app/pages/resources.vue`
- `server/utils/contest-store.ts`
- `server/utils/resource-knowledge-store.ts`

## 4.5 Team 项目台

页面入口：

- `/team`
- `/team/:teamId`
- `/team/:teamId/billing`

主要功能：

- 展示当前团队/工作区下的项目列表。
- 创建项目、快速建项、批量项目接口。
- 查看项目详情、项目成员、项目 profile。
- 记录团队最近访问项目。
- 团队成员、邀请、席位、角色管理。
- 团队计费页，查看当前套餐、账单、订单、套餐升级/结算确认。

API 能力：

- `GET /api/teams`
- `POST /api/teams`
- `PATCH /api/teams/:id`
- `GET /api/teams/:id/members`
- `PATCH /api/teams/:id/members/:userId/role`
- `DELETE /api/teams/:id/members/:userId`
- `POST /api/teams/:id/invitations`
- `POST /api/teams/:id/invitations/:invitationId/revoke`
- `GET /api/teams/:id/last-project`
- `PUT /api/teams/:id/last-project`
- `PATCH /api/teams/:id/seats`
- `GET /api/teams/:id/billing/estimate`
- `POST /api/teams/:id/billing/checkout`
- `GET /api/teams/:id/billing/orders`
- `PATCH /api/teams/:id/billing`
- `PATCH /api/teams/:id/billing/addons`

关键实现：

- `app/pages/team/[teamId]/index.vue`
- `app/pages/team/[teamId]/billing.vue`
- `app/components/team/*`
- `server/utils/team-workspace-store.ts`
- `server/utils/team-membership-store.ts`
- `server/utils/team-invitation-store.ts`
- `server/utils/team-quota-store.ts`
- `server/utils/billing-usage-store.ts`

## 4.6 邀请加入

页面入口：

- `/invite/:token`

主要功能：

- 根据邀请 token 查看邀请信息。
- 接受邀请加入团队或项目协作。
- 处理过期、撤销、权限不足、登录状态等边界。

API 能力：

- `POST /api/invitations/:token/accept`

关键数据表：

- `invitations`

## 5. 项目工作台功能

项目工作台是当前系统最核心、功能密度最高的页面。

主入口：

- `/team/:teamId/project/:projectId`

旧入口状态：

- `/workspace/:workspaceId/project/:projectId` 已下线并返回 404，引导使用 `/team/:teamId/project/:projectId`。

主容器：

- `app/pages/team/[teamId]/project/[projectId].vue`

核心组件：

- `WorkspaceLeftSidebar.vue`
- `WorkspaceMainPanel.vue`
- `WorkspaceRightSidebar.vue`
- `WorkspaceHeader.vue`
- `WorkspaceTabStrip.vue`
- `WorkspaceStatusBar.vue`
- `WorkspaceDashboardTab.vue`
- `WorkspaceFlowTab.vue`
- `WorkspaceResourcePreviewTab.vue`
- `WorkspaceProjectSettingsTab.vue`
- `WorkspaceLoopyDataTab.vue`
- `WorkspaceMeetingPanel.vue`
- `WorkspaceDefenseWorkbench.vue`
- `WorkspaceFinalReviewWorkbench.vue`

## 5.1 工作台整体布局

工作台由四块组成：

- 顶部 Header：项目、工作区、当前用户、状态与全局入口。
- 左侧 Rail + Panel：资源、会议、竞赛分析、项目分析、Issue、上传、通知等模块。
- 中央主面板：固定 tab 和资源 tab。
- 右侧 Sidebar：AI 助手、评论、上下文工具、资料抽屉等。

固定 tab 类型：

- `dashboard`：仪表盘。
- `meeting`：会议概览。
- `members`：成员管理。
- `flow`：流程画布。
- `settings`：项目设置。
- `loopy_data`：Loopy 数据。

动态 tab 类型：

- `resource:<id>`：某个项目资源。
- `meeting:<id>`：某场会议详情。
- `meeting-create:audio`
- `meeting-create:video`

工作台模式：

- `project`：默认研发工作台。
- `defense`：答辩工作台。
- `final_review`：终审工作台。

视图状态会持久化：

- 当前打开 tab。
- active tab。
- 右侧 sidebar 状态。
- AI tabs 偏好。
- 工作台显示偏好。

关键 API：

- `GET /api/projects/:id/view-state`
- `PUT /api/projects/:id/view-state`

关键实现：

- `app/composables/useWorkspaceProjectShell.ts`
- `app/composables/useWorkspaceProjectRoute.ts`
- `app/composables/useWorkspaceSidebarLayout.ts`
- `server/utils/project-workspace-view-store.ts`

## 5.2 左侧资源管理器

入口模块：

- `资源管理器`
- `项目会议`
- `竞赛分析`
- `项目分析`
- `Issue`
- `上传中心`
- `通知中心`

资源管理器能力：

- 展示项目资源树。
- 展示项目大纲。
- 新建协作文档。
- 新建自由画布。
- 打开项目唯一流程画布。
- 从系统资源库导入。
- 从本地设备上传。
- 查看资源回收站。
- 重命名资源。
- 下载资源。
- 复制资源名称。
- 分享资源。
- 复制资源。
- 删除/批量删除资源。
- 恢复资源。
- 彻底清理资源。
- 资源树拖拽排序和父子结构调整。
- 查看资源知识索引状态。
- 创建设备编排资源。

关键 API：

- `GET /api/projects/:id/resources`
- `POST /api/projects/:id/resources/upload`
- `POST /api/projects/:id/resources/collab`
- `GET /api/projects/:id/resources/library`
- `POST /api/projects/:id/resources/library`
- `POST /api/projects/:id/resources/library/:resourceId/favorite`
- `PATCH /api/projects/:id/resources/tree`
- `PATCH /api/projects/:id/resources/:resourceId`
- `DELETE /api/projects/:id/resources/:resourceId`
- `POST /api/projects/:id/resources/:resourceId/restore`
- `DELETE /api/projects/:id/resources/:resourceId/purge`
- `POST /api/projects/:id/resources/:resourceId/duplicate`
- `GET /api/projects/:id/resources/recycle`
- `GET /api/projects/:id/resources/shares`
- `POST /api/projects/:id/resources/:resourceId/shares`
- `DELETE /api/projects/:id/resources/shares/:shareId`

关键实现：

- `WorkspaceLeftSidebar.vue`
- `WorkspaceResourceManagerPanel.vue`
- `WorkspaceResourceUploadHint.vue`
- `WorkspaceUploadPanel.vue`
- `WorkspaceUploadAside.vue`
- `app/composables/useWorkspaceProjectResources.ts`
- `app/composables/useProjectUploadManager.ts`
- `server/utils/project-resource-store.ts`
- `server/services/project-resource-upload.ts`

## 5.3 资源上传与断点续传

主要功能：

- 本地文件上传。
- 文件类型与大小校验。
- 上传任务列表。
- 上传进度、速度、状态展示。
- 暂停、恢复、重试、取消。
- 批量暂停/恢复。
- 清理已完成任务。
- 上传 session 与 chunk 持久化。
- 上传完成后创建项目资源。
- 上传完成后触发预览转换与知识索引。
- 记录资源上传计费/用量事件。

关键 API：

- `POST /api/projects/:id/resource-upload-sessions`
- `GET /api/projects/:id/resource-upload-sessions`
- `PUT /api/projects/:id/resource-upload-sessions/:sessionId/chunks/:chunkIndex`
- `POST /api/projects/:id/resource-upload-sessions/:sessionId/complete`
- `POST /api/projects/:id/resource-upload-sessions/:sessionId/pause`
- `POST /api/projects/:id/resource-upload-sessions/:sessionId/resume`
- `POST /api/projects/:id/resource-upload-sessions/:sessionId/cancel`

关键数据表：

- `project_resource_upload_sessions`
- `project_resource_upload_chunks`

关键实现：

- `shared/constants/project-resource-upload.ts`
- `app/composables/useProjectUploadManager.ts`
- `server/services/project-resource-upload.ts`
- `server/utils/project-resource-upload-session-store.ts`

## 5.4 资源预览、源文件与分享

主要功能：

- 获取项目资源预览。
- 获取源文件下载。
- 获取资源文件访问 URL。
- 查询预览转换状态。
- 重新转换。
- 资源分享链接。
- 公开或工作区可见分享。
- 分享有效期：`1h / 1d / 3d / 7d / 1mon`。
- 外部分享页访问资源。

页面入口：

- `/share/resources/:shareKey`

关键 API：

- `GET /api/projects/:id/resources/:resourceId/preview`
- `GET /api/projects/:id/resources/:resourceId/preview-status`
- `GET /api/projects/:id/resources/:resourceId/source`
- `GET /api/projects/:id/resources/:resourceId/file`
- `POST /api/projects/:id/resources/:resourceId/reconvert`
- `GET /api/share/resources/:shareKey`

关键实现：

- `WorkspaceResourcePreviewTab.vue`
- `server/services/document/project-resource-access-token.ts`
- `server/utils/project-resource-access-url.ts`
- `server/utils/project-resource-share-store.ts`
- `server/plugins/project-document-preview-worker.ts`

## 5.5 协作文档

协作文档是 `resourceKind=markdown + collabPurpose=notes` 的 ProjectResource。

主要功能：

- 在资源 tab 中打开。
- 基于 Tiptap/Yjs 的协同编辑基础。
- Markdown 与富文本结构同步。
- 支持标题、段落、列表、任务列表、表格、图片、代码块、链接等编辑能力。
- 支持图片上传并落为项目资源。
- 支持评论锚点。
- 支持 AI 上下文补齐。
- 用户按 `Tab` 接受补齐建议。
- 每次接受补齐暂按 `0.1 credits` 计费。
- 内容更新后标记知识索引 stale 并自动入队。

AI 文档动作：

- 总结。
- 改写。
- 继续写。
- 扩写。
- 上下文补齐。
- 重构。

关键 API：

- `POST /api/ai/workspace/document-completion`
- `POST /api/ai/workspace/document-completion/accept`
- `GET /api/projects/:id/resources/:resourceId/collab`
- `POST /api/projects/:id/resources/:resourceId/recycle-from-markdown`

关键实现：

- `app/components/editor/RichTextEditor.vue`
- `app/components/editor/rich-text-editor-inline-completion.ts`
- `shared/utils/collab-markdown-rich-text.ts`
- `shared/utils/workspace-chat-markdown.ts`
- `server/services/ai/workspace-inline-completion.ts`
- `server/utils/project-resource-document-store.ts`

## 5.6 流程画布

流程画布是 `resourceKind=draw + collabPurpose=workflow` 的 ProjectResource。

关键规则：

- 每个项目只能有一个 active workflow 画布。
- 固定 `flow` tab 与资源树中的 workflow 资源指向同一底层对象。
- 用户侧名称统一为 `流程画布`。

主要功能：

- 基于 draw.io embed 的流程图编辑。
- draw.io `autosave/save` 回传 XML。
- 前端解析 XML 为 `WorkflowSnapshot`。
- AI 可基于画布上下文生成、补全、续改、调样式。
- AI 改图必须先生成草案卡。
- 用户手动应用草案。
- apply 前校验 `baseWorkflowHash`，防止覆盖用户新修改。
- 单页 workflow 支持自动写回，多页资源可分析和预览但禁止自动写回。
- draw.io embed 宿主可通过 `WINLOOP_PUBLIC_DRAWIO_EMBED_BASE_URL` 配置。

关键 API：

- `POST /api/ai/canvas/stream`
- `POST /api/ai/workspace/stream`

关键实现：

- `WorkspaceFlowTab.vue`
- `WorkspaceDrawioCanvas.client.vue`
- `app/utils/workspace-drawio.ts`
- `server/services/ai/canvas-assist.ts`
- `server/services/ai/workspace-orchestrator.ts`

## 5.7 自由画布、设计画布与设备编排

自由画布：

- `resourceKind=draw + collabPurpose=freeform`。
- 用于临时结构发散、草图、讨论。
- 旧形态可使用 tldraw。

设计画布 / CanvasKit Host：

- 当前 `draw + freeform/design` 的设计能力已推进到新 Host。
- 支持基础图元：矩形、圆形、箭头、路径、文本。
- 支持文本创建后立即编辑、双击再编辑。
- 支持单选拖动、框选多选、resize、rotate。
- 支持 frame 选择、拖拽、resize、小地图、grid guides。
- 支持本地图片上传、assets 面板放置图片。
- 支持 group / ungroup、组内双击编辑。
- 支持元素吸附、参考线、8px 栅格吸附。
- 支持 Auto Layout 基础闭环。
- 支持图层顺序：上移、下移、置顶、置底。
- 导出沿用 Page / Frame 的 PNG / SVG 路径。

设备编排：

- 支持创建设备编排资源。
- 支持设备布局文档、锁定、更新。
- 支持 Mockup 设备模型目录。

关键 API：

- `GET /api/projects/:id/design-library/items`
- `GET /api/projects/:id/design-library/items/:itemId`
- `GET /api/projects/:id/design-library/items/:itemId/asset`
- `POST /api/projects/:id/design-library/templates/:templateId/create-resource`
- `GET /api/projects/:id/mockups/catalog`
- `POST /api/projects/:id/device-arrangements`
- `GET /api/projects/:id/device-arrangements/:resourceId`
- `PATCH /api/projects/:id/device-arrangements/:resourceId`
- `POST /api/projects/:id/device-arrangements/:resourceId/lock`
- `DELETE /api/projects/:id/device-arrangements/:resourceId/lock`
- `POST /api/projects/:id/resources/:resourceId/device-arrangement-migration`

关键实现：

- `WorkspaceDesignPanel.vue`
- `app/components/workspace/design/*`
- `WorkspaceDeviceArrangementPanel.vue`
- `WorkspaceDeviceArrangementCreateDialog.vue`
- `WorkspaceDeviceArrangementSidebar.vue`
- `app/utils/design-document.ts`
- `shared/utils/device-arrangement-document.ts`
- `server/utils/canvas-library-store.ts`
- `server/utils/mockup-device-store.ts`
- `server/utils/project-resource-device-arrangement-store.ts`

## 5.8 项目设置与竞赛绑定

主要功能：

- 编辑项目基本信息。
- 设置项目展示标识、图标、主题色。
- 绑定竞赛与赛道。
- 维护项目适配信息。
- 保存项目设置草稿。
- 查看当前竞赛绑定状态。
- 生成或刷新项目大纲。
- 管理项目知识索引状态。

关键 API：

- `GET /api/projects/:id/settings`
- `PATCH /api/projects/:id/settings`
- `GET /api/projects/:id/settings-draft`
- `PATCH /api/projects/:id/settings-draft`
- `DELETE /api/projects/:id/settings-draft`
- `PATCH /api/projects/:id/bindings`
- `PATCH /api/projects/:id/adaptations/:contestId`
- `GET /api/projects/:id/outline`
- `POST /api/projects/:id/outline/generate`

关键实现：

- `WorkspaceProjectSettingsTab.vue`
- `ProjectBasicSettingsEditor.vue`
- `ProjectIdentityThemeCard.vue`
- `ProjectDisplayPreviewCard.vue`
- `app/composables/useWorkspaceProjectSettings.ts`
- `app/composables/project-settings.ts`
- `server/services/project-outline.ts`
- `server/services/project-outline-generator.ts`
- `server/utils/project-outline-store.ts`

## 5.9 项目大纲

ProjectOutline 是派生视图，不是独立编辑对象。

输入：

- 项目设置。
- 资源内容。
- 流程画布摘要。
- 协作文档结构。
- 设计文档结构。

输出：

- 用于导航、定位、结构感知的树状节点。

不负责：

- 直接编辑资源内容。
- 代替流程画布。
- 代替协作文档或画布。

关键数据表：

- `project_outline_snapshots`

## 5.10 评论与批注

主要功能：

- 对资源发起评论线程。
- 支持文本选区锚点。
- 支持图片节点锚点。
- 评论回复。
- 解决线程。
- 重新打开线程。
- 右侧评论面板显示当前资源评论。

关键 API：

- `GET /api/projects/:id/resources/:resourceId/comments`
- `POST /api/projects/:id/resources/:resourceId/comments`
- `POST /api/projects/:id/resources/:resourceId/comments/:threadId/messages`
- `POST /api/projects/:id/resources/:resourceId/comments/:threadId/resolve`
- `POST /api/projects/:id/resources/:resourceId/comments/:threadId/reopen`

关键数据表：

- `project_resource_comment_threads`
- `project_resource_comment_messages`

## 5.11 成员管理

项目成员功能：

- 查看项目成员。
- 添加成员。
- 移除项目成员。
- 项目内角色：`owner / manager / editor / viewer`。
- 结合工作区成员和席位限制。

团队/工作区成员功能：

- 查看工作区成员。
- 邀请成员。
- 撤销邀请。
- 修改成员角色。
- 移除成员。
- 管理席位。

关键 API：

- `GET /api/projects/:id/members`
- `POST /api/projects/:id/members`
- `DELETE /api/projects/:id/members/:userId`
- `POST /api/projects/:id/invitations`
- `POST /api/projects/:id/invitations/:invitationId/revoke`
- `PATCH /api/projects/:id/seats`

关键实现：

- `WorkspaceMembersTab.vue`
- `WorkspaceInviteModal.vue`
- `WorkspaceSeatModal.vue`
- `server/utils/project-access-store.ts`
- `server/utils/team-membership-store.ts`

## 5.12 工作台显示偏好

主要功能：

- 字号预设：`xs / sm / md / lg / xl`。
- Tab 间距预设：`ultra_compact / compact / default / relaxed / spacious`。
- 左侧 sidebar 宽度。
- 右侧 sidebar 宽度。
- 用户默认值、团队默认值、工作区覆盖值合并。
- 展示每个偏好项来源。

关键 API：

- `GET /api/user/workspace-display-preferences`
- `PATCH /api/user/workspace-display-preferences`
- `GET /api/teams/:id/workspace-display-preferences`
- `PATCH /api/teams/:id/workspace-display-preferences/default`
- `PATCH /api/teams/:id/workspace-display-preferences/user`

关键实现：

- `UserSettingsDialog.vue`
- `useWorkspaceDisplayPreferences.ts`
- `shared/utils/workspace-layout.ts`
- `shared/utils/workspace-tab-layout.ts`
- `server/utils/workspace-display-preference-store.ts`

## 5.13 通知中心

主要功能：

- 工作台通知铃铛。
- 通知抽屉。
- 通知列表。
- 单条标记已读。
- 全部标记已读。
- 后台创建平台通知。
- 通知类别：平台、竞赛、协作。

关键 API：

- `GET /api/notifications`
- `POST /api/notifications/:id/read`
- `POST /api/notifications/read-all`
- `POST /api/admin/notifications`

关键实现：

- `NotificationBellButton.vue`
- `NotificationDrawer.vue`
- `NotificationListContent.vue`
- `useNotificationCenter.ts`
- `server/utils/notification-store.ts`

## 6. 项目 AI 功能

## 6.1 AI 运行时与个人设置

主要功能：

- 用户 AI runtime 查询。
- 用户可用模型列表。
- 用户 AI 设置读取和保存。
- 用户 AI 使用量查询。
- 平台侧按 channel/provider/model 统一配置。
- 支持模型能力识别、场景路由、fallback。

用户 API：

- `GET /api/user/ai/runtime`
- `GET /api/user/ai/models`
- `GET /api/user/ai/settings`
- `PATCH /api/user/ai/settings`
- `GET /api/teams/:id/ai/usage`

后台 API：

- `GET /api/admin/ai/providers`
- `PATCH /api/admin/ai/providers`
- `POST /api/admin/ai/providers/test`
- `GET /api/admin/ai/models`
- `GET /api/admin/ai/provider-models`
- `POST /api/admin/ai/provider-models`
- `GET /api/admin/ai/channels`
- `POST /api/admin/ai/channels/test`
- `POST /api/admin/ai/run`
- `POST /api/admin/ai/stream`
- `GET /api/admin/ai/logs`
- `GET /api/admin/ai/audits`

关键实现：

- `server/utils/platform-ai-channels.ts`
- `server/utils/platform-ai-client.ts`
- `server/utils/platform-ai-config-store.ts`
- `server/utils/user-ai-store.ts`
- `server/services/admin-ai/*`
- `app/pages/admin/ai-prompts.vue`
- `app/composables/useUserAi.ts`
- `app/composables/useUserAiUsage.ts`

## 6.2 工作台右侧 AI 助手

AI 模式：

- `dialog_ask`：对话问答。
- `loopy_page`：Loopy 数据页上下文。
- `contextual_agent`：上下文 Agent。
- `auto_optimize`：自动优化。
- `issue_discovery`：问题发现。
- `defense`：答辩。
- `document_assist`：文档辅助。

主要功能：

- 项目上下文问答。
- 当前资源上下文问答。
- 工作台 AI 流式响应。
- 工具调用进度展示。
- 知识引用和 warning 展示。
- AI 生成项目变更提案。
- 用户批准/拒绝 AI 提案。
- 将提案应用到文档、流程、场景或项目信息。
- 本地消息状态与服务端持久化会话同步。

关键 API：

- `POST /api/ai/workspace/stream`
- `POST /api/ai/project-chat`
- `GET /api/projects/:id/ai/changes`
- `POST /api/projects/:id/ai/changes/:changeId/approve`
- `POST /api/projects/:id/ai/changes/:changeId/reject`
- `GET /api/teams/:id/chat/sessions`
- `POST /api/teams/:id/chat/sessions`
- `GET /api/teams/:id/chat/sessions/:sessionId/messages`
- `POST /api/teams/:id/chat/sessions/:sessionId/messages`
- `DELETE /api/teams/:id/chat/sessions/:sessionId`

关键实现：

- `WorkspaceRightSidebar.vue`
- `WorkspaceAssistantMessageContent.vue`
- `WorkspaceChatMarkdown.vue`
- `WorkspaceChatMarkdownNode.vue`
- `app/composables/useWorkspaceProjectAi.ts`
- `shared/utils/workspace-ai-stream.ts`
- `shared/utils/workspace-chat-local-state.ts`
- `server/services/ai/workspace-orchestrator.ts`
- `server/services/ai/project-chat-chain.ts`
- `server/utils/chat-store.ts`
- `server/utils/project-ai-store.ts`

## 6.3 项目知识索引与 RAG

项目知识索引是项目内 RAG 的底座。

索引对象：

- 项目上传资源。
- Markdown 协作文档。
- 文档预览结果。
- 图片摘要/OCR 投影。
- Draw 摘要投影。
- 会议纪要。
- 会议转写。
- 竞赛资源绑定。

索引阶段：

- `pending`
- `queued`
- `extracting`
- `chunking`
- `embedding`
- `ready`
- `failed`
- `stale`
- `skipped`

任务阶段：

- `queued`
- `extracting`
- `chunking`
- `embedding`
- `finalizing`

能力：

- 项目级索引状态 dashboard。
- 单资源索引状态。
- 项目级重建索引。
- 单资源重建索引。
- 词法召回 + 向量召回。
- ready 优先，stale fallback。
- 引用结构化返回。
- warning：索引未完成时提示结果可能不完整。
- 多模态文本投影 V1：图片、OCR、会议、Draw。
- 知识关系图。
- 语义空间布局。
- 节点详情、邻居关系、pipeline log。

关键 API：

- `GET /api/projects/:id/knowledge/index-status`
- `POST /api/projects/:id/knowledge/reindex`
- `GET /api/projects/:id/knowledge/explorer`
- `GET /api/projects/:id/knowledge/relations`
- `GET /api/projects/:id/knowledge/semantic-layout`
- `GET /api/projects/:id/knowledge/node-detail`
- `GET /api/projects/:id/resources/:resourceId/knowledge/index-status`
- `POST /api/projects/:id/resources/:resourceId/knowledge/reindex`
- `GET /api/admin/resources/knowledge-worker`

关键实现：

- `WorkspaceLoopyDataTab.vue`
- `WorkspaceLoopyDataOverviewView.vue`
- `WorkspaceLoopyDataHealthView.vue`
- `WorkspaceLoopyDataRelationsView.client.vue`
- `WorkspaceLoopyDataSemanticSpace.client.vue`
- `WorkspaceLoopyDataStarfield.client.vue`
- `WorkspaceLoopyDataNodeDetail.vue`
- `WorkspaceLoopyDataWorkflowsView.vue`
- `app/composables/useWorkspaceProjectKnowledge.ts`
- `server/utils/project-knowledge-store.ts`
- `server/services/ai/project-knowledge-context.ts`
- `server/services/ai/project-knowledge-query-planner.ts`
- `server/services/ai/project-knowledge-evidence-context.ts`
- `server/services/knowledge-ai.ts`
- `server/services/knowledge-vision.ts`
- `server/plugins/project-knowledge-worker.ts`
- `server/plugins/project-knowledge-analytics-worker.ts`

## 6.4 竞赛筛选 AI

主要功能：

- 根据自然语言、专业、学科、等级、赛道类型等条件筛选竞赛。
- 返回推荐竞赛和解释。
- 支持工作台左侧竞赛分析模块。

关键 API：

- `POST /api/ai/contest-filter`

关键实现：

- `server/services/ai/contest-filter-chain.ts`
- `WorkspaceAnalysisPanel.vue`

## 6.5 选题助手与 Topic Board

主要功能：

- AI 生成选题建议。
- 管理 topic board。
- 根据项目、竞赛、资料上下文生成候选题目。
- 记录候选项状态、评分、引用。
- 支持 board patch。

关键 API：

- `POST /api/ai/topic-proposal`
- `GET /api/projects/:id/topic-boards`
- `POST /api/projects/:id/topic-boards/generate`
- `PATCH /api/projects/:id/topic-boards/:boardId`

关键数据表：

- `project_topic_boards`
- `project_topic_candidates`

关键实现：

- `server/services/ai/topic-board-logic.ts`
- `server/services/ai/topic-proposal-chain.ts`
- `server/services/ai/topic-proposal-service.ts`
- `server/utils/project-topic-board-store.ts`

## 6.6 Intelligence Workflow v1

入口：

- 工作台 `Loopy 数据 -> 智能工作流`

目标：

- 保存项目内 workflow 定义。
- 运行线性步骤。
- 记录 run 与 step 历史。
- 对写操作暂停等待审批。
- 审批完成后继续执行。

步骤类型：

- `prompt`
- `tool`
- `agent`

上下文源：

- `project.settings`
- `project.outline`
- `project.resources`
- `project.knowledge`
- `resource.selection`
- `session.memory`

内置工具：

- `context.get_workspace_context`
- `web.search`
- `web.fetch_page`
- `project.propose_change`

Provider bridge：

- `provider.feishu_bitable_run`
- `provider.coze_workflow_run`

运行状态：

- `pending`
- `running`
- `completed`
- `failed`
- `needs_review`

关键 API：

- `GET /api/projects/:id/intelligence/workflows`
- `POST /api/projects/:id/intelligence/workflows`
- `GET /api/projects/:id/intelligence/workflows/:workflowId`
- `DELETE /api/projects/:id/intelligence/workflows/:workflowId`
- `POST /api/projects/:id/intelligence/workflows/:workflowId/run`
- `GET /api/projects/:id/intelligence/workflow-runs`
- `GET /api/projects/:id/intelligence/workflow-runs/:runId`
- `POST /api/projects/:id/intelligence/workflow-runs/:runId/continue`

关键实现：

- `app/composables/useProjectIntelligenceWorkflows.ts`
- `server/services/ai/intelligence-workflow-definition.ts`
- `server/services/ai/intelligence-workflow-engine.ts`
- `server/services/ai/intelligence-workflow-context.ts`
- `server/services/ai/intelligence-tool-registry.ts`
- `server/services/ai/intelligence-project-guard.ts`
- `server/utils/project-intelligence-workflow-store.ts`

## 6.7 AI 改动提案审批

主要功能：

- AI 不直接静默写入关键项目内容。
- 写操作产出 `ai_project_change_requests`。
- 用户可批准或拒绝。
- workflow run 在需要审批时进入 `needs_review`。
- 所有关联提案处理完后继续执行 run。

支持变更类型包括：

- 项目信息。
- 文档草案。
- 流程草案。
- 场景草案。
- Issue 草案。

关键 API：

- `GET /api/projects/:id/ai/changes`
- `POST /api/projects/:id/ai/changes/:changeId/approve`
- `POST /api/projects/:id/ai/changes/:changeId/reject`

关键数据表：

- `ai_project_change_requests`

## 7. 项目会议与答辩

## 7.1 项目会议

页面入口：

- 工作台会议模块。
- `/meeting/share/:shareKey`
- `/share/meetings/:shareKey`

会议模式：

- `audio`
- `video`

会议状态：

- `scheduled`
- `active`
- `ended`
- `failed`

主要功能：

- 创建音频/视频会议。
- 启动会议。
- 加入会议。
- 结束会议。
- LiveKit 站内 Web 客户端。
- 参与者管理。
- 实时字幕。
- 逐句稿。
- 会议 guest share。
- 会后纪要生成。
- 录制文件沉淀为项目资源。
- 会议纪要沉淀为 Markdown 协作资源。
- 会议任务队列。
- 会议运行时健康检查。

RTC/ASR 配置：

- 后台 `/admin/meeting-providers` 是唯一配置入口。
- RTC 当前以 LiveKit 为真实媒体实现。
- ASR 支持 `http` bridge 和 `openai-compatible`。
- 密钥使用 `WINLOOP_CONFIG_MASTER_KEY` 加密。

关键 API：

- `GET /api/projects/:id/meetings`
- `POST /api/projects/:id/meetings`
- `GET /api/projects/:id/meetings/:meetingId`
- `POST /api/projects/:id/meetings/:meetingId/start`
- `POST /api/projects/:id/meetings/:meetingId/join`
- `POST /api/projects/:id/meetings/:meetingId/end`
- `GET /api/projects/:id/meetings/:meetingId/utterances`
- `GET /api/projects/:id/meetings/:meetingId/guest-share`
- `POST /api/projects/:id/meetings/:meetingId/guest-share`
- `DELETE /api/projects/:id/meetings/:meetingId/guest-share`
- `GET /api/share/meetings/:shareKey`
- `POST /api/share/meetings/:shareKey/join`
- `POST /api/meetings/:meetingId/captions/frame`
- `POST /api/internal/meetings/asr-events`
- `POST /api/internal/meetings/provider-events`

关键实现：

- `WorkspaceMeetingPanel.vue`
- `WorkspaceMeetingOverviewPanel.vue`
- `WorkspaceMeetingCreatePanel.vue`
- `WorkspaceMeetingSidebarPanel.vue`
- `ProjectMeetingWebClient.vue`
- `app/composables/useWorkspaceProjectMeetings.ts`
- `server/services/meeting/project-meeting.ts`
- `server/services/meeting/meeting-runtime.ts`
- `server/services/meeting/rtc-provider.ts`
- `server/services/meeting/asr-gateway.ts`
- `server/services/meeting/meeting-summary.ts`
- `server/services/meeting/meeting-artifacts.ts`
- `server/utils/project-meeting-store.ts`
- `server/plugins/project-meeting-job-worker.ts`

## 7.2 答辩 AI 与答辩工作台

答辩能力分两类：

- 文本答辩 AI。
- 实时音视频 sidecar。

答辩对象：

- 答辩 persona。
- 评委角色：技术、商业、表达、自定义。
- 答辩阶段：opening、qa、rebuttal、closing。
- 答辩 turn。
- 答辩 scorecard。
- 答辩 summary。
- 实时 session meta。

主要功能：

- 导入答辩 persona preset。
- 创建/更新/删除项目答辩 persona。
- 发起答辩 session。
- 流式问答。
- 记录评委回合。
- 生成 turn/session summary。
- 答辩实时 Provider bootstrap。
- 支持 Qwen 和 Coze 实时 Provider。
- 记录实时事件。
- Qwen relay。

关键 API：

- `POST /api/ai/defense/stream`
- `GET /api/projects/:id/defense/personas`
- `POST /api/projects/:id/defense/personas`
- `PATCH /api/projects/:id/defense/personas/:personaId`
- `DELETE /api/projects/:id/defense/personas/:personaId`
- `POST /api/projects/:id/defense/personas/import`
- `GET /api/projects/:id/defense/sessions/:sessionId`
- `GET /api/projects/:id/defense/sessions/:sessionId/summary`
- `POST /api/projects/:id/defense/sessions/:sessionId/summary`
- `POST /api/projects/:id/defense/realtime-sessions`
- `GET /api/projects/:id/defense/realtime-sessions/:sessionId`
- `POST /api/projects/:id/defense/realtime-sessions/:sessionId/bootstrap`
- `POST /api/projects/:id/defense/realtime-sessions/:sessionId/events`
- `GET /api/projects/:id/defense/realtime-sessions/:sessionId/qwen-relay`

关键实现：

- `WorkspaceDefenseWorkbench.vue`
- `WorkspaceDefenseSidebar.vue`
- `app/utils/defense-realtime-bridge.ts`
- `app/utils/defense-realtime-media-controller.ts`
- `server/services/ai/defense-chain.ts`
- `server/services/ai/defense-context.ts`
- `server/services/ai/defense-summary.ts`
- `server/services/ai/defense-summary-notes.ts`
- `server/utils/project-defense-store.ts`
- `server/utils/defense-persona-preset-store.ts`
- `server/utils/defense-realtime.ts`

关键数据表：

- `defense_persona_presets`
- `project_defense_personas`
- `project_defense_session_state`
- `project_defense_turns`
- `project_defense_summaries`

## 7.3 终审工作台

当前终审模式 `final_review` 已有独立工作台壳：

- 终审工作区。
- 终审资料抽屉。
- 终审助手抽屉。
- 不复用研发主区 tabs。
- 可展示项目资料、问题、AI 辅助内容。

关键实现：

- `WorkspaceFinalReviewWorkbench.vue`
- `WorkspaceFinalReviewSidebar.vue`
- `WorkspaceFinalReviewMaterialsDrawer.vue`

## 8. 项目交付、Issue 与竞赛闭环

## 8.1 Issue 中心

主要功能：

- 项目问题清单。
- 寻疑报告。
- Issue 严重级别：critical、high、medium、low。
- Issue 状态：open、in_progress、resolved、ignored。
- 提交报告。
- 导出报告。
- AI 发现问题并生成草案。

关键 API：

- `GET /api/projects/:id/issues`
- `POST /api/projects/:id/issues/:reportId/submit`
- `GET /api/projects/:id/issues/:reportId/export`

关键数据表：

- `project_issue_reports`
- `project_issues`

## 8.2 项目竞赛闭环

主要功能：

- 项目竞赛循环快照。
- 风险信号。
- 项目任务。
- 刷新竞赛闭环数据。
- Loopy 数据页展示项目状态。

关键 API：

- `GET /api/projects/:id/competition-loop`
- `POST /api/projects/:id/competition-loop/refresh`

关键数据表：

- `project_competition_loop_snapshots`
- `project_risk_signals`
- `project_tasks`

关键实现：

- `app/composables/useProjectCompetitionLoop.ts`
- `server/utils/project-competition-loop-store.ts`

## 8.3 项目导出

主要功能：

- 生成竞赛提交 bundle。
- 支持导出 profile。
- 生成 PDF 报告。
- 生成 ZIP manifest。
- 导出任务持久化。
- 失败重试。
- 查看导出任务诊断。

关键 API：

- `POST /api/projects/:id/exports/contest-bundle`
- `GET /api/projects/:id/exports/jobs`
- `POST /api/projects/:id/exports/jobs/:jobId/retry`

关键实现：

- `server/services/project/project-contest-export.ts`
- `server/services/project/project-contest-export-job.ts`
- `server/services/project/project-export-pdf.ts`
- `server/utils/project-export-store.ts`

关键数据表：

- `project_export_jobs`

## 9. 管理后台功能

管理后台入口：

- `/admin`

后台总览模块包括：

- 用户管理。
- 赛事管理。
- 资料中心。
- 发布审批。
- 政策库。
- AI 配置。
- 运行监控。
- 系统设置。
- 存储服务。
- 通知管理。
- 集成中心。

后台权限类型：

- `platform_super_admin`
- `user_admin`
- `contest_admin`
- `pricing_admin`

平台权限：

- `contest.read_internal`
- `contest.write`
- `contest.publish`
- `contest.archive`
- `pricing.write`
- `user.read`
- `user.write`
- `user.status.write`
- `user.security.write`
- `role.assign`
- `role.super.assign`

## 9.1 用户与角色管理

页面入口：

- `/admin/users`
- `/admin/roles`
- `/admin/organizations`

主要功能：

- 用户列表。
- 用户详情。
- 创建用户。
- 更新用户资料。
- 启用/禁用用户。
- 生成 magic link。
- 上传/删除用户头像。
- 分配平台角色。
- 查看组织/工作区列表。
- 调整组织计费信息。

关键 API：

- `GET /api/admin/users`
- `POST /api/admin/users`
- `GET /api/admin/users/:id`
- `PATCH /api/admin/users/:id`
- `PATCH /api/admin/users/:id/status`
- `POST /api/admin/users/:id/magic-link`
- `POST /api/admin/users/:id/avatar`
- `DELETE /api/admin/users/:id/avatar`
- `GET /api/admin/platform-roles`
- `POST /api/admin/platform-roles`
- `GET /api/admin/organizations`
- `PATCH /api/admin/organizations/:id/billing`

关键实现：

- `server/utils/admin-user-store.ts`
- `server/utils/platform-store.ts`
- `server/utils/platform-access.ts`

## 9.2 赛事管理

页面入口：

- `/admin/contests`
- `/admin/contests/new`
- `/admin/contests/:id`
- `/admin/contests/:id/overview/edit`
- `/admin/contests/:id/tracks`
- `/admin/contests/:id/timelines`
- `/admin/contests/:id/track-timelines`
- `/admin/contests/:id/rubrics`
- `/admin/contests/:id/resources`
- `/admin/contests/:id/faq`
- `/admin/contests/:id/judge-guidelines`
- `/admin/contests/:id/ai-prompts`
- `/admin/contests/:id/audit`
- `/admin/contests/:id/knowledge`
- `/admin/contests/:id/releases`

主要功能：

- 竞赛创建、编辑、归档。
- 竞赛基础信息维护。
- 赛道创建、编辑。
- 竞赛时间线维护。
- 赛道时间线维护。
- Rubric 评分规则维护。
- FAQ 维护。
- 评委指南、赛道详解、提交样例等补充资料维护。
- 竞赛 AI prompt 资料维护。
- 资料新增、编辑、标注、文档解析、PDF/文档上传。
- 发布前检查。
- 发布。
- 竞赛发布审计。
- 竞赛资源知识治理。

关键 API：

- `GET /api/admin/contests`
- `POST /api/admin/contests`
- `GET /api/admin/contests/:id`
- `PATCH /api/admin/contests/:id`
- `POST /api/admin/contests/:id/archive`
- `GET /api/admin/contests/:id/publish-check`
- `POST /api/admin/contests/:id/publish`
- `GET /api/admin/contests/:id/audit`
- `GET /api/admin/contests/:id/tracks`
- `POST /api/admin/contests/:id/tracks`
- `PATCH /api/admin/contests/:id/tracks`
- `GET /api/admin/contests/:id/timelines`
- `POST /api/admin/contests/:id/timelines`
- `PATCH /api/admin/contests/:id/timelines`
- `GET /api/admin/contests/:id/track-timelines`
- `POST /api/admin/contests/:id/track-timelines`
- `PATCH /api/admin/contests/:id/track-timelines`
- `GET /api/admin/contests/:id/rubrics`
- `POST /api/admin/contests/:id/rubrics`
- `PATCH /api/admin/contests/:id/rubrics`
- `GET /api/admin/contests/:id/resources`
- `POST /api/admin/contests/:id/resources`
- `PATCH /api/admin/contests/:id/resources`
- `POST /api/admin/contests/:id/resources/document`
- `POST /api/admin/contests/:id/resources/pdf`
- `GET /api/admin/contests/:id/resources/:resourceId/document`

关键实现：

- `app/components/admin/forms/*`
- `app/components/admin/ContestWorkspaceTabs.vue`
- `server/utils/contest-store.ts`
- `server/utils/publish-rule-check.ts`
- `server/utils/release-contest-preservation.ts`

## 9.3 发布审批

页面入口：

- `/admin/releases/queue`
- `/admin/contests/:id/releases`
- `/admin/policies/releases`

主要功能：

- 发布版本队列。
- 版本详情。
- 一审/二审/发布。
- 认领二审。
- 拒绝。
- 从飞书刷新。
- 重置到一审。
- 轨道时间线修复。
- 审批日志。
- 队列统计、reviewer 统计、近期操作。

关键 API：

- `GET /api/admin/releases/queue`
- `POST /api/admin/releases/claim-second-review`
- `GET /api/admin/releases/:id`
- `POST /api/admin/releases/:id/approve`
- `POST /api/admin/releases/:id/reject`
- `POST /api/admin/releases/:id/publish`
- `POST /api/admin/releases/:id/refresh-from-feishu`
- `POST /api/admin/releases/:id/reset-to-first-review`
- `POST /api/admin/releases/:id/track-timelines`
- `GET /api/admin/contests/:id/releases`

关键实现：

- `AdminReleaseWorkbench.vue`
- `server/utils/release-store.ts`
- `server/utils/release-resource-metadata.ts`

## 9.4 资料治理与资源 worker

页面入口：

- `/admin/resources`
- `/admin/resource-preview-worker`
- `/admin/resource-knowledge-worker`
- `/admin/resource-recycle-worker`

主要功能：

- 后台资源列表。
- 标记资源无效。
- 文档重解析。
- 文档分析查看和修改。
- 预览 worker 状态。
- 知识索引 worker 状态。
- 回收 worker 状态。
- backlog、recent runs、错误、失败任务观察。

关键 API：

- `GET /api/admin/resources`
- `POST /api/admin/resources/:id/mark-invalid`
- `GET /api/admin/resources/preview-worker`
- `GET /api/admin/resources/knowledge-worker`
- `GET /api/admin/resources/recycle-worker`
- `POST /api/admin/documents/:documentId/reparse`
- `GET /api/admin/documents/:documentId/preview`
- `GET /api/admin/documents/:documentId/analysis`
- `PATCH /api/admin/documents/:documentId/analysis`
- `GET /api/admin/documents/tasks/:taskId`

关键 worker：

- `server/plugins/document-task-worker.ts`
- `server/plugins/project-document-preview-worker.ts`
- `server/plugins/project-knowledge-worker.ts`
- `server/plugins/project-resource-recycle-worker.ts`
- `server/plugins/resource-knowledge-worker.ts`

## 9.5 资源知识治理

功能对象是平台竞赛资料，不是项目资料。

主要功能：

- 资源 profile 分析。
- 分类、标签、质量分、价值分、热度分。
- 质量问题。
- 推荐/相似/重复/互补关系。
- 搜索需求洞察。
- 治理任务队列。
- 资源状态建议：健康、待审核、建议无效、建议归档。

关键 API：

- `GET /api/admin/contests/:id/knowledge`
- `GET /api/admin/contests/:id/knowledge/resources`
- `GET /api/admin/contests/:id/knowledge/resources/:resourceId`
- `PATCH /api/admin/contests/:id/knowledge/resources/:resourceId`
- `POST /api/admin/contests/:id/knowledge/resources/analyze`
- `GET /api/admin/contests/:id/knowledge/demand`
- `GET /api/admin/contests/:id/knowledge/governance/tasks`
- `POST /api/admin/contests/:id/knowledge/governance/tasks`

关键数据表：

- `contest_resource_profiles`
- `contest_resource_relations`
- `contest_resource_search_events`
- `contest_resource_governance_tasks`

## 9.6 飞书集成中心

页面入口：

- `/admin/integrations`
- `/admin/integrations/feishu`
- `/admin/integrations/feishu/bitables/:syncId`
- `/admin/integrations/feishu/data`
- `/admin/integrations/casdoor`
- `/admin/integrations/oauth`

飞书后台配置能力：

- 飞书应用配置。
- 飞书管理员搜索。
- 飞书用户、群组、目录同步。
- 飞书启动群搜索。
- 启动通知测试。
- 飞书 link issue 处理。
- 飞书 post sync task 查询和重试。
- 飞书同步数据查看。
- 飞书多维主库同步信息管理。

多维同步核心概念：

- 同步信息：一套飞书多维主库配置，对应 appToken。
- 同步项：某个子表如何同步到平台实体。
- 视图：限制同步记录范围。

同步项实体类型：

- `contest`
- `track`
- `track_timeline`
- `resource`
- `policy`
- `persona`
- `faq`

同步能力：

- URL 识别 appToken/tableId/viewId。
- 手动填写 appToken。
- 子表/视图选择。
- 字段概览。
- 自动字段猜测。
- 基础映射。
- 同步选项。
- 回填配置。
- 自动同步规则。
- 预检。
- 手动执行。
- 调度执行。
- 事件增量同步。
- 同步样本。
- 记录模拟。
- 清理预览与清理。
- 配置分享、配置包导出、配置导入预览/导入。
- 问题批量处理。

关键 API：

- `GET /api/admin/integrations/feishu/config`
- `PATCH /api/admin/integrations/feishu/config`
- `GET /api/admin/integrations/feishu/admin-overview`
- `GET /api/admin/integrations/feishu/admin-search`
- `GET /api/admin/integrations/feishu/admin-feishu-users`
- `POST /api/admin/integrations/feishu/admin-groups/reconcile`
- `POST /api/admin/integrations/feishu/admin-members/manual-add`
- `GET /api/admin/integrations/feishu/bitable-syncs`
- `POST /api/admin/integrations/feishu/bitable-syncs`
- `GET /api/admin/integrations/feishu/bitable-syncs/:id`
- `PATCH /api/admin/integrations/feishu/bitable-syncs/:id`
- `POST /api/admin/integrations/feishu/bitable-syncs/:id/run`
- `POST /api/admin/integrations/feishu/bitable-syncs/:id/archive`
- `POST /api/admin/integrations/feishu/bitable-syncs/:id/restore`
- `POST /api/admin/integrations/feishu/bitable-syncs/:id/config-share`
- `DELETE /api/admin/integrations/feishu/bitable-syncs/:id/config-share`
- `GET /api/admin/integrations/feishu/bitable-syncs/:id/config-package`
- `POST /api/admin/integrations/feishu/bitable-syncs/config-import/preview`
- `POST /api/admin/integrations/feishu/bitable-syncs/config-import/import`
- `GET /api/admin/integrations/feishu/bitable-syncs/:id/items/:itemId`
- `PATCH /api/admin/integrations/feishu/bitable-syncs/:id/items/:itemId`
- `POST /api/admin/integrations/feishu/bitable-syncs/:id/items/:itemId/preview`
- `POST /api/admin/integrations/feishu/bitable-syncs/:id/items/:itemId/run`
- `POST /api/admin/integrations/feishu/bitable-syncs/:id/items/:itemId/simulate-record`
- `POST /api/admin/integrations/feishu/bitable-syncs/:id/items/:itemId/validate-config`
- `POST /api/admin/integrations/feishu/bitable-syncs/:id/items/:itemId/cleanup-preview`
- `POST /api/admin/integrations/feishu/bitable-syncs/:id/items/:itemId/cleanup`
- `POST /api/admin/integrations/feishu/bitable-syncs/:id/items/:itemId/issues/batch-handle`
- `GET /api/admin/integrations/feishu/bitable/sources/search`
- `POST /api/admin/integrations/feishu/bitable/sources/resolve`
- `POST /api/admin/integrations/feishu/bitable/sources/table-preview`
- `POST /api/admin/integrations/feishu/bitable/sources/inspect-fields`
- `GET /api/admin/integrations/feishu/bitable/attachments/:fileToken`

关键实现：

- `AdminFeishuBitableSyncEditor.vue`
- `AdminFeishuDirectoryBrowser.vue`
- `server/services/feishu/*`
- `server/utils/feishu-bitable-source.ts`
- `server/utils/feishu-integration-store.ts`
- `server/utils/feishu-task-schedule.ts`
- `server/plugins/feishu-bitable-scheduler-worker.ts`
- `server/plugins/feishu-post-sync-worker.ts`
- `server/plugins/feishu-startup-notify.ts`

## 9.7 工作区飞书集成

除后台主库同步外，团队/工作区也支持飞书连接。

主要功能：

- 工作区飞书安装会话。
- 连接、更新、删除。
- claim 飞书连接。
- 查看审计。
- 成员同步预览和执行。
- 飞书目录搜索。
- 飞书外部资源搜索。
- 从飞书导入文档、wiki、云盘文件、多维表格为项目资源。

关键 API：

- `GET /api/teams/:id/integrations`
- `GET /api/teams/:id/integrations/feishu`
- `PATCH /api/teams/:id/integrations/feishu`
- `DELETE /api/teams/:id/integrations/feishu`
- `POST /api/teams/:id/integrations/feishu/install-session`
- `POST /api/teams/:id/integrations/feishu/claim`
- `GET /api/teams/:id/integrations/feishu/audits`
- `GET /api/teams/:id/integrations/feishu/directory/search`
- `GET /api/teams/:id/integrations/feishu/sources/search`
- `POST /api/teams/:id/integrations/feishu/member-sync/preview`
- `POST /api/teams/:id/integrations/feishu/member-sync/run`
- `POST /api/teams/:id/integrations/feishu/imports`
- `GET /api/teams/:id/integrations/feishu/imports/:jobId`
- `GET /api/feishu/bitable-sync-config/:shareKey`

关键数据表：

- `workspace_integration_connections`
- `workspace_integration_sync_policies`
- `workspace_integration_import_jobs`
- `workspace_integration_audit_logs`
- `workspace_external_resource_refs`
- `integration_event_dedup`

## 9.8 AI 配置后台

页面入口：

- `/admin/ai-prompts`

主要功能：

- Provider 管理。
- Provider 模型管理。
- 场景 channel 管理。
- 模型 capability 识别。
- 价格模型配置。
- 测试 provider。
- 测试 channel。
- 文本流式测试。
- ASR、TTS、Coze 语音、DashScope 等专项配置。
- NewAPI、OpenAI Compatible、百炼 DashScope、Coze 语音/Realtime、SearchXNG、Tavily 等 provider 族。

关键实现：

- `server/utils/platform-ai-channels.ts`
- `server/services/admin-ai/provider-models.ts`
- `server/services/admin-ai/provider-usage.ts`
- `server/services/admin-ai/orchestrator.ts`
- `server/services/admin-ai/dashscope-asr.ts`
- `server/services/admin-ai/dashscope-tts.ts`
- `server/services/admin-ai/coze-voice.ts`

## 9.9 会议 Provider 后台

页面入口：

- `/admin/meeting-providers`

主要功能：

- 配置 RTC Provider。
- 配置 ASR Provider。
- 配置 worker 参数。
- 配置监控地址。
- 密钥模式选择。
- 运行时连通性测试。
- 展示配置来源和配置缺口。

关键 API：

- `GET /api/admin/meeting/providers`
- `PATCH /api/admin/meeting/providers`
- `POST /api/admin/meeting/providers/test`

关键实现：

- `server/services/meeting/admin-provider-config.ts`
- `server/services/meeting/runtime-monitoring.ts`
- `server/utils/platform-meeting-config-store.ts`

## 9.10 存储服务后台

页面入口：

- `/admin/storage-service`

主要功能：

- 存储渠道池配置。
- 支持 local、S3、MinIO。
- 主渠道选择。
- accessKey/secretKey 加密保存。
- 渠道连通性测试。
- 存储使用概览。
- 渠道占比。
- 上传/下载趋势。
- 用户下载排行。
- 工作空间消耗。

关键 API：

- `GET /api/admin/storage-service`
- `PATCH /api/admin/storage-service`
- `POST /api/admin/storage-service/test`
- `POST /api/admin/runtime-settings/storage-test`

关键实现：

- `server/utils/storage-service-store.ts`
- `server/storage/*`

## 9.11 运行时设置与规则引擎

页面入口：

- `/admin/runtime-settings`
- `/admin/policies`
- `/admin/policies/releases`

主要功能：

- 运行时配置读取/更新。
- 配置缓存。
- 规则定义。
- 规则版本。
- 规则绑定。
- 规则模拟。
- 政策库。
- obligation 相关表结构已存在。

关键 API：

- `GET /api/admin/runtime-settings`
- `PATCH /api/admin/runtime-settings`
- `GET /api/admin/rules/definitions`
- `POST /api/admin/rules/definitions`
- `PATCH /api/admin/rules/definitions`
- `GET /api/admin/rules/versions`
- `POST /api/admin/rules/versions`
- `PATCH /api/admin/rules/versions`
- `GET /api/admin/rules/bindings`
- `POST /api/admin/rules/bindings`
- `PATCH /api/admin/rules/bindings`
- `POST /api/admin/rules/simulate`
- `GET /api/admin/policies`
- `GET /api/admin/policies/releases`

关键实现：

- `server/utils/platform-runtime-config-store.ts`
- `server/plugins/platform-runtime-config-cache.ts`
- `server/utils/rule-store.ts`
- `server/utils/rule-engine.ts`
- `server/utils/policy-store.ts`

## 9.12 计费后台

页面入口：

- `/admin/billing`

主要功能：

- 套餐列表。
- 新建/更新套餐。
- 计费事件聚合。
- 用量事件明细。
- 工作区套餐、席位、AI 配额。

关键 API：

- `GET /api/admin/billing/plans`
- `POST /api/admin/billing/plans`
- `PATCH /api/admin/billing/plans`
- `GET /api/admin/billing/usage-events`

关键数据表：

- `billing_plans`
- `billing_usage_events`
- `workspace_billing`
- `workspace_billing_orders`

## 9.13 运营分析后台

页面入口：

- `/admin/operations`

主要功能：

- 运营概览。
- 用户分析。
- 内容分析。
- 收入分析。
- 风险分析。
- 效率分析。
- 会议运行时分析。
- 报表 schema。
- 报表查询。
- 报表导出。
- AI 分析查询和运行。

关键 API：

- `GET /api/admin/operations/overview`
- `GET /api/admin/operations/users`
- `GET /api/admin/operations/content`
- `GET /api/admin/operations/revenue`
- `GET /api/admin/operations/risks`
- `GET /api/admin/operations/efficiency`
- `GET /api/admin/operations/meeting-runtime`
- `GET /api/admin/operations/reports/schema`
- `POST /api/admin/operations/reports/query`
- `POST /api/admin/operations/reports/export`
- `GET /api/admin/operations/ai-analysis`
- `POST /api/admin/operations/ai-analysis/run`

关键实现：

- `server/utils/admin-operations-store.ts`
- `server/services/admin-operations-ai-analysis.ts`

## 9.14 画布素材库与 Mockup 设备模型后台

页面入口：

- `/admin/canvas-library`
- `/admin/mockups`

主要功能：

- 画布模板/素材管理。
- 图片/SVG/设备壳 asset 上传。
- 从设计发布到素材库。
- 发布/归档素材。
- 查看素材版本。
- Mockup 设备模型管理。
- 设备变体管理。
- variant slot patch/delete。
- 设备模型发布/归档。

关键 API：

- `GET /api/admin/canvas-library/items`
- `POST /api/admin/canvas-library/items`
- `GET /api/admin/canvas-library/items/:itemId`
- `PATCH /api/admin/canvas-library/items/:itemId`
- `POST /api/admin/canvas-library/items/:itemId/publish`
- `POST /api/admin/canvas-library/items/:itemId/archive`
- `GET /api/admin/canvas-library/items/:itemId/asset`
- `POST /api/admin/canvas-library/assets/upload`
- `POST /api/admin/canvas-library/from-design`
- `GET /api/admin/mockups/models`
- `POST /api/admin/mockups/models`
- `GET /api/admin/mockups/models/:id`
- `PATCH /api/admin/mockups/models/:id`
- `POST /api/admin/mockups/models/:id/publish`
- `POST /api/admin/mockups/models/:id/archive`
- `PATCH /api/admin/mockups/models/:id/variants/:slotKey`
- `DELETE /api/admin/mockups/models/:id/variants/:slotKey`

## 9.15 Sentry 与健康检查

主要功能：

- Sentry Nuxt 接入。
- Sentry client/server 配置。
- staging smoke API。
- runtime/worker trace 诊断。
- source map 上传前置检查。

关键 API：

- `GET /api/health`
- `POST /api/admin/sentry/smoke`

关键实现：

- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `config/sentry.ts`
- `server/utils/sentry.ts`
- `scripts/sentry-doctor.mjs`

## 10. 实时与协作基础设施

## 10.1 WebSocket 实时通道

关键 API：

- `GET /api/realtime/ws`

支持事件范围：

- workspace。
- project。
- meeting。
- collab room。

支持能力：

- 注册 peer。
- 订阅 workspace/project/meeting。
- 加入/离开协作 room。
- presence 更新。
- room event 广播。
- workspace/project/meeting event 广播。
- 去重 remote event。
- 关闭 meeting guest peer。

关键实现：

- `server/utils/realtime-hub.ts`
- `server/utils/realtime-events.ts`
- `server/utils/realtime-access.ts`
- `server/plugins/realtime-pg-bus.ts`
- `app/composables/useWorkspaceRealtime.ts`
- `app/composables/useCollabSession.ts`

## 10.2 协作 Presence

主要功能：

- 协作文档/画布当前在线成员。
- 光标与选区状态。
- 用户头像、颜色、活动状态。
- Presence panel/dock/avatar stack。

关键实现：

- `app/components/workspace/collab/CollabPresenceAvatarStack.vue`
- `app/components/workspace/collab/CollabPresenceDock.vue`
- `app/components/workspace/collab/CollabPresencePanel.vue`
- `app/components/workspace/collab/presence.ts`

## 11. 后台 Worker 与异步任务

当前 server plugins 中的 worker：

| Worker | 文件 | 作用 |
| --- | --- | --- |
| 文档任务 worker | `server/plugins/document-task-worker.ts` | 处理竞赛资源文档解析任务 |
| 项目文档预览 worker | `server/plugins/project-document-preview-worker.ts` | 处理项目资源预览转换 |
| 项目知识索引 worker | `server/plugins/project-knowledge-worker.ts` | 处理项目知识 source/task/chunk |
| 项目知识分析 worker | `server/plugins/project-knowledge-analytics-worker.ts` | 关系、快照、语义空间等分析任务 |
| 资源知识 worker | `server/plugins/resource-knowledge-worker.ts` | 平台资料 profile/关系/治理 |
| 项目资源回收 worker | `server/plugins/project-resource-recycle-worker.ts` | 回收站到物理清理 |
| 项目会议 job worker | `server/plugins/project-meeting-job-worker.ts` | 会议转写收尾、纪要、录制入库 |
| 飞书多维调度 worker | `server/plugins/feishu-bitable-scheduler-worker.ts` | 飞书多维同步调度 |
| 飞书后置任务 worker | `server/plugins/feishu-post-sync-worker.ts` | embedding、搜索索引、实体分析、回填重试 |
| 飞书启动通知 | `server/plugins/feishu-startup-notify.ts` | 启动通知 |
| 运行时配置缓存 | `server/plugins/platform-runtime-config-cache.ts` | runtime settings 缓存 |
| PG 实时总线 | `server/plugins/realtime-pg-bus.ts` | PostgreSQL 事件总线与实时广播 |

## 12. 存储、文档转换与预览

支持能力：

- 上传资源落存储服务。
- 本地/S3/MinIO 渠道池。
- 项目资源访问 token。
- OnlyOffice 转换 Office 到 PDF。
- PDF layout/页面分析。
- 文档 AI 分析。
- 竞赛资源文档任务。
- 项目资源预览任务。
- 会议录制文件入库。

关键实现：

- `server/storage/*`
- `server/services/document/convert.ts`
- `server/services/document/onlyoffice-converter.ts`
- `server/services/document/pdf-layout.ts`
- `server/services/document/analysis.ts`
- `server/services/document/page-review.ts`
- `server/services/document/project-preview-token.ts`
- `server/services/document/project-resource-access-token.ts`
- `server/services/document/project-resource-review-runner.ts`
- `server/utils/document-store.ts`
- `server/utils/project-resource-document-store.ts`

## 13. 数据库表分域总览

### 13.1 用户、组织、权限

- `users`
- `sessions`
- `workspaces`
- `workspace_members`
- `groups`
- `group_permission_templates`
- `group_memberships`
- `platform_user_roles`
- `auth_identities`
- `invitations`
- `user_notifications`

### 13.2 项目与团队

- `projects`
- `project_members`
- `project_college_bindings`
- `project_advisor_bindings`
- `project_contest_bindings`
- `project_contest_adaptations`
- `project_settings_drafts`
- `project_workspace_view_states`
- `user_workspace_last_projects`
- `user_workspace_display_defaults`
- `workspace_display_defaults`
- `user_workspace_display_overrides`
- `user_project_workspace_ai_tabs`

### 13.3 竞赛与资源

- `contests`
- `contest_tracks`
- `contest_timelines`
- `contest_track_timelines`
- `contest_rubrics`
- `contest_resources`
- `contest_faq_items`
- `contest_resource_documents`
- `contest_resource_document_tasks`
- `contest_resource_profiles`
- `contest_resource_relations`
- `contest_resource_search_events`
- `contest_resource_governance_tasks`
- `contest_resource_favorites`

### 13.4 项目资源

- `project_resources`
- `project_resource_bindings`
- `project_resource_shares`
- `project_resource_documents`
- `project_resource_document_tasks`
- `project_resource_review_jobs`
- `project_resource_review_findings`
- `project_resource_collab_docs`
- `project_resource_device_arrangements`
- `project_resource_upload_sessions`
- `project_resource_upload_chunks`
- `project_resource_comment_threads`
- `project_resource_comment_messages`

### 13.5 项目知识索引

- `project_knowledge_sources`
- `project_knowledge_index_tasks`
- `project_knowledge_chunks`
- `project_knowledge_analytics_jobs`
- `project_knowledge_index_snapshots`
- `project_knowledge_relations`
- `project_knowledge_semantic_layouts`
- `project_knowledge_semantic_points`

### 13.6 AI 与工作流

- `ai_usage_ledger`
- `ai_chat_sessions`
- `ai_chat_messages`
- `ai_chat_session_context`
- `ai_deepagent_checkpoints`
- `ai_deepagent_store_items`
- `user_ai_settings`
- `user_ai_memories`
- `ai_project_change_requests`
- `ai_workflow_definitions`
- `ai_workflow_runs`
- `ai_workflow_run_steps`

### 13.7 会议与答辩

- `project_meetings`
- `project_meeting_participants`
- `project_meeting_invitees`
- `project_meeting_utterances`
- `project_meeting_jobs`
- `project_meeting_guest_shares`
- `defense_persona_presets`
- `project_defense_personas`
- `project_defense_session_state`
- `project_defense_turns`
- `project_defense_summaries`

### 13.8 飞书与外部集成

- `workspace_integration_connections`
- `workspace_integration_sync_policies`
- `workspace_integration_import_jobs`
- `workspace_integration_audit_logs`
- `workspace_external_resource_refs`
- `integration_event_dedup`
- `feishu_bitable_syncs`
- `feishu_bitable_sync_items`
- `feishu_bitable_sync_item_runs`
- `feishu_bitable_sync_run_samples`
- `feishu_bitable_sync_config_shares`
- `feishu_external_refs`
- `feishu_bitable_event_dedup`
- `feishu_post_sync_tasks`
- `feishu_vectors`
- `feishu_search_index`
- `feishu_entity_analysis`
- `feishu_sync_issues`

### 13.9 规则、政策、活动

- `activity_catalog`
- `activity_instances`
- `source_documents`
- `semantic_paths`
- `rule_versions`
- `rule_definitions`
- `rule_bindings`
- `obligation_definitions`
- `obligation_bindings`
- `rule_annotations`
- `policy_library_items`

### 13.10 交付、运营、计费

- `project_export_jobs`
- `project_issue_reports`
- `project_issues`
- `project_topic_boards`
- `project_topic_candidates`
- `project_competition_loop_snapshots`
- `project_risk_signals`
- `project_tasks`
- `analytics_events`
- `contest_trends`
- `release_versions`
- `release_review_logs`
- `billing_usage_events`
- `billing_plans`
- `workspace_billing`
- `workspace_billing_orders`
- `team_subscriptions`
- `team_quotas`
- `project_seat_quotas`

### 13.11 画布与 Mockup

- `canvas_library_items`
- `canvas_library_item_versions`
- `mockup_device_models`
- `mockup_device_variants`

### 13.12 迁移元数据

- `migrations_meta`

## 14. 主要 API 分组索引

### 14.1 公共 API

- `/api/health`
- `/api/pageview`
- `/api/auth/*`
- `/api/contests*`
- `/api/resources`
- `/api/dashboard/overview`
- `/api/analytics/*`
- `/api/billing/plans`
- `/api/invitations/:token/accept`
- `/api/share/resources/:shareKey`
- `/api/share/meetings/:shareKey`

### 14.2 项目 API

- `/api/projects`
- `/api/projects/quick`
- `/api/projects/batch`
- `/api/projects/:id`
- `/api/projects/:id/settings*`
- `/api/projects/:id/bindings`
- `/api/projects/:id/resources*`
- `/api/projects/:id/resource-upload-sessions*`
- `/api/projects/:id/knowledge*`
- `/api/projects/:id/ai/changes*`
- `/api/projects/:id/meetings*`
- `/api/projects/:id/defense*`
- `/api/projects/:id/intelligence*`
- `/api/projects/:id/issues*`
- `/api/projects/:id/topic-boards*`
- `/api/projects/:id/exports*`
- `/api/projects/:id/device-arrangements*`
- `/api/projects/:id/design-library*`
- `/api/projects/:id/mockups/catalog`
- `/api/projects/:id/view-state`

### 14.3 团队/工作区 API

- `/api/teams*`
- `/api/teams/:id/members*`
- `/api/teams/:id/invitations*`
- `/api/teams/:id/billing*`
- `/api/teams/:id/ai/usage`
- `/api/teams/:id/chat/sessions*`
- `/api/teams/:id/integrations*`
- `/api/teams/:id/workspace-display-preferences*`
- `/api/workspaces*`
- `/api/workspaces/:id/members*`
- `/api/workspaces/:id/invitations`
- `/api/workspaces/:id/billing*`
- `/api/workspaces/:id/chat/sessions*`

### 14.4 AI API

- `/api/ai/contest-filter`
- `/api/ai/project-chat`
- `/api/ai/topic-proposal`
- `/api/ai/workspace/stream`
- `/api/ai/workspace/document-completion`
- `/api/ai/workspace/document-completion/accept`
- `/api/ai/canvas/stream`
- `/api/ai/defense/stream`

### 14.5 管理 API

- `/api/admin/users*`
- `/api/admin/platform-roles*`
- `/api/admin/organizations*`
- `/api/admin/contests*`
- `/api/admin/releases*`
- `/api/admin/resources*`
- `/api/admin/documents*`
- `/api/admin/integrations*`
- `/api/admin/ai*`
- `/api/admin/meeting/providers*`
- `/api/admin/storage-service*`
- `/api/admin/runtime-settings*`
- `/api/admin/rules*`
- `/api/admin/billing*`
- `/api/admin/operations*`
- `/api/admin/notifications`
- `/api/admin/canvas-library*`
- `/api/admin/mockups*`
- `/api/admin/policies*`
- `/api/admin/sentry/smoke`

### 14.6 内部与 Webhook API

- `/api/realtime/ws`
- `/api/integrations/feishu/events`
- `/api/internal/meetings/asr-events`
- `/api/internal/meetings/provider-events`
- `/api/internal/project-documents/:documentId/source`

## 15. 脚本、测试与部署

### 15.1 常用脚本

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 开发启动 |
| `pnpm dev:pwa` | PWA 开发启动 |
| `pnpm build` | Nuxt 构建 |
| `pnpm preview` | Nuxt preview |
| `pnpm start` | 生产输出启动 |
| `pnpm db:migrate` | 执行 SQL 迁移 |
| `pnpm lint` | ESLint |
| `pnpm test` | 单元测试 |
| `pnpm test:unit` | Vitest coverage |
| `pnpm test:smoke` | build + smoke |
| `pnpm test:e2e` | 项目端 e2e smoke |
| `pnpm smoke:feishu-diagnostics` | 飞书诊断 smoke |
| `pnpm smoke:defense-meeting-ai` | 答辩会议 AI smoke |
| `pnpm meeting:asr:dev` | 本地 ASR dev bridge |
| `pnpm sentry:doctor` | Sentry 就绪检查 |
| `pnpm contest:seed:catalog` | 竞赛资料种子 |
| `pnpm contest:clean:catalog` | 清理竞赛资料种子 |
| `pnpm worktrees:list/status/run` | sibling worktree 批处理 |

### 15.2 测试覆盖方向

`scripts/tests` 下覆盖较广，重点方向包括：

- 登录、注册、OAuth、头像、外部绑定。
- Team-first API、项目可见性、成员邀请、席位。
- 工作台结构、左右侧栏、资源 tab、显示偏好。
- 协作文档、富文本、Markdown、评论、presence。
- 流程画布、draw.io utils、画布 AI、设计画布。
- 项目资源上传、预览、分享、回收、知识索引。
- 项目知识 RAG、引用、关系、语义空间。
- AI 会话持久化、workspace AI stream、inline completion、workflow v1。
- 飞书多维同步、字段猜测、手动执行、自动同步、清理、样本、配置分享。
- 会议 Provider、ASR、字幕、录制、纪要、答辩实时。
- 后台用户、计费、AI Provider、存储服务、运营 API。
- Sentry smoke、Jenkins deploy notify。

### 15.3 部署与运维

部署相关目录：

- `Dockerfile`
- `netlify.toml`
- `deploy/jenkins/*`
- `deploy/1panel/*`

运维能力：

- Jenkins pipeline。
- 1Panel webhook/cron 部署脚本。
- Sentry doctor。
- 资源 preview/knowledge/recycle worker 后台观测。
- 会议运行时配置与 smoke。
- 飞书同步调度与诊断。
- 数据库迁移脚本。

## 16. 当前已知边界与注意事项

### 16.1 旧入口与命名兼容

- `/workspace/:workspaceId/project/:projectId` 已返回 404。
- 当前主入口是 `/team/:teamId/project/:projectId`。
- 代码中仍有 Workspace 命名，这是历史模型和当前 Team-first 页面并存的结果。

### 16.2 项目知识索引边界

- 当前多模态检索 V1 仍以文本投影优先，不是原生图搜图、音搜音、视频帧向量检索。
- citation 可打开资源，但具体页码/章节定位仍有深化空间。
- stale 资料只作为 fallback。
- 真实上传到真实 worker 到真实 AI 命中的端到端回归仍可继续加强。

### 16.3 Intelligence Workflow 边界

- v1 只支持线性 workflow。
- 暂不支持 DAG、条件分支编辑器、cron。
- provider bridge 当前只覆盖飞书多维和 Coze workflow。
- document/workflow/scene 类草案主要仍由工作台单轮 agent 闭环承接。

### 16.4 会议边界

- 真实字幕取决于 ASR provider 配置。
- `http` bridge 只保证协议链路，不天然生成字幕。
- `openai-compatible` 需要后台 AI 场景 `meeting_asr` 可用。
- 会议业务配置来自后台，不再从 env 读取 RTC/ASR 默认值。

### 16.5 设计画布边界

- 当前仍以 frame 内编辑为主。
- Auto Layout frame 内关闭自由拖动、absolute resize、rotate。
- group 暂不支持 resize/rotate。
- path 未进入节点级编辑。
- 暂未纳入布尔运算、组件/variant、富文本、图片裁切等能力。

### 16.6 安全与配置

- 敏感运行时配置依赖 `WINLOOP_CONFIG_MASTER_KEY` 加密。
- 后台权限需按 platform role 控制。
- 生产环境 Sentry、AI、会议、存储、tldraw license 都需要按部署环境补齐。

## 17. 后续文档建议

当前这份文档偏“功能全景”。为了保持 KISS 和 DRY，建议后续不要把所有细节继续堆到本文里，而是分层维护：

- 本文：功能地图、入口、关键 API、关键实现。
- `docs/workspace-information-architecture.md`：工作台信息架构。
- `docs/collab-resource-model.md`：协作资源规则。
- `docs/project-knowledge-rag-progress.md`：知识索引与 RAG 进度。
- `docs/intelligence-workflow-v1.md`：智能工作流。
- `docs/meeting-runtime-setup.md`：会议真实链路。
- `docs/feishu-bitable-sync-guide.md`：飞书多维配置教程。
- `docs/competition-tech-pack/*`：比赛提交/技术白皮书材料。

## 18. 一句话总结

WinLoop 当前是一套以 `Workspace/Team -> Project -> ProjectResource` 为主模型的竞赛项目协作平台；用户侧围绕选赛、建项、资料、协作、AI、会议、答辩、导出形成闭环，后台侧围绕竞赛库、资源治理、飞书同步、AI/会议/存储运行时、发布审批、计费和运维观测提供完整运营支撑。

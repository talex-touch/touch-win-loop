# Touch WinLoop

WinLoop AI（赛帮帮）当前是一套面向竞赛团队的项目工作台，核心链路是：

`选赛 -> 建项 -> 沉淀项目资源 -> 协作梳理 -> 提交与答辩准备`

当前仓库已经不再只是早期骨架，而是围绕 `Workspace / Project / Resource / Collab` 这套模型持续演进。

当前项目知识索引、embeddings / RAG、引用渲染与 worker 观测的阶段性进度见：

- [项目知识索引与 RAG 落地进度](./docs/project-knowledge-rag-progress.md)

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
- `协作文档` 在编辑时支持 AI 上下文补齐：系统会基于当前光标附近内容自动预测后续文本，用户按 `Tab` 接受当前建议。
- AI 补齐按“接受一次建议记一次消耗”计费，当前暂定每次接受消耗 `0.1 credits`。

## 当前页面入口

- `/team/:teamId/project/:projectId`：研发工作台主界面
- `/workspace/:workspaceId/project/:projectId`：工作区项目页别名入口
- `/admin/integrations/feishu`：飞书集成中心

## 开发启动

```bash
pnpm install
pnpm dev
```

开发态地址由 `.env.dev` 或当前 shell 中的以下变量驱动：

```bash
WINLOOP_DEV_HOST=127.0.0.1
WINLOOP_DEV_PORT=3510
```

本地推荐开发地址：

- `http://127.0.0.1:3510`

说明：

- `pnpm dev` 与 `pnpm dev:pwa` 都会先校验 `WINLOOP_DEV_HOST` / `WINLOOP_DEV_PORT`，缺失时直接失败，不再静默回退到 `3000`。
- `test:smoke` / `test:e2e` 属于测试链路，会使用独立测试端口，不参与开发态 `3510` 约束。

## Sibling Worktree 批处理

当前仓库会配套一组同级目录下的 PR / recovery worktree，例如：

- `touch-win-loop-pr2`
- `touch-win-loop-pr3`
- `touch-win-loop-recovery`

为了避免逐个切目录处理，可以直接用内置脚本批量查看和执行命令：

```bash
pnpm worktrees:list
pnpm worktrees:status
pnpm worktrees:run -- pnpm lint
pnpm worktrees:run -- --name pr2,pr5 pnpm test:unit
pnpm worktrees:list -- --include-current
```

约定说明：

- 默认只处理“当前仓库同级目录下、同名前缀”的 sibling worktree，不包含当前仓库。
- `--name` 支持短名、目录名和分支名，例如 `pr2`、`touch-win-loop-pr2`、`pr2-sync`。
- 如果希望把当前仓库也纳入同一批处理，显式传入 `--include-current`。

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
- `WINLOOP_PUBLIC_DRAWIO_EMBED_BASE_URL` 为可选项；留空时默认使用 `https://embed.diagrams.net`，若部署环境需要走内网或自托管 draw.io，请显式配置为可访问的 embed 宿主绝对地址。
- Sentry 为可选能力；未配置 `WINLOOP_SENTRY_DSN` / `WINLOOP_SENTRY_ENVIRONMENT` 时应用仍可正常运行，只是不启用错误上报。
- 如果生产环境启用了 `tldraw` 自由画布，请配置 `WINLOOP_TLDRAW_LICENSE_KEY`；`tldraw` 4.x 在生产 HTTPS 非 localhost 部署下没有有效 license key 会拒绝工作。

## 流程画布 workflow smoke

流程画布的 `draw.io iframe -> autosave/save -> workflowSnapshot -> AgentProto 草案 -> apply` 主链路已经接入 Playwright smoke。
建议在提交这条链路相关改动前，至少按下面顺序做一轮回归：

```bash
pnpm exec vue-tsc --noEmit

pnpm exec vitest run \
  "scripts/tests/workspace-drawio-utils.test.mjs" \
  "scripts/tests/workspace-ai-orchestrator.test.mjs" \
  "scripts/tests/workspace-right-sidebar-ui.test.mjs" \
  "scripts/tests/workflow-canvas-concept.test.mjs"
```

如需执行完整浏览器 smoke：

```bash
WINLOOP_PG_URL=postgresql://user:password@127.0.0.1:5432/winloop \
pnpm run ci:e2e-smoke
```

执行前提：

- 必须显式提供可写的 `WINLOOP_PG_URL`；`ci:e2e-smoke` 不会自动兜底。
- 如本机已经装好 Playwright Chromium，可追加 `E2E_SKIP_PLAYWRIGHT_INSTALL=1` 跳过浏览器安装。
- 如果当前环境没有直接使用 `https://embed.diagrams.net`，执行 smoke 时也要带上 `WINLOOP_PUBLIC_DRAWIO_EMBED_BASE_URL`，让应用和测试夹具指向同一个 draw.io embed 宿主。

示例：

```bash
WINLOOP_PG_URL=postgresql://user:password@127.0.0.1:5432/winloop \
WINLOOP_PUBLIC_DRAWIO_EMBED_BASE_URL=https://drawio.internal/embed/index.html \
E2E_SKIP_PLAYWRIGHT_INSTALL=1 \
pnpm run ci:e2e-smoke
```

如果要检查当前仓库 / Shell 的 Sentry 就绪状态，可执行：

```bash
pnpm run sentry:doctor --mode production
```

输出会区分：

- 代码接入是否完整
- 运行期上报是否具备前置条件
- source map 上传所需的构建期变量是否齐全

如果要做 staging 验收，可在满足以下前提后使用内部 smoke 接口：

- `WINLOOP_SENTRY_ENVIRONMENT=staging`
- 已配置 `WINLOOP_SENTRY_DSN`
- 当前登录用户具备 `contest.read_internal`

```bash
curl -X POST "https://<staging-host>/api/admin/sentry/smoke" \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  --data '{"target":"nitro"}' \
  -i

curl -X POST "https://<staging-host>/api/admin/sentry/smoke" \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  --data '{"target":"worker"}'
```

预期结果：

- `target=nitro`：返回 `500`，响应头里带 `x-trace-id`
- `target=worker`：返回 `200`，返回体里带 `traceId` / `release` / `environment`
- 若返回 `404`：说明当前不是 `staging`
- 若返回 `412`：说明 Sentry SDK 还没初始化，通常是 `WINLOOP_SENTRY_DSN` 或 `WINLOOP_SENTRY_ENVIRONMENT` 未生效

更完整的部署与验收说明见：

- [Jenkins 部署说明](./deploy/jenkins/README.zh-CN.md)

## 数据库迁移

当前应用在启动阶段会尝试补齐部分 schema，但它不应该成为唯一的迁移入口。
对于已经在线上运行的环境，建议显式执行 SQL 迁移，再发布依赖新 schema 的镜像。

示例：

```bash
pnpm db:migrate:project-resource-tree
```

通用用法：

```bash
pnpm db:migrate ./scripts/migrations/<your-migration>.sql
```

如需重复执行幂等迁移，可追加 `--force`；如不希望写入 `migrations_meta`，可追加 `--no-mark`。

## 会议能力配置

会议运行时配置已经改为后台维护，不再从应用环境变量直接读取 `RTC / ASR / worker` 参数，也不再默认回退 `mock`。

当前约束：

- `RTC`、`ASR`、`worker` 统一在后台页面 `/admin/meeting-providers` 配置。
- 当后台配置缺失时，前端会直接禁用“发起会议 / 启动会议 / 加入会议”，并显示明确问题。
- 应用环境变量里只保留 `WINLOOP_CONFIG_MASTER_KEY` 作为会议密钥加密根密钥。
- 本地联调真实链路时，使用 [deploy/meeting/README.zh-CN.md](./deploy/meeting/README.zh-CN.md) 和 [docs/meeting-runtime-setup.md](./docs/meeting-runtime-setup.md) 提供的 LiveKit / ASR bring-up 方案。

当前会议建模：

- `RTC` 负责房间、入会 token、录制与 webhook。
- `ASR` 负责实时字幕输入；partial 只广播，final 才会落库。
- `worker` 负责会后录制入库、纪要生成和失败重试。
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

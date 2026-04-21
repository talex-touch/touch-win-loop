# Intelligence Workflow v1

更新时间：2026-04-22

## 目标

在 `touch-win-loop` 项目工作台内补一条可重复运行的 Intelligence 主链：

- 保存项目内 workflow 定义
- 运行线性 `prompt / tool / agent` 步骤
- 记录 run 与 step 历史
- 对需要审批的写操作暂停
- 在审批完成后继续执行

这一版明确是 `touch-win-loop` 适配方案，不照搬桌面端 `clipboard / foreground app / secure-store` 语义。

## 挂载位置

- 工作台入口：`Loopy 数据 -> 智能工作流`
- 服务端入口：
  - `GET /api/projects/:id/intelligence/workflows`
  - `POST /api/projects/:id/intelligence/workflows`
  - `GET /api/projects/:id/intelligence/workflows/:workflowId`
  - `DELETE /api/projects/:id/intelligence/workflows/:workflowId`
  - `POST /api/projects/:id/intelligence/workflows/:workflowId/run`
  - `GET /api/projects/:id/intelligence/workflow-runs`
  - `GET /api/projects/:id/intelligence/workflow-runs/:runId`
  - `POST /api/projects/:id/intelligence/workflow-runs/:runId/continue`

## 数据模型

当前 v1 按 `PostgreSQL + JSONB` 落三张表：

- `ai_workflow_definitions`
  - 存项目级 workflow 定义
  - `definition_json` 内含 `trigger / contextSources / toolAllowlist / steps`
- `ai_workflow_runs`
  - 存每次 workflow run 的触发信息、definition snapshot 和 runtime state
- `ai_workflow_run_steps`
  - 存每个 step 的状态、输入、输出、review context

运行状态统一为：

- `pending`
- `running`
- `completed`
- `failed`
- `needs_review`

step 额外支持：

- `skipped`

## 上下文源

v1 只做项目内上下文：

- `project.settings`
- `project.outline`
- `project.resources`
- `project.knowledge`
- `resource.selection`
- `session.memory`

其中 `resource.selection` 用来替代原始桌面方案里的 `clipboard.batch` 位置，语义改为“当前项目中用户显式选中的资源集”。

## 工具层

当前先抽成统一 workflow tool registry，并保留 `executeWorkspaceAi()` 作为 agent step 执行内核。

### builtin

- `context.get_workspace_context`
- `web.search`
- `web.fetch_page`
- `project.propose_change`

### provider bridge

- `provider.feishu_bitable_run`
- `provider.coze_workflow_run`

当前先做 provider bridge，不直接上 MCP。这样可以先把项目内 workflow 跑起来，而不是先把大量时间花在第三方工具配置壳上。

## 审批与恢复

写操作仍沿用现有 `ai_project_change_requests`：

- tool step 或 agent step 如果产出项目变更提案，会创建 change request
- 对应 step 标记为 `needs_review`
- run 同步进入 `needs_review`
- 用户审批完成后调用 `continue`
- 若任一关联提案被拒绝，run 直接失败，不做隐式跳过

当前 workflow 面板内已经支持：

- 查看关联 change request 状态
- 对 pending 提案执行批准 / 拒绝
- 在所有提案都完成处理后继续执行 run

## 默认模板

首个内置模板为：

- `整理当前项目资源`

默认行为：

- 读取当前选中资源
- 融合项目设置、大纲与知识索引摘要
- 输出资源分组、索引状态、资料缺口与下一步草案建议
- 涉及写操作时只生成提案，不做静默写入

## 当前限制

- 只支持线性 workflow，不做 DAG / 条件分支编辑器 / cron
- `document / workflow / scene` 类草案仍以现有工作台单轮 agent 交互为主，尚未在 workflow v1 中补齐统一审批 apply 闭环
- provider bridge 先只覆盖现有 provider runner，不包含通用 MCP client / credential UI
- run 历史以项目工作台内的操作闭环为目标，暂不做独立全局页

## 验证建议

建议至少执行：

```bash
pnpm exec tsc --noEmit --pretty false
pnpm exec vue-tsc --noEmit
pnpm exec vitest run "scripts/tests/intelligence-workflow-v1.test.mjs"
```

如果改动同时影响工作台主链，也建议回归：

```bash
pnpm exec vitest run \
  "scripts/tests/ai-session-persistence.test.mjs" \
  "scripts/tests/workspace-right-sidebar-ui.test.mjs"
```

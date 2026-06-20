# 工作空间级飞书第三方平台验收记录

日期：2026-04-30

## 改动边界

本批只把工作空间级飞书能力收口到准生产可验收状态，不扩展消息、会议、日历或新 provider。

飞书第三方平台组：

- 工作空间连接、商店应用 token、tenant token 健康诊断与审计日志。
- 项目资源管理器“从飞书导入”，导入资源保持 `source: 'external'`。
- 成员同步、白名单策略、飞书登录后自动加入工作空间。
- 第三方平台面板展示健康诊断、最近同步、自动登录和审计日志。
- 手动浏览器 smoke：`smoke:feishu-diagnostics`。

非本批提交目标：

- Docker、CI workflow、项目基础设置、品牌资源、项目展示卡等非飞书改动。
- `--host/`、`--port/`、`output/playwright/` 等本地临时或忽略产物。

## API 与类型确认

- 工作空间飞书 snapshot 稳定包含 `auditLogs`、`diagnosticSummary`、`memberSyncSummary`、`autoLoginSummary`。
- 审计 payload 只保存摘要与样本，敏感字段如 token、ticket、secret 会脱敏。
- `smoke:feishu-diagnostics` 是手动准入命令，不接入默认 CI，避免 CI 依赖可写数据库和本地浏览器环境。

## 验证命令

```bash
pnpm exec vitest run \
  scripts/tests/workspace-feishu-integrations.test.mjs \
  scripts/tests/workspace-feishu-auth-closure.test.mjs \
  scripts/tests/workspace-feishu-member-closure.test.mjs \
  scripts/tests/workspace-feishu-import-wizard.test.mjs \
  scripts/tests/workspace-feishu-production-diagnostics.test.mjs \
  scripts/tests/workspace-feishu-diagnostics-behavior.test.mjs
```

```bash
pnpm exec eslint \
  package.json \
  scripts/workspace-feishu-diagnostics-smoke.mjs \
  scripts/tests/workspace-feishu-production-diagnostics.test.mjs \
  scripts/tests/workspace-feishu-diagnostics-behavior.test.mjs \
  app/components/user-settings/UserSettingsThirdPartyPlatformsPanel.vue \
  app/components/workspace/WorkspaceResourceManagerPanel.vue \
  internal/shared-types/domain-legacy.ts \
  server/api/teams/[id]/integrations/feishu/audits.get.ts \
  server/api/teams/[id]/integrations/feishu/directory/search.get.ts \
  server/api/teams/[id]/integrations/feishu/imports/index.post.ts \
  server/api/teams/[id]/integrations/feishu/index.get.ts \
  server/api/teams/[id]/integrations/feishu/member-sync/preview.post.ts \
  server/api/teams/[id]/integrations/feishu/member-sync/run.post.ts \
  server/api/teams/[id]/integrations/feishu/sources/search.get.ts \
  server/database/bootstrap/schema.ts \
  server/services/feishu/auth.ts \
  server/services/feishu/user-provision.ts \
  server/services/feishu/workspace-member-sync.ts \
  server/utils/workspace-integration-store.ts \
  shared/types/domain-legacy.ts \
  shared/utils/workspace-feishu-integration.ts
```

```bash
pnpm exec vue-tsc --noEmit --pretty false
git diff --check
```

真实浏览器 smoke 需要先启动可访问的服务：

```bash
pnpm dev --host 127.0.0.1 --port 3002
E2E_BASE_URL="http://127.0.0.1:3002" pnpm run smoke:feishu-diagnostics
```

通过后截图会写入：

```text
output/playwright/workspace-feishu-diagnostics/third-party-panel.png
```

# touch-win-loop 部署手册（1Panel + GHCR + deploy-webhook）

> 说明：当前仓库的主发布链路已经切换到 [`../jenkins/README.zh-CN.md`](../jenkins/README.zh-CN.md)。本目录保留为过渡/回退资产，不再作为默认方案继续扩展。

本目录用于 `touch-win-loop` 在 1Panel 的标准部署，默认策略：

1. `push main` 后由 GitHub Actions 推送 GHCR 镜像。
2. Actions 调用独立 `deploy-webhook` 的 `POST /hooks/winloop`。
3. 由本目录脚本在 1Panel 执行拉镜像、重建、健康检查与失败回滚。
4. `ssh home` 手动执行作为固定兜底路径。

## 文件说明

- `deploy-winloop-1panel.sh`：主部署脚本（pull + up + healthcheck + rollback）
- `deploy-winloop-1panel-webhook.sh`：解析 webhook payload 并调用主部署脚本
- `deploy-winloop-1panel-cron.sh`：定时任务包装（env 加载 + 并发锁）
- `deploy-winloop-1panel.env.example`：部署 env 模板
- `deploy-winloop-1panel-webhook.env.example`：webhook 校验模板

如果同批部署包含数据库 schema 变更，建议同时把仓库里的 `scripts/migrations` 目录上传到服务器。
主部署脚本会在 `pull` 成功后、`up -d` 之前自动执行该目录里的 `.sql` 迁移，并把执行状态记入目标库 `migrations_meta`。

## 1）1Panel 服务器初始化

把本目录文件上传到服务器（示例路径）：

- `/opt/1panel/scripts/winloop-deploy`

执行：

```bash
chmod +x "/opt/1panel/scripts/winloop-deploy/deploy-winloop-1panel.sh"
chmod +x "/opt/1panel/scripts/winloop-deploy/deploy-winloop-1panel-webhook.sh"
chmod +x "/opt/1panel/scripts/winloop-deploy/deploy-winloop-1panel-cron.sh"
cp "/opt/1panel/scripts/winloop-deploy/deploy-winloop-1panel.env.example" "/opt/1panel/scripts/winloop-deploy/winloop-deploy.env"
cp "/opt/1panel/scripts/winloop-deploy/deploy-winloop-1panel-webhook.env.example" "/opt/1panel/scripts/winloop-deploy/winloop-webhook.env"
```

## 2）必须配置

编辑 `/opt/1panel/scripts/winloop-deploy/winloop-deploy.env`：

- `WINLOOP_PROJECT_DIR`
- `WINLOOP_COMPOSE_FILE`
- `WINLOOP_SERVICE_NAME`
- `WINLOOP_IMAGE_REPO`
- `WINLOOP_IMAGE_TAG`
- `WINLOOP_PG_URL`
- `WINLOOP_REDIS_URL`
- `WINLOOP_CONFIG_MASTER_KEY`（用于敏感配置加密落库）
- `WINLOOP_HEALTHCHECK_URL`
- `WINLOOP_BUILD_VERSION`（可选，CI 通常自动覆盖）
- `WINLOOP_BUILD_COMMIT_SHA`（可选，CI 通常自动覆盖）
- `WINLOOP_DB_MIGRATION_DIR`（可选，自定义 SQL 迁移目录）
- `WINLOOP_DB_MIGRATION_FILES`（可选，逗号分隔；为空时默认执行目录下全部 `.sql`）
- `WINLOOP_DB_MIGRATION_CLIENT_IMAGE`（可选，默认 `postgres:18-alpine`）
- `WINLOOP_DB_MIGRATION_NETWORK`（可选，默认 `1panel-network`）

编辑 `/opt/1panel/scripts/winloop-deploy/winloop-webhook.env`：

- `WINLOOP_WEBHOOK_TOKEN`
- `WINLOOP_WEBHOOK_ALLOWED_BRANCH=main`
- `WINLOOP_WEBHOOK_ALLOWED_REPOSITORY=<你的 GitHub 仓库全名>`
- `WINLOOP_WEBHOOK_DEFAULT_IMAGE`

## 3）固定手动兜底 SOP（ssh home）

```bash
ssh home
set -a
source "/opt/1panel/scripts/winloop-deploy/winloop-deploy.env"
set +a
"/opt/1panel/scripts/winloop-deploy/deploy-winloop-1panel.sh"
```

## 4）1Panel 定时兜底（建议每 30 分钟）

1Panel 计划任务 / cron 示例：

```bash
*/30 * * * * /opt/1panel/scripts/winloop-deploy/deploy-winloop-1panel-cron.sh >> /var/log/winloop-deploy.log 2>&1
```

## 5）接入独立 deploy-webhook

独立服务建议部署在：`/opt/1panel/scripts/deploy-webhook`。

`deploy-webhook` 的 `config.json` 中，`winloop` 项至少要配置：

- `token`
- `allowed_repository`
- `allowed_branch`
- `deploy_script=/opt/1panel/scripts/winloop-deploy/deploy-winloop-1panel-webhook.sh`
- `default_image`
- `default_tag`

## 6）GitHub Secrets

在 `touch-win-loop` 仓库配置：

- `ONEPANEL_WEBHOOK_URL`（示例：`http://<host>:19031`）
- `ONEPANEL_WEBHOOK_TOKEN_WINLOOP`（与 `winloop.token` 一致）

工作流固定调用：

- `POST ${ONEPANEL_WEBHOOK_URL}/hooks/winloop`
- Header: `X-Deploy-Token`
- Payload 附带 `build_version` 与 `build_commit_sha`，由 webhook 脚本注入容器运行时环境。

## 7）验收命令

```bash
bash -n "/opt/1panel/scripts/winloop-deploy/deploy-winloop-1panel.sh"
bash -n "/opt/1panel/scripts/winloop-deploy/deploy-winloop-1panel-webhook.sh"
bash -n "/opt/1panel/scripts/winloop-deploy/deploy-winloop-1panel-cron.sh"
curl "http://127.0.0.1:3510/api/health"
```

## 8）说明

- 本次只新增 `touch-win-loop` 接入，不迁移 `pilot`。
- 生产故障时优先走“第 3 节”的 `ssh home` 兜底 SOP。
- 业务运行参数支持管理端 UI 覆盖（`UI Override > Env`），基础设施参数仍固定由 Env 提供。
- 迁移不参与自动回滚，所以发布 SQL 必须保持向后兼容或显式幂等。

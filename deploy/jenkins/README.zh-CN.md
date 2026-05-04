# touch-win-loop Jenkins 部署说明

当前仓库的主发布链路已经切换为：

`GitHub Actions -> GHCR -> Jenkins -> SSH -> Docker Compose on center`

`deploy/jenkins` 目录提供以下资产：

- `deploy-winloop.sh`：Jenkins 与人工兜底共用的统一部署入口
- `pipeline.groovy`：Jenkins Job checkout 完代码后的主流水线逻辑
- `job-bootstrap.groovy`：staging Jenkins Job 中可直接粘贴的精简 bootstrap 示例
- `job-bootstrap-production.groovy`：production Jenkins Job 中可直接粘贴的精简 bootstrap 示例
- `compose.yaml`：repo versioned Compose 模板
- `deploy.env.example`：环境级部署参数模板
- `.env.runtime.example`：运行时参数模板
- `init-target-layout.sh`：在目标机上初始化 staging / production 目录骨架

## 0）Jenkins 运行在 Docker 容器里的前提

当前 `center` 上的 Jenkins 是 Docker 容器，不是宿主机进程。

当前主链路已经改为“Jenkins 通过 SSH 连接目标机部署”，因此不再要求 Jenkins 容器直接挂载：

```text
/var/run/docker.sock
/usr/bin/docker
/usr/libexec/docker/cli-plugins
/opt/deploy/touch-win-loop
```

Jenkins 容器只需要具备以下能力：

1. SSH 工具：
   - `ssh`
   - `scp`
   - `tar`

2. Jenkins 插件：
   - `ssh-agent`
   - `ssh-credentials`
   - `credentials-binding`

3. Jenkins 凭据：
   - 一个 GitHub 只读 checkout 凭据
   - 一个 GHCR 只读用户名/令牌凭据
   - 一个可登录目标机的 SSH 私钥凭据

以当前 `center` 的实际状态看，Jenkins 容器内已经存在：

- `/usr/bin/ssh`
- `/usr/bin/scp`
- `/usr/bin/tar`

因此当前实现优先推荐 SSH 部署，不推荐再把 Jenkins 容器改造成“直接操作宿主机 Docker”的模式。

## 1）center 目录模型

目标机器固定采用独立 Compose 目录，不再依赖 1Panel App 目录结构：

- `/opt/deploy/touch-win-loop/staging`
- `/opt/deploy/touch-win-loop/production`

每个环境目录至少包含：

- `compose.yaml`
- `deploy.env`
- `.env.runtime`
- `storage/`

Jenkins 主链路在部署时还会把仓库里的 `scripts/migrations/*.sql` 一并同步到远端临时工作区，并在 `pull` 成功后、`up -d` 之前按文件名字典序执行。
迁移执行状态会记录到目标库的 `migrations_meta`，已执行过的 SQL 会自动跳过。

建议初始化命令：

```bash
chmod +x "deploy/jenkins/init-target-layout.sh"
./deploy/jenkins/init-target-layout.sh "/opt/deploy/touch-win-loop"
```

## 2）deploy.env 约定

`deploy.env` 只保存部署基础设施参数，最少包含：

```dotenv
COMPOSE_PROJECT_NAME=touch-win-loop-staging
SERVICE_NAME=winloop
DOCKER_EXTERNAL_NETWORK=1panel-network
RUNTIME_ENV_FILE=.env.runtime
HEALTHCHECK_URL=http://127.0.0.1:3511/api/health
HEALTHCHECK_ATTEMPTS=20
HEALTHCHECK_INTERVAL_SEC=3
ROLLBACK_ON_FAILURE=true
FORCE_RECREATE=true
APP_BIND_IP=127.0.0.1
APP_HOST_PORT=3511
DB_MIGRATION_DIR=
DB_MIGRATION_FILES=
DB_MIGRATION_CLIENT_IMAGE=postgres:18-alpine
DB_MIGRATION_NETWORK=1panel-network
MEETING_STACK_ENABLED=true
MEETING_EGRESS_ENABLED=false
MEETING_LIVEKIT_HTTP_PORT=17880
MEETING_LIVEKIT_TCP_PORT=17881
MEETING_LIVEKIT_RTC_UDP_RANGE=51000-51100
```

其中：

- `DOCKER_EXTERNAL_NETWORK` 用于指定应用容器加入的外部 Docker 网络，默认建议填 `1panel-network`
- 如果 PostgreSQL / Redis / PgBouncer 通过容器名互联，应用必须与这些基础容器处于同一个外部网络
- `DB_MIGRATION_*` 为可选项；默认会自动发现远端工作区里的 `scripts/migrations/*.sql`
- 迁移不会参与自动回滚，因此所有上线 SQL 必须保持向后兼容或显式幂等
- `MEETING_STACK_ENABLED=true` 时，标准 staging 部署会同时启动 LiveKit、meeting Redis、Prometheus、node-exporter、cAdvisor
- `MEETING_EGRESS_ENABLED=false` 是首轮默认值；录制压测阶段再打开 Egress profile
- LiveKit 默认暴露宿主 `17880/tcp`、`17881/tcp`、`51000-51100/udp`，容器内 HTTP 仍为 `livekit:7880`；staging 旧默认 `7880/tcp`、`7881/tcp`、`50000-50100/udp` 会在部署时自动迁移到新默认，避免和宿主现有 LiveKit 冲突
- Prometheus 默认不发布宿主端口，仅通过容器网络 `meeting-prometheus:9090` 访问

production 只需要改成独立的：

- `COMPOSE_PROJECT_NAME`
- `HEALTHCHECK_URL`
- `APP_HOST_PORT`

## 3）.env.runtime 约定

`.env.runtime` 保存业务与敏感配置，至少需要按环境分离：

- `WINLOOP_PG_URL`
- `WINLOOP_REDIS_URL`
- `WINLOOP_CONFIG_MASTER_KEY`
- `WINLOOP_PUBLIC_BASE_URL`
- `WINLOOP_API_BASE_URL`
- `WINLOOP_ONLYOFFICE_ENDPOINT` / `WINLOOP_ONLYOFFICE_JWT_SECRET`（如果启用再配）
- `WINLOOP_MEETING_RTC_SERVER_URL`（使用内置 LiveKit 时应指向真实 staging 域名与 `MEETING_LIVEKIT_HTTP_PORT`，默认端口 `17880`）
- `WINLOOP_MEETING_MONITORING_PROMETHEUS_BASE_URL`（staging 默认 `http://meeting-prometheus:9090`）
- `WINLOOP_SENTRY_DSN` / `WINLOOP_SENTRY_ENVIRONMENT`（如果启用 Sentry 再配）

`WINLOOP_PUBLIC_BASE_URL` 是 Jenkins 发布通知里“环境访问 / 访问地址”的唯一来源，staging 与 production 必须分别配置为真实可访问的公网地址。未配置时不影响发布，但飞书通知不会展示访问地址。

资源回收 worker 参数已改为后台 UI 管理，不再通过 `.env.runtime` 配置。
Sentry 未配置时应用仍可正常运行，只是不启用错误上报。

必须保证 staging 与 production：

- 使用不同 PostgreSQL database
- 使用不同 Redis DB/index
- 使用不同域名或端口
- 不共享同一份 `.env.runtime`
- `WINLOOP_SENTRY_ENVIRONMENT` 分别显式设置为 `staging` / `production`

## 4）Jenkins Job 创建

当前 Jenkins 已具备 Pipeline 能力，入口 URL 为：

- `https://jenkins.center.tagzxia.com/`

需要新建两个参数化 Pipeline Job：

- `touch-win-loop-staging`
- `touch-win-loop-production`

推荐做法：

1. Job 类型选择 `Pipeline`
2. 勾选 `This project is parameterized`
3. 参数名固定为：
   - `GITHUB_REPOSITORY`
   - `GITHUB_BRANCH`
   - `BUILD_COMMIT_SHA`
   - `BUILD_VERSION`
   - `IMAGE_REF`
   - `TRIGGERED_BY`
   - `WORKFLOW_RUN_URL`
   - `COMMIT_CHANGES`（可选兜底，默认留空；Jenkins 会优先基于上次成功发布 commit 自动生成）
4. Pipeline script 使用以下模板：
   - staging：`deploy/jenkins/job-bootstrap.groovy`
   - production：`deploy/jenkins/job-bootstrap-production.groovy`
5. staging job 保持：
   - `deployEnvironment: 'staging'`
   - `expectedBranch: 'dev'`
6. production job 改成：
   - `deployEnvironment: 'production'`
   - `expectedBranch: 'main'`

bootstrap 脚本中的凭据 ID 需要替换为你在 Jenkins 中真实创建的值：

- `github-readonly`
- `40a0292f-ea02-4882-8d0e-659efe25861b`
- `touch-center-ssh`

同时需要根据你的环境修改：

- `sshTarget`
- `remoteWorkspaceRoot`
- `remoteDeployBaseDir`

如需接入飞书群机器人部署通知，可额外增加：

- `feishuWebhookCredentialsId`
- `feishuWebhookSecretCredentialsId`（如果机器人启用了签名校验再配）

推荐在 Jenkins 中新增两个 `Secret text` 凭据：

- `jenkins-feishu-webhook`
- `jenkins-feishu-webhook-secret`

然后在 job bootstrap 的 `runPipeline` 配置里打开：

```groovy
feishuWebhookCredentialsId: 'jenkins-feishu-webhook',
feishuWebhookSecretCredentialsId: 'jenkins-feishu-webhook-secret',
```

如果飞书机器人没有开启签名校验，只保留第一行即可。

通知由 `pipeline.groovy` 内置 stage 控制：

- `Notify Feishu Start`：参数校验通过后立即发送开始通知。
- `Notify Feishu`：发布结束后发送成功 / 失败通知，即使部署失败也会尽力发送。

通知内容会包含：

- 部署结果（开始 / 成功 / 失败）
- 环境、分支、版本、Commit、镜像摘要
- 当前环境访问地址（来自 `.env.runtime` 的 `WINLOOP_PUBLIC_BASE_URL`）
- 本次发布 commit changes 列表
- GitHub Actions 运行链接
- Jenkins 构建链接
- 流程阶段或失败阶段、失败信息、是否触发回滚

commit changes 的生成规则：

- 优先读取目标环境目录下 `last-successful-deployment.json` 的 `buildCommitSha`。
- 结束通知使用 `git log <previous>..<current> --format='- %h %s (%an)' --no-merges` 生成，最多展示 20 条。
- 首次发布、上次 commit 不可解析或生成失败时，降级为当前发布 commit 的一条摘要。
- 只有健康检查成功的发布才会更新 `last-successful-deployment.json`；失败、回滚不会更新，避免污染下一次 changes 范围。

## 5）GitHub Secrets

仓库中至少需要配置以下 Secrets：

- `JENKINS_BASE_URL`
- `JENKINS_USER`
- `JENKINS_API_TOKEN`
- `JENKINS_JOB_STAGING`
- `JENKINS_JOB_PRODUCTION`

如需在镜像构建阶段自动上传 Sentry source map，还需要补充：

- `SENTRY_AUTH_TOKEN`
- `WINLOOP_SENTRY_ORG`
- `WINLOOP_SENTRY_PROJECT`

Actions 会按分支调用不同 Job：

- `dev -> $JENKINS_JOB_STAGING`
- `main -> $JENKINS_JOB_PRODUCTION`

## 6）GitHub 分支保护

由于 `main` 已经配置为自动直达 production，必须同时开启 GitHub 分支保护：

- 禁止直接 push `main`
- 只允许通过 PR 合并
- `CI` 必须是 required check
- `WinLoop Image Publish` 必须是 required check

## 7）Sentry staging 验收

在对外宣称 “Sentry 接入完成” 之前，至少完成一次 staging 验收。建议按下面顺序执行：

1. 先做仓库侧自检：

```bash
pnpm run sentry:doctor --mode production
pnpm run build
pnpm run ci:smoke
```

2. 若构建日志仍出现以下 warning：

```text
[sentry] Source map upload disabled because required build-time env is missing: ...
```

先检查 GitHub Actions 可见范围内是否已经提供：

- `SENTRY_AUTH_TOKEN`
- `WINLOOP_SENTRY_ORG`
- `WINLOOP_SENTRY_PROJECT`

如果这些 secret 已经存在，但日志仍提示 `SENTRY_AUTH_TOKEN` 缺失，再检查 workflow 是否仍在使用无效写法 `id=sentry_auth_token,env=SENTRY_AUTH_TOKEN`。当前仓库已改为 `docker/build-push-action@v7` 官方支持的 `secrets` 传法。

3. 浏览器异常验收：

- 打开 staging 任意前端页面，在浏览器控制台执行：

```js
setTimeout(() => {
  throw new Error('winloop sentry browser smoke')
}, 0)
```

- 在 Sentry 中确认：
  - issue 已入库
  - `environment=staging`
  - `release` 与镜像 build version 对齐
  - 前端堆栈可反解，不再是压缩产物位置

4. Nitro 500 验收：

- 直接调用 staging 内部验证接口：

```bash
curl -X POST "https://<staging-host>/api/admin/sentry/smoke" \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  --data '{"target":"nitro"}' \
  -i
```

- 该接口仅在 `WINLOOP_SENTRY_ENVIRONMENT=staging` 且当前用户具备 `contest.read_internal` 时可用。
- 记录响应头里的 `x-trace-id`，在 Sentry 中按该 trace/message 搜索对应事件。
- 预期 HTTP 状态为 `500`；如果返回 `404`，说明当前环境并非 `staging`；如果返回 `412`，说明服务端 Sentry SDK 还没初始化。
- 在 Sentry 中确认：
  - 服务端异常已入库
  - 同一条请求链路可与前端 trace 串联

5. 后台任务 / worker 验收：

- 直接调用 staging 内部验证接口：

```bash
curl -X POST "https://<staging-host>/api/admin/sentry/smoke" \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  --data '{"target":"worker"}'
```

- 返回体会携带 `traceId`，可用它在 Sentry 中定位对应 worker 事件。
- 返回体里的 `release` / `environment` 应与 staging 当前配置一致。
- 该路径内部只附加 `module`、`taskId`、`traceId` 和 build 信息，不带 cookie、token、Authorization、secret。
- 预期 HTTP 状态为 `200`；如果返回 `404`，说明当前环境并非 `staging`；如果返回 `412`，说明服务端 Sentry SDK 还没初始化。
- 在 Sentry 中确认：
  - worker 异常已入库
  - 事件上下文未出现敏感字段明文

6. 运维收尾：

- 配置 production 高优先级未处理异常告警
- 根据业务预期补 ignore / discard 规则，过滤业务性 4xx 噪音

## 8）手工兜底

自动链路和手工链路统一走同一脚本：

```bash
cd "/path/to/touch-win-loop"
./deploy/jenkins/deploy-winloop.sh \
  --env staging \
  --image-ref "ghcr.io/<owner>/touch-win-loop@sha256:<digest>" \
  --build-version "dev-123-abcdef0" \
  --build-commit-sha "<full_sha>"
```

如需在非标准目录测试，可临时覆盖：

```bash
WINLOOP_DEPLOY_BASE_DIR="/tmp/touch-win-loop" ./deploy/jenkins/deploy-winloop.sh ...
```

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
RUNTIME_ENV_FILE=.env.runtime
HEALTHCHECK_URL=http://127.0.0.1:3511/api/health
HEALTHCHECK_ATTEMPTS=20
HEALTHCHECK_INTERVAL_SEC=3
ROLLBACK_ON_FAILURE=true
FORCE_RECREATE=true
APP_BIND_IP=127.0.0.1
APP_HOST_PORT=3511
STORAGE_HOST_DIR=./storage
```

production 只需要改成独立的：

- `COMPOSE_PROJECT_NAME`
- `HEALTHCHECK_URL`
- `APP_HOST_PORT`
- `STORAGE_HOST_DIR`（如需额外隔离可改）

## 3）.env.runtime 约定

`.env.runtime` 保存业务与敏感配置，至少需要按环境分离：

- `WINLOOP_PG_URL`
- `WINLOOP_REDIS_URL`
- `WINLOOP_CONFIG_MASTER_KEY`
- `WINLOOP_PUBLIC_BASE_URL`
- `WINLOOP_API_BASE_URL`
- `WINLOOP_ONLYOFFICE_ENDPOINT` / `WINLOOP_ONLYOFFICE_JWT_SECRET`（如果启用再配）

资源回收 worker 参数已改为后台 UI 管理，不再通过 `.env.runtime` 配置。

必须保证 staging 与 production：

- 使用不同 PostgreSQL database
- 使用不同 Redis DB/index
- 使用不同域名或端口
- 不共享同一份 `.env.runtime`

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

通知内容会包含：

- 部署结果（成功 / 失败）
- 环境、分支、版本、Commit、镜像摘要
- GitHub Actions 运行链接
- Jenkins 构建链接
- 失败阶段、失败信息、是否触发回滚

## 5）GitHub Secrets

仓库中至少需要配置以下 Secrets：

- `JENKINS_BASE_URL`
- `JENKINS_USER`
- `JENKINS_API_TOKEN`
- `JENKINS_JOB_STAGING`
- `JENKINS_JOB_PRODUCTION`

Actions 会按分支调用不同 Job：

- `dev -> $JENKINS_JOB_STAGING`
- `main -> $JENKINS_JOB_PRODUCTION`

## 6）GitHub 分支保护

由于 `main` 已经配置为自动直达 production，必须同时开启 GitHub 分支保护：

- 禁止直接 push `main`
- 只允许通过 PR 合并
- `CI` 必须是 required check
- `WinLoop Image Publish` 必须是 required check

## 7）手工兜底

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

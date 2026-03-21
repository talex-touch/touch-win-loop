# Touch WinLoop (Nuxt + LangChain)

WinLoop AI（赛帮帮）V0 骨架项目，面向“选赛 -> 建项 -> 协作 -> 交付”的一站式竞赛工作台。

## 特性

- `antfu/vitesse-nuxt3` 基线，前后端同仓开发。
- 黑白极简、高信息密度三栏 AI 工作台（`/workspace`）。
- 账号密码登录（未注册自动注册），首个用户自动成为平台管理员。
- `Personal + Team` 双空间，项目按空间单归属。
- 双通道建项目：
  - AI 聊天生成项目草案。
  - 表单填写直接创建项目。
- Team 维度席位与 AI 配额扣减（不含支付）。
- 项目支持多学院/多指导老师绑定，绑定导师自动授予项目管理权限。
- LangChain 接入：
  - `POST /api/ai/contest-filter`
  - `POST /api/ai/project-chat`
- 模型失败自动重试并兜底，保证演示稳定性。
- PostgreSQL 持久化（不再依赖 `projects.json` 本地迁移链路）。

## 快速启动

```bash
pnpm install
pnpm dev
```

打开 `http://localhost:3510/workspace`。

## 环境变量

加载优先级（按运行模式）：

```txt
开发环境（NODE_ENV=development）：.env.local > .env.dev > .env
生产环境（NODE_ENV=production）：.env.local > .env.prod > .env
其他环境：.env.local > .env.prod > .env.dev > .env
```

已提供：

- `.env.example`
- `.env.dev`
- `.env.prod`

本地私有配置建议写入 `.env.local`（已加入 `.gitignore`）。

### PostgreSQL / Redis URL 配置说明

请在 `.env.local` 显式配置数据库与缓存连接 URL（含账号密码）：

```txt
WINLOOP_PG_URL=postgresql://user:password@127.0.0.1:5432/winloop
WINLOOP_REDIS_URL=redis://:password@127.0.0.1:6379/0
WINLOOP_CONTEST_AUTO_SEED=false
```

若缺失或不完整，登录及依赖连接的接口会报连接配置错误。

## 赛事 seed 策略（去 mock 默认）

- 默认不自动注入 catalog 赛事数据（`WINLOOP_CONTEST_AUTO_SEED=false`）。
- 若需要本地演示数据，请使用 CLI 手动执行（幂等）：

```bash
pnpm contest:seed:catalog
```

- 若需要清理 catalog 数据并重置 seed 标记：

```bash
pnpm contest:clean:catalog
```

- 查看当前 catalog seed 状态：

```bash
pnpm contest:seed:status
```

## 关键接口

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/workspaces`
- `POST /api/workspaces`
- `POST /api/workspaces/:id/invitations`
- `POST /api/invitations/:token/accept`
- `GET /api/contests`
- `GET /api/contests/:id`
- `GET /api/resources`
- `POST /api/ai/contest-filter`
- `POST /api/ai/project-chat`
- `GET /api/projects`
- `POST /api/projects`
- `POST /api/projects/batch`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id/bindings`

## 目录概览

- `app/pages/workspace.vue`：主工作台（筛选 + 聊天建项 + 表单建项）。
- `app/pages/login.vue`：登录/自动注册入口。
- `server/services/ai/*`：LangChain 链路与兜底策略。
- `server/data/catalog.ts`：竞赛、赛道、rubric、资料 mock 数据。
- `server/utils/db.ts`：PostgreSQL 连接与 schema 初始化。
- `server/utils/platform-store.ts`：账号、空间、项目、邀请、配额主数据访问层。
- `shared/types/domain.ts`：前后端共享类型定义。

## 基础设施说明

- PostgreSQL 为当前运行时强依赖：服务启动后会自动初始化 schema。
- Redis 目前主要用于配置展示与预留（`/api/health` 会返回连接信息），业务核心流程暂未直接读写 Redis。
- 若未正确配置 `WINLOOP_PG_URL`，登录、工作区、项目与管理侧接口将不可用。

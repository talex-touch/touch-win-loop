# 项目知识索引与 RAG 落地进度

更新时间：2026-04-17

本文记录当前 `project knowledge` 这一轮已经落地的能力、仍未完成的事项、最小数据通路以及建议的分批提交方式，供后续研发、联调和回归继续推进。

## 1. 本轮已完成

### 1.1 索引底座与状态模型

- 已落地项目级知识索引三层模型：
  - `project_knowledge_sources`
  - `project_knowledge_index_tasks`
  - `project_knowledge_chunks`
- 已补齐状态字段与执行阶段：
  - `pending / queued / extracting / chunking / embedding / ready / failed / stale / skipped`
  - `queued / extracting / chunking / embedding / finalizing`
- 已落地数据库 schema 与 SQL migration：
  - `scripts/migrations/2026-04-16-project-knowledge-index.sql`
- 已新增统一 store：
  - `server/utils/project-knowledge-store.ts`
  - 负责 source 同步、task 去重入队、进度推进、task claim、chunk 替换写入、dashboard 聚合与检索数据读取

### 1.2 资源触发与索引状态可视化

- 上传完成后，资源会自动进入知识索引链路。
- Markdown 协作文档正文同步后，会标记 `stale` 并自动重新入队。
- 文档预览完成后，会标记 `stale` 并自动重新入队。
- 项目设置页与资源属性弹窗都已接入索引状态展示与重建入口：
  - `app/components/workspace/WorkspaceResourceManagerPanel.vue`
  - `app/components/workspace/WorkspaceProjectSettingsTab.vue`
- 已提供项目级与单资源级状态读口：
  - `GET /api/projects/:id/knowledge/index-status`
  - `GET /api/projects/:id/resources/:resourceId/knowledge/index-status`
  - `POST /api/projects/:id/knowledge/reindex`
  - `POST /api/projects/:id/resources/:resourceId/knowledge/reindex`

### 1.3 检索、引用与 warning 出链

- 工作台 AI、项目聊天、画布 AI、选题助手已统一接入项目知识检索上下文：
  - `server/services/ai/project-knowledge-context.ts`
- 检索链当前已具备：
  - 词法召回 + 向量召回
  - `ready` 优先
  - `stale` 仅 fallback
  - citation 结构化返回
  - 当相关资料多数未 ready 时返回 `索引未完成，结果可能不完整。`
- assistant 返回协议已补 `knowledge` 结构：
  - `citations`
  - `warning`
  - `usedFallback`
- 结果会同时写入：
  - AI API `done` 结果
  - assistant 持久化 message metadata
  - 本地流式 assistant 消息 metadata

### 1.4 工作区 AI 侧栏引用渲染

- 工作区右侧 AI 侧栏已真正渲染 citation 与 warning，而不是只写入 metadata：
  - `app/components/workspace/WorkspaceAssistantMessageContent.vue`
  - `app/components/workspace/WorkspaceRightSidebar.vue`
- 当前渲染规则：
  - assistant 正文继续保持既有 markdown 渲染风格
  - `progress / tool` 继续保持既有步骤卡渲染
  - citation 以资料卡形式展示
  - warning 单独黄条提示
  - `stale`、投影类型、fallback 都有显式标记
- 终审侧栏和画布 AI 最近消息也已复用同一套 assistant 内容渲染组件。

### 1.5 多模态检索 V1

- 当前采用“文本投影优先”，未新建第二套向量表。
- 已扩展 chunk kind：
  - `image_summary`
  - `image_ocr`
  - `meeting_notes`
  - `meeting_transcript`
- 已新增视觉投影与多模态 metadata：
  - `server/services/knowledge-vision.ts`
- 当前能力包括：
  - 图片摘要 / OCR 投影
  - 文档视觉 fallback 投影
  - 会议纪要 / 转写投影
  - Draw 摘要投影
- 查询时已支持视觉 / 会议意图加权，但仍统一走文本 embedding 空间。

### 1.6 Worker 可观测性

- 已新增项目知识索引 worker：
  - `server/plugins/project-knowledge-worker.ts`
- 已新增运行时状态模型：
  - `server/utils/project-knowledge-worker-state.ts`
- 已补后台只读观测接口与页面：
  - `server/api/admin/resources/knowledge-worker.get.ts`
  - `app/pages/admin/resource-knowledge-worker.vue`
- 当前后台可看：
  - worker 健康状态
  - backlog
  - recent runs
  - top errors
  - recent failures
  - 任务列表
  - 多模态片段分布

### 1.7 Focused 回归闭环

- 已补一份围绕 embeddings / RAG 的聚焦回归，而不是泛化补测试：
  - `scripts/tests/project-knowledge-focused-regression.test.mjs`
- 当前回归锁住四个断点：
  - 上传 / Markdown / 预览更新是否能进入索引状态
  - `ready` 与 `incomplete / fallback` 两条 RAG 路径
  - AI API 是否把 `citation / warning` 写入 assistant metadata
  - 工作区 AI 侧栏是否真正渲染 citation / warning
- 本轮通过的关键命令：

```bash
pnpm vitest run \
  "scripts/tests/project-knowledge-focused-regression.test.mjs" \
  "scripts/tests/project-knowledge-index-ui.test.mjs" \
  "scripts/tests/project-knowledge-ai-context.test.mjs" \
  "scripts/tests/project-knowledge-phase2.test.mjs"
```

## 2. 当前最小可用数据通路

### 2.1 资源进入索引

- 上传资源：
  - `project-resource-upload -> createProjectUploadedResource -> scheduleProjectKnowledgeSourceUpsert`
- 协作文档：
  - `createProjectCollabResource -> scheduleProjectKnowledgeSourceUpsert`
- Markdown 内容更新：
  - `syncMarkdownResourceProjection -> markProjectKnowledgeSourceStale(autoEnqueue: true)`
- 文档预览更新：
  - `project-document-preview-worker -> markProjectKnowledgeSourceStale(autoEnqueue: true)`

### 2.2 索引执行与状态读取

- worker claim task 后推进：
  - `extracting -> chunking -> embedding -> finalizing -> ready`
- UI 真相源：
  - `project_knowledge_sources`
- worker 调度真相源：
  - `project_knowledge_index_tasks`
- 项目页和资源属性都通过后端聚合快照读取状态，而不是前端自行拼接。

### 2.3 AI 回答与引用展示

- AI 调用前：
  - `buildProjectKnowledgeLocalContext` 先构建 `summaryText + citations + warning + usedFallback`
- AI 返回后：
  - `workspace stream / project chat / canvas stream` 将 `knowledge` 写入 assistant metadata 与返回结果
- 前端展示时：
  - `WorkspaceAssistantMessageContent` 统一渲染正文、warning 和 citations
  - 工作区右侧栏、终审侧栏、画布 AI 最近消息复用同一套渲染逻辑

## 3. 本轮未完成

### 3.1 端到端与真实运行验证

- 还没有补数据库级或浏览器级的真实集成回归：
  - 没有覆盖“真上传 -> 真入库 -> 真 worker 处理 -> 真 ready -> 真 AI 命中”的全链路
- 当前仍以仓库现有的静态 source test + 聚焦链路回归为主。

### 3.2 引用体验深化

- citation 当前可打开资源，但还没有稳定跳到具体页码 / 章节位置。
- 还没有在消息正文内部做 citation 内联高亮。
- 还没有对模型输出做 citation 后验校验，当前仍主要依赖 prompt 与结构化 payload 双重约束。

### 3.3 检索调优与可视化

- 还没有做基于线上数据的 retrieval score 调优。
- 还没有落地项目 dashboard 里的向量空间、关系图、脑图和索引数据表视图。
- 还没有做图搜图、音搜音、视频帧原生向量检索。

### 3.4 运维与分析闭环

- 还没有补引用点击、warning 展示、资源重建索引等用户行为埋点。
- 还没有补知识索引 worker 的阈值告警规则。

## 4. 已知边界

- v1 默认以“项目问答可信”为优先目标，不追求一次性覆盖所有模态原生检索。
- `stale` 资料当前只作 fallback，不作为强引用主证据。
- 视觉 / OCR / 转写命中属于“投影结果”，可信度仍低于原始正文直抽。
- 全仓 `pnpm typecheck` 仍有历史遗留问题；当前只确保这条线没有新增定向错误。

## 5. 建议分批提交

当前工作区里存在大量非本线改动，提交时不应混入。建议只围绕 `project knowledge / embeddings / RAG / citation / worker monitor / tests / docs` 这一组文件拆成以下批次：

1. `feat(knowledge): add project knowledge index store worker and status apis`
   - 包含 schema / migration / store / worker / 项目级与资源级索引 API / 自动触发点
2. `feat(workspace): surface project knowledge status in resource panel and project settings`
   - 包含资源属性弹窗、项目设置页索引状态 UI
3. `feat(ai): persist and render project knowledge citations and warnings`
   - 包含 `project-knowledge-context`、workspace / project-chat / canvas 出链、右侧栏 / 终审 / 画布引用渲染
4. `feat(knowledge): add multimodal projections and worker observability`
   - 包含 vision projection、多模态 metadata、knowledge worker admin API / page
5. `test(knowledge): add focused rag regression coverage`
   - 包含 `project-knowledge-*` 相关脚本测试与本文档

如果当前要从脏工作区里摘取提交，建议先按上面五组做精确 `git add`，不要直接整体提交。

## 6. 建议后续顺序

1. 先补 citation 后验校验和页码 / 章节定位，让“引用可信”更稳。
2. 再补用户行为埋点和 worker 告警，把“可运维、可量化”闭环补起来。
3. 最后再推进 dashboard 向量空间、关系图和脑图，避免可视化先行但底层观测不足。

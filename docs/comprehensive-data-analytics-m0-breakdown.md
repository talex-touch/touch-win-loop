# 综合数据分析模块 M0 详细拆解

更新时间：2026-04-09

## 1. M0 范围

M0 的目标不是一次性交付七个分析功能，而是把“综合数据分析”从概念方案推进到可直接开发的基础工程阶段。

M0 只做四件事：

- 明确分析域的数据模型与类型边界。
- 明确首批分析接口与查询层职责。
- 补齐最小可用的行为事件模型。
- 搭起分析首页骨架，承接后续 M1 功能扩展。

M0 不做：

- PDF / Excel 导出正式交付
- 自定义看板保存
- 完整院校排名体系
- 离线数仓或复杂调度体系

## 2. 现有代码锚点

M0 设计必须贴着当前仓库落位，核心锚点如下：

- 首页总览：
  `app/pages/dashboard.vue`
- Dashboard 数据组织：
  `app/composables/useDashboardWorkspace.ts`
- Dashboard 类型：
  `app/types/dashboard.ts`
- 项目工作区：
  `app/pages/team/[teamId]/project/[projectId].vue`
- 题目对比板存储：
  `server/utils/project-topic-board-store.ts`
- 题目对比板分析逻辑：
  `server/services/ai/topic-board-logic.ts`
- 首页概览接口：
  `server/api/dashboard/overview.get.ts`
- 赛事主数据：
  `server/utils/contest-store.ts`
- 工作区 / 项目可见范围：
  `server/utils/platform-store.ts`
- 数据库建表：
  `server/utils/db.ts`

## 3. 推荐代码落位

遵循 KISS，M0 不建议把分析逻辑继续塞进 `dashboard` 现有 composable 或 `domain.ts` 大文件。

建议新增以下文件：

### 3.1 共享类型

- `shared/types/analytics.ts`

职责：

- 定义分析域类型
- 定义接口输入输出
- 与 `shared/types/domain.ts` 解耦

建议首批类型：

- `AnalyticsRangePreset`
- `AnalyticsDimensionKey`
- `AnalyticsFilterInput`
- `AnalyticsMetricCard`
- `AnalyticsOverviewPayload`
- `AnalyticsContestTrendPoint`
- `AnalyticsContestTrendSeries`
- `AnalyticsAwardFeatureTag`
- `AnalyticsCapabilityRadarItem`
- `AnalyticsPreparationTimelineItem`
- `AnalyticsEventPayload`

### 3.2 后端查询层

- `server/utils/analytics-store.ts`

职责：

- 聚合 `contest_trends`
- 聚合 `project_topic_boards`
- 聚合 `projects / project_members / project_college_bindings / project_advisor_bindings`
- 汇总文档特征与资源类别分布
- 统一承接分析查询逻辑，避免把 SQL 散到多个 API 文件

建议导出的方法：

- `getAnalyticsOverview`
- `getContestTrendAnalysis`
- `getAwardFeatureAnalysis`
- `getCapabilityProfileAnalysis`
- `getPreparationCadenceAnalysis`
- `trackAnalyticsEvent`

### 3.3 后端接口层

新增目录：

- `server/api/analytics`

建议首批接口：

- `server/api/analytics/overview.get.ts`
- `server/api/analytics/trends.get.ts`
- `server/api/analytics/awards.get.ts`
- `server/api/analytics/profile.get.ts`
- `server/api/analytics/preparation.get.ts`
- `server/api/analytics/events.post.ts`

### 3.4 前端页面层

新增目录：

- `app/pages/dashboard/analytics.vue`
- `app/components/analytics`
- `app/composables/useAnalyticsDashboard.ts`
- `app/types/analytics.ts`

建议首批组件：

- `AnalyticsFilterBar.vue`
- `AnalyticsMetricCards.vue`
- `AnalyticsTrendPanel.vue`
- `AnalyticsAwardFeaturePanel.vue`
- `AnalyticsCapabilityPanel.vue`
- `AnalyticsPreparationPanel.vue`
- `AnalyticsDataSourceHint.vue`

## 4. M0 数据模型设计

## 4.1 分析过滤模型

M0 的分析过滤维度建议保持最小集合：

- `workspaceId`
- `projectId`
- `contestId`
- `trackId`
- `rangePreset`
- `year`
- `collegeName`

不建议 M0 就支持任意 SQL 式条件组合，避免过度设计。

建议类型：

```ts
export type AnalyticsRangePreset = '30d' | '90d' | '180d' | '1y' | 'all'

export interface AnalyticsFilterInput {
  workspaceId?: string
  projectId?: string
  contestId?: string
  trackId?: string
  rangePreset?: AnalyticsRangePreset
  year?: number
  collegeName?: string
}
```

## 4.2 指标卡模型

用于分析首页顶部摘要，不与当前 `DashboardSummary` 混用。

```ts
export interface AnalyticsMetricCard {
  id: string
  label: string
  value: string
  deltaText?: string
  tone?: 'neutral' | 'positive' | 'warning'
  hint?: string
}
```

## 4.3 分析总览返回模型

M0 的总览页建议只聚合四块内容：

- 指标卡
- 趋势摘要
- 能力画像摘要
- 获奖特征摘要

```ts
export interface AnalyticsOverviewPayload {
  metrics: AnalyticsMetricCard[]
  topTrends: AnalyticsContestTrendSeries[]
  capabilityRadar: AnalyticsCapabilityRadarItem[]
  topAwardTags: AnalyticsAwardFeatureTag[]
  preparationHighlights: AnalyticsPreparationTimelineItem[]
  dataGaps: string[]
}
```

## 5. 行为事件表设计

## 5.1 新表建议

在 `server/utils/db.ts` 中新增：

```sql
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_name TEXT NOT NULL,
  page_key TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  payload_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

建议索引：

```sql
CREATE INDEX IF NOT EXISTS idx_analytics_events_workspace_created
  ON analytics_events(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_project_created
  ON analytics_events(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created
  ON analytics_events(event_name, created_at DESC);
```

## 5.2 事件命名建议

M0 首批只埋最有价值的事件：

- `contest.open_detail`
- `contest.open_resource`
- `topic_board.generate`
- `topic_board.select_candidate`
- `project.save_settings`
- `project.upload_resource`
- `analytics.open_page`
- `analytics.change_filter`
- `analytics.export_click`

事件分类建议：

- `navigation`
- `analysis`
- `project_action`
- `resource_action`
- `export_action`

## 5.3 事件接入方式

不建议 M0 做全局埋点 SDK。

优先采用页面显式调用：

- 在 `dashboard/analytics.vue` 中发送 `analytics.open_page`
- 在筛选条变更时发送 `analytics.change_filter`
- 在题目板生成后发送 `topic_board.generate`
- 在题目板选择后发送 `topic_board.select_candidate`

这样更容易控制口径，也更符合当前项目复杂度。

## 6. API 设计建议

## 6.1 `GET /analytics/overview`

用途：

- 分析首页首屏聚合

输入：

- `contestId?`
- `trackId?`
- `rangePreset?`
- `year?`

输出：

- `AnalyticsOverviewPayload`

数据来源：

- `contest_trends`
- `project_topic_boards`
- `projects`
- `project_college_bindings`
- `project_resource_documents`

## 6.2 `GET /analytics/trends`

用途：

- 热度趋势与关键词趋势

输入：

- `contestId?`
- `year?`
- `rangePreset?`

输出建议：

- 趋势时间线
- 热门标签列表
- 赛事热度排名

## 6.3 `GET /analytics/awards`

用途：

- 获奖作品特征聚合

输入：

- `contestId?`
- `trackId?`
- `year?`

输出建议：

- 高频标签
- 特征聚类摘要
- 样例资源引用

## 6.4 `GET /analytics/profile`

用途：

- 团队/个人能力画像

输入：

- `workspaceId?`
- `projectId?`
- `contestId?`

输出建议：

- 雷达维度
- 技能缺口
- 推荐方向

## 6.5 `GET /analytics/preparation`

用途：

- 备赛节奏基础分析

输入：

- `projectId?`
- `contestId?`

输出建议：

- 阶段节点
- 当前进度推断
- 风险提示

## 6.6 `POST /analytics/events`

用途：

- 写入行为事件

输入：

- `eventType`
- `eventName`
- `pageKey`
- `entityType`
- `entityId`
- `workspaceId?`
- `projectId?`
- `payload?`

输出：

- `{ success: true }`

## 7. 前端页面拆解

## 7.1 分析首页信息结构

`app/pages/dashboard/analytics.vue` 建议分四屏：

1. 顶部筛选条
2. 指标卡区
3. 左侧主分析区
4. 右侧说明与数据缺口提示区

页面职责：

- 接收路由 query 作为分析筛选条件
- 调用 `useAnalyticsDashboard`
- 管理 loading / empty / error
- 为后续子页面保留导航入口

## 7.2 组件拆解建议

### `AnalyticsFilterBar.vue`

职责：

- 赛事选择
- 赛道选择
- 时间范围选择
- 年份选择

### `AnalyticsMetricCards.vue`

职责：

- 展示总体指标摘要
- 承接后续跳转

### `AnalyticsTrendPanel.vue`

职责：

- 展示热度趋势
- 展示热门关键词

### `AnalyticsAwardFeaturePanel.vue`

职责：

- 展示获奖共性标签
- 展示代表性特征摘要

### `AnalyticsCapabilityPanel.vue`

职责：

- 展示团队能力雷达
- 展示短板建议

### `AnalyticsPreparationPanel.vue`

职责：

- 展示阶段节奏
- 展示延期风险

### `AnalyticsDataSourceHint.vue`

职责：

- 明示当前分析结论来自哪些数据源
- 提示哪些维度仍然缺数据

## 8. 后端查询拆解

`server/utils/analytics-store.ts` 中每个方法尽量只负责一个分析主题。

## 8.1 `getContestTrendAnalysis`

查询来源：

- `contest_trends`
- `contests.hot_score`

逻辑：

- 按年份或时间段汇总热度
- 聚合 `hot_tags`
- 返回可直接画图的数据结构

## 8.2 `getAwardFeatureAnalysis`

查询来源：

- `contest_resources`
- `project_resource_documents`
- 题目板中的 `similarAwards`

逻辑：

- 聚合 `awarded_works`
- 提取高频标题词、摘要词、结构词
- 输出前 N 个特征标签

## 8.3 `getCapabilityProfileAnalysis`

查询来源：

- `project_topic_boards`
- `projects`
- `project_members`
- `project_college_bindings`
- `project_advisor_bindings`

逻辑：

- 统计团队技能覆盖
- 汇总 `teamMatchScore`
- 输出雷达维度与短板项

## 8.4 `getPreparationCadenceAnalysis`

查询来源：

- `contest_timelines`
- `projects.updated_at`
- `project_resources.updated_at`
- `project_resource_documents.preview_status`

逻辑：

- 对齐赛事节点与项目动作时间
- 给出当前阶段判断
- 给出延期风险与建议

## 9. M0 开发顺序

建议严格按以下顺序开发：

### Step 1：补类型

- 新增 `shared/types/analytics.ts`
- 新增 `app/types/analytics.ts`

完成标准：

- 接口输入输出类型可以独立表达
- 不继续污染 `domain.ts`

### Step 2：补数据库

- 在 `server/utils/db.ts` 中新增 `analytics_events`
- 补索引

完成标准：

- 本地启动时能自动建表
- 事件表结构与现有命名风格一致

### Step 3：补查询层

- 新增 `server/utils/analytics-store.ts`
- 先实现 overview 所需查询

完成标准：

- overview 查询不依赖页面层逻辑
- 查询结果结构稳定

### Step 4：补接口层

- 新增 `server/api/analytics/overview.get.ts`
- 新增 `server/api/analytics/events.post.ts`

完成标准：

- 能从前端拉到 overview 数据
- 能成功写入显式事件

### Step 5：补前端分析首页

- 新增 `app/pages/dashboard/analytics.vue`
- 新增基础组件

完成标准：

- 能展示 loading / error / empty / data
- 能通过 query 保持筛选状态

### Step 6：补联动入口

- 在 `app/pages/dashboard.vue` 中新增“综合数据分析”入口
- 可从题目板或项目工作区跳转到分析页

完成标准：

- 首页和项目页都能进入分析页

### Step 7：补验证

- 为 `analytics-store` 增加最小测试
- 为 overview API 增加基本 smoke case

完成标准：

- 至少覆盖空数据、正常数据、缺少筛选参数三类情况

## 10. M0 验收标准

M0 完成后，应满足以下验收条件：

- 项目中存在独立的 `analytics` 类型、查询层与 API 目录。
- 存在可访问的综合数据分析首页骨架。
- 能基于真实赛事与项目数据生成首屏分析摘要。
- 能记录最小行为事件。
- 首页结果明确标注数据缺口，不伪造不存在的数据能力。

## 11. 风险控制

### 11.1 不要在 M0 做导出

导出能力依赖指标稳定与模板稳定，M0 过早接入只会导致后续反复推翻。

### 11.2 不要在 M0 做大而全画像

画像维度只保留 4 到 6 个核心轴，不做几十个标签的大拼盘。

### 11.3 不要把行为事件设计成通用规则引擎

当前阶段用显式事件写入足够，避免引入额外复杂度。

### 11.4 不要把分析查询继续写回页面

所有分析 SQL 与聚合逻辑都应落在 `analytics-store.ts`，页面只负责展示和交互。

## 12. 建议的下一开发动作

如果继续往下做，最合适的下一步不是直接画页面，而是：

1. 新增 `shared/types/analytics.ts`
2. 在 `server/utils/db.ts` 中补 `analytics_events`
3. 新增 `server/utils/analytics-store.ts`
4. 打通 `GET /analytics/overview`
5. 再新建 `app/pages/dashboard/analytics.vue`

这样可以保证前端拿到的是稳定数据结构，而不是占位假数据。

# 综合数据分析模块实施计划

更新时间：2026-04-09

## 1. 目标定位

综合数据分析模块不是独立于当前产品的新系统，而是建立在现有 `Dashboard / Contest / Project / Resource / Topic Board / Feishu Sync` 能力之上的分析层。

目标是把平台内已经沉淀的赛事数据、项目数据、协作数据、文档数据与后续补充的行为数据转化为可解释、可对比、可导出的洞察结果，服务三类核心角色：

- 参赛者：辅助选题、评估团队能力、判断备赛节奏。
- 指导教师：识别团队优势与短板，优化指导策略。
- 平台运营方：识别高价值方向、资源缺口与内容建设优先级。

## 2. 现状基础

当前仓库已经具备以下与本模块直接相关的基础能力：

### 2.1 前台入口与页面容器

- `app/pages/dashboard.vue`
  已存在 Dashboard 聚合入口，当前承载概览、洞察、赛事流、右侧画像与导出按钮。
- `app/components/dashboard/DashboardRightRail.vue`
  已存在“个人竞争力分析”“本周日程”等右侧信息位，可作为分析结果卡片的首批落点。
- `app/pages/team/[teamId]/project/[projectId].vue`
  已存在项目工作区分析能力，包含关键词云、趋势条、题目对比板、能力映射等展示逻辑。

### 2.2 已有数据底座

- 赛事主数据：
  `contests`、`contest_tracks`、`contest_rubrics`、`contest_timelines`、`contest_resources`
- 趋势数据：
  `contest_trends`
- 项目与团队数据：
  `projects`、`project_members`、`project_college_bindings`、`project_advisor_bindings`、`project_contest_bindings`、`project_contest_adaptations`
- 题目对比板：
  `project_topic_boards`、`project_topic_candidates`
- 文档解析与资源处理：
  `project_resource_documents`、`project_resource_document_tasks`
- 外部同步：
  `feishu_bitable_syncs`、`feishu_bitable_sync_items`、`feishu_post_sync_tasks`
- AI 使用统计：
  `ai_usage_ledger`

### 2.3 已有智能分析能力

现有题目对比板逻辑已经具备以下分析结构，可直接复用为综合数据分析模块的算法基础：

- 趋势信号 `trendSignals`
- 获奖相似案例 `similarAwards`
- 证据引用 `evidenceRefs`
- 团队匹配度 `teamMatchScore`
- 团队能力缺口 `teamGapNotes`
- 多维对比矩阵 `compareScores`

## 3. 核心缺口

虽然基础能力较多，但距离“综合数据分析模块”仍有三个关键缺口：

### 3.1 缺少正式的行为数据体系

当前仓库没有可用于分析的用户行为埋点体系，`server/api/pageview.ts` 仅为示例计数接口，不能支撑真实的用户行为分析、漏斗统计和节奏分析。

### 3.2 Dashboard 仍是轻量拼装，不是分析域

当前 `server/api/dashboard/overview.get.ts` 主要是从赛事库和可见项目中一次性拼接：

- 赛事概览
- 热度最高赛事
- 简化版能力分
- 简化版日程

它适合作为“总览首页”，不适合直接承载七类深度分析功能。

### 3.3 导出能力未形成闭环

当前 Dashboard 已有“导出报告”按钮，但仓库中没有面向分析看板的 PDF / Excel 报告生成链路，现有 PDF 相关能力主要用于文档预览、解析与资源处理。

## 4. 功能范围与现有能力映射

## 4.1 竞赛热度与趋势分析

可复用基础：

- `contests.hotScore`
- `contest_trends`
- 赛事资源中的 `track_details`、`judge_guidelines`、`submission_examples`
- Feishu 同步能力，作为后续外部热度数据输入通道

计划输出：

- 热门赛事榜
- 热门技术关键词演变
- 年度/赛季趋势折线
- 不同赛事方向的热度对比

需要补齐：

- 趋势关键词聚合规则
- 时间序列统计接口
- 趋势维度筛选条件（赛事、学科、年份、赛道）

## 4.2 获奖作品特征挖掘

可复用基础：

- `contest_resources` 中的 `awarded_works`、`past_questions`
- `project_resource_documents` 与文档解析结果
- 题目对比板中的 `similarAwards`

计划输出：

- 获奖作品共性标签
- 高频结构特征
- 常见技术路线/创新点
- 赛道维度的获奖样式差异

需要补齐：

- 针对获奖作品资源的结构化抽取任务
- 标签归一化策略
- “作品特征画像”聚合接口

## 4.3 参赛者能力画像分析

可复用基础：

- `projects`
- `project_members`
- `project_college_bindings`
- `project_advisor_bindings`
- 题目对比板中的 `teamMatchScore`、`requiredSkills`、`teamGapNotes`
- 项目工作区现有的关键词云、趋势条、映射行

计划输出：

- 个人/团队能力雷达图
- 技能覆盖率
- 团队短板清单
- 适配题目推荐

需要补齐：

- 画像维度标准化
- 用户级与团队级画像汇总规则
- 画像结果缓存与快照机制

## 4.4 题目难度与完成率分析

可复用基础：

- `contest_tracks`
- `contest_rubrics`
- `contest_timelines`
- `projects.status`
- 项目设置草稿与适配记录

计划输出：

- 赛道难度分层
- 历史完成率
- 常见卡点
- 难度与获奖概率对比

需要补齐：

- “完成”的统一定义
- 任务推进事件与关键节点埋点
- 赛道难度评分模型

## 4.5 地区与院校竞争力分析

可复用基础：

- `project_college_bindings`
- `project_advisor_bindings`
- 赛事/项目绑定关系
- Feishu 同步能力，可作为后续院校结果表输入通道

计划输出：

- 地区分布
- 院校参赛活跃度
- 院校获奖排名
- 学科/院校交叉竞争力图谱

需要补齐：

- 获奖结果中的院校归属字段
- 学校标准名称与地区映射
- 历史获奖结果导入机制

## 4.6 备赛节奏分析

可复用基础：

- `contest_timelines`
- `projects.updated_at`
- `project_resources`
- `project_resource_documents.preview_status`
- 项目工作区中的协作与资源流转能力

计划输出：

- 备赛阶段甘特视图
- 历史节奏模板
- 延误风险提示
- 下一阶段行动建议

需要补齐：

- 关键动作事件埋点
- 阶段状态机
- 节奏偏差识别规则

## 4.7 自定义数据看板与报告导出

可复用基础：

- 现有 Dashboard 布局
- 项目工作区中的多块可视化数据
- 文档/文件处理链路

计划输出：

- 用户可选择指标组件
- 可保存的自定义看板
- PDF / Excel 报告导出

需要补齐：

- 看板配置模型
- 报告模板引擎
- 导出任务与下载链路

## 5. 信息架构建议

遵循 KISS，不建议直接把七个功能全部塞进现有 `dashboard.vue` 首页。

建议采用“两层结构”：

### 5.1 总览层

保留当前 `/dashboard` 作为平台总览入口，继续承担：

- 个性化概览
- 快速洞察
- 热门赛事摘要
- 分析入口导航

### 5.2 深度分析层

新增“综合数据分析”独立页面组，例如：

- `/dashboard/analytics`
- `/dashboard/analytics/trends`
- `/dashboard/analytics/awards`
- `/dashboard/analytics/profile`
- `/dashboard/analytics/reports`

这样做有三个好处：

- 不破坏当前 Dashboard 的首页定位。
- 复用现有 `dashboard` layout 与样式体系。
- 深度分析页面可以拥有自己的筛选、钻取、导出状态，而不污染首页逻辑。

## 6. 数据架构建议

## 6.1 第一阶段坚持实时查询 + 轻量聚合

在数据量还不大时，不建议一开始就引入复杂数仓或离线任务体系。

第一阶段采用：

- 直接查询现有业务表
- 在 `server/utils` 下新增分析查询层
- 对高频结果做服务端聚合与缓存

建议新增：

- `server/utils/analytics-store.ts`
- `server/api/analytics/*`
- `shared/types/analytics.ts`

## 6.2 第二阶段补充行为事件表

为解决“用户行为数据”缺口，建议新增统一事件表，例如：

- `analytics_events`

建议字段：

- `id`
- `workspace_id`
- `project_id`
- `user_id`
- `event_type`
- `event_name`
- `page_key`
- `entity_type`
- `entity_id`
- `payload_json`
- `created_at`

优先埋点事件：

- 打开赛事详情
- 打开资料
- 生成题目对比板
- 选择候选题目
- 保存项目设置
- 上传资料
- 打开导出面板
- 导出报告

## 6.3 第三阶段引入快照表

当统计口径趋于稳定后，再引入快照或汇总表，例如：

- `analytics_contest_snapshots`
- `analytics_team_profiles`
- `analytics_school_rankings`
- `analytics_dashboard_definitions`
- `analytics_report_jobs`

这样可以降低复杂分析对在线查询的压力。

## 7. 分阶段实施计划

## M0：分析域建模与最小数据闭环

目标：把“分析”从零散逻辑变成清晰模块。

任务：

- 梳理统一指标口径与字段映射。
- 抽出分析领域类型定义与服务层。
- 为行为数据设计统一埋点模型。
- 为七个功能建立最小可运行的数据源清单。

交付：

- `analytics` 类型与查询层骨架
- 埋点事件设计
- 指标口径文档

## M1：综合数据分析 V1

目标：先把“能看、能筛、能解释”的版本跑起来。

优先上线功能：

- 竞赛热度与趋势分析
- 获奖作品特征挖掘
- 参赛者能力画像分析
- 备赛节奏分析（基础版）

实现原则：

- 优先复用 `contest_trends`、`project_topic_boards`、`project_resource_documents`
- 首页只保留摘要，深度能力放到新分析页
- 导出先做接口预留，不强行在本阶段完成

交付：

- 分析总览页
- 4 个分析子视图
- 基础筛选与钻取

## M2：能力补齐与结构化沉淀

目标：把“可看”提升为“可决策”。

重点补齐：

- 题目难度与完成率分析
- 地区与院校竞争力分析
- 用户行为事件采集
- 分析指标快照与缓存

交付：

- 统一行为事件埋点
- 院校/地区统计模型
- 难度评分模型
- 更稳定的趋势计算链路

## M3：自定义看板与报告导出

目标：形成完整运营能力。

重点功能：

- 看板组件选择与布局保存
- 报告模板系统
- PDF 导出
- Excel 导出
- 导出记录与异步任务

交付：

- 自定义看板保存
- 异步报告生成
- 下载中心

## 8. 推荐实现顺序

建议严格按以下顺序推进，而不是七个功能并行展开：

1. 先做分析域抽象，避免继续把统计逻辑散落在页面里。
2. 先做趋势、画像、获奖特征三块，因为现有数据最充分。
3. 再补行为埋点，否则“完成率”“节奏分析”会缺少可信依据。
4. 最后做自定义看板与导出，否则会把不稳定指标提前固化。

## 9. 对当前项目结构的落位建议

前端建议：

- 保留 `app/pages/dashboard.vue` 作为概览页
- 新增 `app/pages/dashboard/analytics.vue` 作为分析首页
- 拆分分析组件到 `app/components/analytics/*`
- 复用现有 `dashboard` 样式系统，不另起 layout

后端建议：

- 新增 `server/api/analytics/overview.get.ts`
- 新增 `server/api/analytics/trends.get.ts`
- 新增 `server/api/analytics/awards.get.ts`
- 新增 `server/api/analytics/profile.get.ts`
- 新增 `server/api/analytics/reports/*`
- 新增 `server/utils/analytics-store.ts`

共享类型建议：

- 新增 `shared/types/analytics.ts`
- 避免继续把大量分析类型堆入 `shared/types/domain.ts`

## 10. 风险与约束

### 10.1 数据真实性风险

如果不先补行为埋点，用户行为分析、完成率分析、备赛节奏分析都只能基于间接字段推断，可信度有限。

### 10.2 院校排名数据不足

当前项目具备院校绑定，但缺少稳定的“获奖结果归属”输入，院校竞争力分析必须依赖后续结果导入或同步。

### 10.3 导出能力实现成本较高

仓库当前没有面向报表的 Excel 导出链路，PDF 相关能力主要偏文档处理。报告导出不建议与分析首页首版同时交付。

### 10.4 首页复杂度膨胀风险

如果把七个分析功能全部继续堆在 `/dashboard` 首页，会明显增加维护成本，也会破坏当前“平台总览入口”的定位。

## 11. 验收标准建议

综合数据分析模块首版完成时，至少应满足：

- 能在独立分析页看到趋势、画像、获奖特征三类核心分析。
- 能按赛事、赛道、时间范围、团队维度进行筛选。
- 能从分析结果跳转回赛事详情、项目工作区或资源详情。
- 能解释分析结果来源，避免黑盒分数。
- 能为后续导出、自定义看板和行为分析预留稳定接口。

## 12. 结论

结合当前项目，综合数据分析模块最合适的实施方式不是“从零新建一个大分析系统”，而是：

- 以 `Dashboard` 为总入口
- 以 `analytics` 为独立分析域
- 以 `contest_trends + topic_board + project/resource/document + Feishu Sync` 为首批数据底座
- 以“先数据闭环、再深度分析、最后导出运营化”的顺序推进

这样既能复用现有代码与数据沉淀，也符合当前仓库的演进方向，风险最小、落地最快。

## 13. 关联文档

M0 的详细拆解、代码落位、事件表设计与接口建议见：

- [综合数据分析模块 M0 详细拆解](./comprehensive-data-analytics-m0-breakdown.md)

# 飞书多维同步配置教程

本教程面向管理员，目标是让你从 0 到 1 完成一次“飞书多维主库 -> 平台实体”的同步配置，不需要先理解内部实现。

## 一、先理解 3 个概念

### 1. 同步信息

- 可以理解成“一套飞书多维主库配置”。
- 它对应一个飞书多维主库 `appToken`。
- 这里只保存主库级信息，例如名称、主库来源、主库 URL。

### 2. 同步项

- 可以理解成“主库里的一个子表怎么同步到平台”。
- 真正执行同步的是同步项，不是同步信息。
- 一个同步信息下面可以挂多个同步项，例如：
  - 子表 A 同步竞赛
  - 子表 B 同步赛道
  - 子表 C 同步资料

### 3. 视图

- 视图用于限制“同步哪些记录”。
- 如果一个子表里只有一部分数据要同步，建议先在飞书里建视图，再让同步项只读这个视图。

## 二、飞书侧前置准备

在开始前，请先确认：

1. 飞书开放平台应用已经创建完成。
2. 应用具备多维表格读取权限；如果要回填状态，还需要写入权限。
3. 已在平台“集成中心”完成飞书应用配置。
4. 如果你希望事件增量同步生效，还需要把事件回调配置到：
   - `/api/integrations/feishu/events`
5. 管理员账号具备平台权限：
   - 飞书配置：`role.assign`
   - 多维同步配置与执行：`contest.write`

## 三、推荐的实际配置顺序

这是最稳的一条路径：

1. 新建“同步信息”
2. 在同步信息里新增一个“同步项”
3. 选择子表与视图
4. 查看字段概览，确认系统自动猜测的映射
5. 补齐必要字段
6. 配置回填列
7. 先点“预检”
8. 再手动执行一次
9. 确认飞书侧出现“已同步/失败/跳过”等状态
10. 最后再开启调度

不要一上来就启用定时。先预检、再手动跑一次，最容易定位问题。

补充说明：

- 现在“预检”会直接使用当前 Drawer 里尚未保存的草稿配置。
- 这意味着你可以先调整映射、同步选项、回填列，再立即看预检结果。

## 四、创建同步信息

管理入口：`/admin/integrations/feishu`

### 新建时你只需要做两件事

1. 识别主库来源
2. 起一个能看懂的名字

### 支持两种来源方式

#### 1. URL 识别

- 适合直接粘贴飞书多维链接、Wiki 链接、或者带 `appToken/tableId/viewId` 的文本。
- 解析成功后会自动补齐主库 `appToken`。
- 如果 URL 里已经带了 `tableId/viewId`，系统会把它们当作“待创建同步项草稿”带到后续编辑，不会自动落正式配置。

#### 2. 手动填写

- 适合你已经知道主库 `appToken`。
- `tableId/viewId` 可以先不填，后面在同步项里再选。

### 注意

- 这里的 `appToken` 是“飞书多维主库 ID”。
- 它不是飞书开放平台应用的 `appId`。

## 五、进入同步信息后怎么配

打开同步信息后，页面会先展示：

1. 主库基础信息
2. 如何配置同步项的步骤卡
3. 当前所有同步项列表

### 你应该怎么操作

1. 如果还没有同步项，先点击“新增子表同步项”
2. 选择 `entityType`
3. 选择子表与视图
4. 进入二级 Drawer 做详细配置

## 六、三种同步项的推荐用途

### 1. `contest`

用于把飞书记录同步成平台里的竞赛实体。

#### 最少要确认的字段

- `externalId`
- `name`

#### 常见推荐字段

- `officialUrl`
- `summary`
- `level`
- `organizer`
- `coOrganizer`
- `participantRequirements`
- `teamRule`
- `currentSeason`
- `disciplines`
- `aliases`
- `keywords`
- `recommendedFor`

### 2. `track`

用于把飞书记录同步成平台里的赛道实体。

#### 最少要确认的字段

- `externalId`
- `contestExternalId`
- `name`

#### 常见推荐字段

- `summary`
- `suitableMajors`
- `deliverableTypes`
- `sortOrder`

#### 特别说明

- `contestExternalIdField` 用来把赛道绑定到某个竞赛。
- 如果飞书里没有这列，也可以在“同步选项”里写一个固定 `contestId` 兜底，但这通常只适合临时方案。

### 3. `resource`

用于把飞书记录同步成平台里的资料实体。

#### 最少要确认的字段

- `externalId`
- `title` 或 `name`

#### 常见推荐字段

- `contestExternalId`
- `trackExternalId`
- `summary`
- `content`
- `category`
- `url`
- `sourceType`
- `year`

#### 特别说明

- 如果资料要挂到竞赛或赛道下，请补齐：
  - `contestExternalIdField`
  - `trackExternalIdField`
- “同步选项”里通常还会配：
  - `defaultVisibility`
  - `defaultStatus`
  - `defaultResourceCategory`
  - `defaultResourceAccessLevel`

## 七、字段概览怎么看

选择完子表/视图后，系统会自动拉取字段概览。

字段概览里每一项会展示：

1. 字段名
2. 样本值
3. 样本命中数

建议优先检查：

1. `externalId` 自动匹配是否正确
2. 关联字段是否识别对了
3. 样本值是不是你预期的那一列

如果自动匹配不对，直接在“基础映射”里改即可。

## 八、这三块配置分别是干什么的

### 1. 映射配置

含义：飞书列 -> 平台字段

重点理解：

- `externalIdField` 是主键。
- `contestExternalIdField / trackExternalIdField` 只在需要关联实体时才需要。
- 如果系统已经猜中，你只需要检查并微调。

### 2. 同步选项

含义：同步行为默认值

它不是映射关系。常见用途：

- 给 `track/resource` 提供固定 `contestId`
- 给 `resource` 提供默认可见性、状态、分类、访问级别

### 3. 回填配置

含义：同步完成后要回写飞书哪些列

它不是写平台字段，而是写回飞书列名。

建议至少准备这些回填列：

- 状态
- 同步时间
- 错误摘要
- 原因码
- 平台实体 ID
- runId
- triggerSource

## 九、推荐的飞书字段命名

为了让自动匹配更稳，建议飞书列名尽量接近这些名字：

### 通用

- `external_id`
- `name`
- `title`
- `summary`
- `content`
- `url`

### 关联字段

- `contest_external_id`
- `track_external_id`

### 回填字段

- `sync_status`
- `sync_synced_at`
- `sync_error_message`
- `sync_reason_code`
- `sync_entity_id`
- `sync_run_id`
- `sync_trigger_source`

你也可以用中文列名，但建议保持语义稳定、避免同义词过多。

## 十、回填列怎么建

回填列可以在飞书子表里手动新建，一般建议使用文本列或时间列。

推荐最小集合：

| 用途        | 推荐列名              | 说明                         |
| ----------- | --------------------- | ---------------------------- |
| 状态        | `sync_status`         | 写回 `已同步 / 失败 / 跳过`  |
| 同步时间    | `sync_synced_at`      | 最后一次成功或尝试时间       |
| 错误摘要    | `sync_error_message`  | 最近一次失败摘要             |
| 原因码      | `sync_reason_code`    | 程序识别出的原因码           |
| 平台实体 ID | `sync_entity_id`      | 平台里最终写入的实体 ID      |
| runId       | `sync_run_id`         | 平台运行批次 ID              |
| 触发来源    | `sync_trigger_source` | `manual / event / scheduled` |

## 十一、预检时重点看什么

点击“预检”后，重点关注：

1. `externalId 缺失`
2. `必填缺失`
3. `transform 错误`
4. `回填字段缺失`

如果预检已经报红，不建议直接启用调度。

## 十二、常见报错怎么排

### 1. 字段缺失

表现：预检提示 `missingRequiredField` 或保存后运行失败。

排查：

- 检查飞书列名是否改过
- 检查当前视图是否把字段隐藏了
- 检查映射是否仍指向旧列名

### 2. 无权限

表现：加载字段、读取表、回填状态时报错。

排查：

- 飞书应用是否有多维读取权限
- 如果是回填失败，还要确认写入权限
- 表是否属于当前应用可访问范围

### 3. 关联实体未命中

表现：`track/resource` 同步时无法关联到 contest 或 track。

排查：

- `contestExternalIdField / trackExternalIdField` 是否映射正确
- 关联目标是否已经先同步到平台
- 是否错误依赖了固定 `contestId` 兜底

### 4. 回填字段不存在

表现：主同步成功，但飞书侧没有看到状态更新。

排查：

- 回填配置里填的是飞书列名，不是平台字段名
- 对应列是否真实存在于当前子表
- 视图是否限制了可见列

### 5. 只识别到 Wiki，没拿到主库

表现：URL 解析后只有 Wiki 信息，没有主库 `appToken`。

排查：

- 该 Wiki 节点是否真的挂了多维表
- 当前应用是否能访问这张表
- 可以手动补 `appToken` 再继续

## 十三、推荐实践

1. 一个主库只管一个业务域，避免把完全无关的数据塞到同一套配置里。
2. 一个同步项只负责一种实体类型，不要混用。
3. 先让字段命名稳定，再做自动匹配，会省很多维护成本。
4. 新同步项第一次上线时，必须先“预检 -> 手动运行 -> 看回填结果”。
5. 定时调度只在手动跑通后再开。
6. 如果有筛选需求，优先用飞书视图控制范围，不要靠人工约定。

## 十四、一个最常见的配置闭环

以“竞赛库”举例：

1. 新建同步信息，识别竞赛主库 `appToken`
2. 新增同步项，实体类型选 `contest`
3. 选择 `竞赛库` 子表和一个“待发布”视图
4. 检查字段概览，确认 `external_id -> externalId`、`名称 -> name`
5. 配置回填列：`sync_status / sync_synced_at / sync_error_message / sync_entity_id / sync_run_id`
6. 点击预检，修掉缺失字段
7. 手动执行一次
8. 回到飞书检查记录是否写回“已同步”
9. 确认无误后再打开调度

如果你是第一次配置，建议严格按这个顺序来，不要省略中间步骤。

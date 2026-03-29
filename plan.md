# R1 同批上线方案：飞书迁移闭环 + DSL 规则标注系统

## Summary

1. 同一发布批次交付两条主线：`飞书多层级可视化映射迁移` 与 `DSL 规则标注/执行/发布`。
2. 发布策略采用“冻结窗口一次切换”：短时冻结同步写入，完成迁移、校验、切换、解冻；失败走快照回滚。
3. 规则门禁采用：`severity=error` 阻断发布，`warning/info` 仅提示。
4. 规则治理采用：`草稿-发布双态`，支持回滚到历史发布版本。
5. 规则作用域采用：`global/activity/instance/region/stage/track/policy` 全量七层。

## Implementation Changes

1. 数据模型新增与兼容策略。
2. 新增 `activity_catalog`、`activity_instances`，并将现有 `contests` 映射为 `activity(type=competition)`，保持旧接口兼容。
3. 新增 `source_documents` 统一接入飞书/网页/PDF/人工来源文本与元数据。
4. 新增 `semantic_paths`（语义路径字典），统一 `targetPath` 与上下文字段路径标准。
5. 新增 `rule_definitions`（DSL AST + 元信息）、`rule_bindings`（七层作用域 + priority + 生效区间）、`rule_versions`（draft/published）。
6. 新增 `obligation_definitions`、`obligation_bindings`，支持 checklist 推导。
7. 新增 `rule_annotations`，记录规则与来源字段/文档证据的标注关系。
8. 新增 `feishu_sync_issues`，承载“自动关联失败”人工处理闭环。
9. 保留现有 `feishu_bitable_tasks.mapping_json/options_json`，升级为 `schemaVersion=2` 配置结构，不改表名。

10. 飞书映射引擎升级（v2）。
11. 映射配置改为分层结构：`layers[]` + `fieldBindings[]` + `defaults` + `match`。
12. 层级覆盖顺序固定：`priority desc`，同优先级按特异性 `policy > track > stage > region > instance > activity > global`。
13. 同步时先做 `scope resolution`，再解析绑定并执行转换；缺失关联写入 `feishu_sync_issues`，不再静默跳过。
14. 预检/执行响应扩展 `appliedScopes`、`fieldDiagnostics`、`unmappedFields`、`transformErrors`、`issueCounts`。

15. DSL 规则引擎与标注。
16. DSL 首期算子采用扩展集：比较、逻辑、集合、字符串、日期、数组量词（any/all/none）与存在性/count。
17. 规则编辑保存时做 AST 校验、语义路径校验、类型校验；非法规则不可发布。
18. 引擎输入统一为 `EngineContext(activity/instance/team/submission/policy/now)`。
19. 规则执行产出 `RuleResult(trace)`，包含命中规则、取值路径、比较过程、最终结论。
20. `publish-check` 改为调用规则引擎；现有硬编码发布校验迁移为“系统内置规则包”首版发布数据。

21. Checklist 与发布门禁。
22. obligation 按绑定召回并执行 `when/satisfiedBy`，输出 `completed/missing/optional`。
23. 发布检查输出分层结果：`errors/warnings/info` + `missingChecklist` + `passed`。
24. 发布 API 仅拦截 `error`，并返回阻断规则编码与可读解释。

25. 管理端 UI（可视化）。
26. 飞书页新增“映射向导 + JSON 高级模式”双轨编辑；默认向导，JSON 为兜底。
27. 新增“关联标注工作台”独立页面：待处理问题列表、人工绑定、重放、忽略、审计。
28. 竞赛工作区新增“规则与清单”模块：规则定义、作用域绑定、版本发布、规则标注、模拟预检、生效历史。
29. 规则编辑器支持表达式构建器与 AST 视图切换，所有操作有保存前校验与错误定位。

30. 审计与可追溯。
31. 规则新增/编辑/发布/回滚、映射配置变更、人工标注处理全部写入审计日志。
32. 审计记录至少包含：操作者、对象、变更摘要、前后版本号、生效范围、时间戳。

33. 切换与回滚流程（一次切换）。
34. 切换前：导出快照（任务配置、外部引用、规则版本）、执行迁移脚本、跑全量配置校验与抽样对比报告。
35. 冻结窗口：临时关闭同步写操作（run/resolve），保留只读与预检。
36. 切换后：启用 v2 映射解析器与新规则引擎，执行冒烟预检并解冻。
37. 回滚：恢复快照、回切旧解析器与旧发布校验、重跑关键冒烟。

## Public APIs / Interfaces

1. 类型更新。
2. 新增 `FeishuMappingConfigV2`、`RuleDefinition`、`RuleBinding`、`RuleVersion`、`ObligationDefinition`、`ObligationBinding`、`RuleAnnotation`、`FeishuSyncIssue`、`EngineOutput`。
3. 现有 `FeishuBitableTask.mapping` 从松散对象升级为显式版本化结构（仍通过 JSON 存储）。

4. 新增/扩展接口。
5. `POST /admin/integrations/feishu/bitable-tasks/:id/inspect-fields`。
6. `POST /admin/integrations/feishu/bitable-tasks/:id/validate-config`。
7. `GET /admin/integrations/feishu/link-issues`。
8. `POST /admin/integrations/feishu/link-issues/:id/resolve`。
9. `POST /admin/integrations/feishu/link-issues/:id/ignore`。
10. `GET/POST/PATCH /admin/rules/definitions`。
11. `GET/POST/PATCH /admin/rules/bindings`。
12. `GET/POST /admin/rules/versions`（发布/回滚）。
13. `POST /admin/rules/simulate`。
14. `GET /admin/contests/:id/publish-check` 响应扩展为规则引擎结果结构（保留兼容字段）。

## Test Plan

1. DSL 单元测试：解析、校验、算子语义、空值/类型边界、trace 正确性。
2. 作用域测试：七层绑定召回、优先级冲突、有效期生效与失效。
3. 飞书迁移测试：v1->v2 自动转换正确率、三目标对象（contest/track/resource）行为一致性。
4. 关联闭环测试：无法自动关联进入 issue，人工 resolve 后可重放成功并建立 external_ref。
5. 发布链路测试：error 阻断发布，warning/info 不阻断；旧阻断项在新规则包中行为一致。
6. UI E2E：映射向导、规则编辑、版本发布、模拟预检、标注工作台处理闭环。
7. 切换演练：冻结、切换、解冻、回滚四步在预发全流程通过。

## Assumptions & Defaults

1. 首期与飞书迁移同批上线 DSL，不拆到后续版本。
2. DSL 采用扩展算子集，不再降级到极简实现。
3. 规则作用域首期即开放七层，不分批裁剪。
4. 发布门禁固定为 `error` 阻断。
5. 规则生效固定为 `draft/published` 双态，不做定时生效。
6. 保持现有对外路径尽量不变，以“兼容扩展响应字段”为主，避免前端大面积破坏性改动。

# 当前重构计划：文档、画布与 Intelligence Workflow 收敛

更新时间：2026-04-22

## 目标

把“流程梳理 / 协作文档 / 自由画布 / 资料预览”收敛到一套统一资源模型，避免文档表述、页面入口和实现对象长期错位。

## 已确定模型

### 一等对象

- `ProjectResource` 是项目内唯一一等资料对象。

### 资源形态

- `binary`：上传资料或系统资料库引用
- `markdown`：协作文档
- `draw`：画布

### 协作用途

- `workflow`：流程画布
- `freeform`：自由画布
- `notes`：文档笔记

## 当前阶段进度

1. `Resource` 顶层已显式区分 `collabPurpose`，`POST /projects/:id/resources/collab` 已支持 `purpose` 参数。
2. 服务端已具备“确保项目唯一流程画布存在”的 helper，固定 `flow` tab 与 workflow 资源已打通到同一底层对象。
3. 固定 `flow` tab 已从旧静态 checklist / tldraw 导入面板切到 `draw.io embed`，当前主入口就是流程画布。
4. 流程画布已接入 `workflowSnapshot` 读图能力，来源为 draw.io `autosave/save` 回传 XML，不直接读取 iframe DOM。
5. 右侧 `AgentProto` 已支持 `AI 生成 / AI 补全 / AI 续改 / 调样式` 四类 workflow 草案动作，首期全部走“预览后手动应用”。
6. 当前 apply 边界已锁定为 `单页可写回、多页仅预览`，并通过 `baseWorkflowHash` 阻止过期草案覆盖用户最新画布。
7. draw.io embed 宿主已支持公开配置，workflow 相关单测与 Playwright smoke 夹具已经补齐。
8. `Loopy 数据` 已新增“智能工作流”视图，支持保存线性 workflow、运行历史、审批暂停与 continue 恢复。
9. Intelligence workflow runtime 已复用现有 `executeWorkspaceAi()`、`ai_chat_sessions`、`ai_project_change_requests` 和 provider runner，不再并行维护第二套执行底座。

## 当前约束

- 不新增独立文档中心或画布中心。
- 不做数据库结构迁移，`collabPurpose` 仍通过 `metadata` 落库。
- `ProjectOutline` 继续保持派生视图定位，不承担编辑职责。

## 下一步里程碑

### M1

- 在有可写 PostgreSQL 的环境里跑通完整 `ci:e2e-smoke`，把流程画布 smoke 从“本地夹具可执行”收口到“可复现验收”。

### M2

- 补强 Intelligence workflow 的 step editor 体验：增加更细的 tool input 表单、run 详情抽屉与审批说明，同时继续保持线性 v1 边界。

### M3

- 在 `binary` 预览稳定后，再评估 ONLYOFFICE 等在线 Office 编辑能力接入；与此同时再决定 MCP bridge 是否进入第二阶段。

## 历史归档

旧的 R1 大方案文档已归档到：

- [docs/archive/r1-team-first-dsl-plan.md](./docs/archive/r1-team-first-dsl-plan.md)

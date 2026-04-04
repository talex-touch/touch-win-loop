# 当前重构计划：文档与画布概念收敛

更新时间：2026-04-03

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

## 当前阶段改动

1. `Resource` 顶层新增 `collabPurpose`。
2. `POST /projects/:id/resources/collab` 支持 `purpose` 参数。
3. 服务端新增“确保项目唯一流程画布存在”的 helper。
4. 固定 `flow` tab 改为真实画布视图，不再保留静态 checklist。
5. 左侧资源入口统一为“协作文档 / 自由画布”。
6. README、ADR、信息架构文档与协作模型文档同步重写。

## 当前约束

- 不新增独立文档中心或画布中心。
- 不做数据库结构迁移，`collabPurpose` 仍通过 `metadata` 落库。
- `ProjectOutline` 继续保持派生视图定位，不承担编辑职责。

## 后续里程碑

### M1

- 把流程画布与资源列表、Tab 状态、在线协作状态彻底打通。

### M2

- 为流程画布补充更明确的结构化节点模板与流程引导能力。

### M3

- 在 `binary` 预览稳定后，再评估 ONLYOFFICE 等在线 Office 编辑能力接入。

## 历史归档

旧的 R1 大方案文档已归档到：

- [docs/archive/r1-team-first-dsl-plan.md](./docs/archive/r1-team-first-dsl-plan.md)

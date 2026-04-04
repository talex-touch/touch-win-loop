# 协作资源模型

更新时间：2026-04-03

本文只描述当前已经落地的协作资源规则，不讨论未来 Office 在线编辑能力。

## 1. 模型概览

协作资源由两层字段共同决定：

1. `resourceKind`
2. `collabPurpose`

规则如下：

| resourceKind | collabPurpose | 用户侧名称 | 默认入口 |
| --- | --- | --- | --- |
| `markdown` | `notes` | 协作文档 | 左侧资源菜单 |
| `draw` | `freeform` | 自由画布 | 左侧资源菜单 |
| `draw` | `workflow` | 流程画布 | 左侧“流程”入口 |

## 2. 默认规则

### 普通协作资源创建

- `kind=markdown` 时，默认 `purpose=notes`
- `kind=draw` 时，默认 `purpose=freeform`

### 流程入口创建

- 左侧“流程”入口固定走 `kind=draw + purpose=workflow`
- 服务端会确保当前项目只存在一个 active 的 workflow 画布

## 3. 命名规则

### notes

- 默认前缀：`协作文档`

### freeform

- 默认前缀：`自由画布`

### workflow

- 默认名称：`流程画布`
- 同一项目内不允许存在多个 active workflow 画布，因此不做自由编号扩展

## 4. 页面行为

### 协作文档

- 打开后进入资源 tab
- 左侧显示资源图标和资源元数据
- 中央区为 Markdown 编辑与预览

### 自由画布

- 打开后进入资源 tab
- 中央区为真实画布引擎
- 适合自由讨论、临时结构发散和草图整理

### 流程画布

- 可从固定 `flow` tab 打开
- 也可作为资源出现在资源列表中
- 两个入口最终指向同一条底层资源记录

## 5. 接口约定

### 创建协作资源

`POST /projects/:id/resources/collab`

请求体：

```json
{
  "kind": "markdown | draw",
  "purpose": "workflow | freeform | notes",
  "title": "可选自定义标题"
}
```

约束：

- `markdown` 仅允许 `notes`
- `draw` 仅允许 `workflow` 或 `freeform`

### 返回资源

`Resource` 顶层字段会显式返回：

- `resourceKind`
- `collabPurpose`
- `revision`

客户端不应该再依赖解析裸 `metadata` 才知道资源用途。

## 6. 当前非目标

当前阶段不做：

1. 为协作资源新增独立中心页
2. 引入新的数据库表拆分文档/画布实体
3. 把 `ProjectOutline` 升级为编辑对象

## 7. 一句话结论

当前协作模型的核心原则是：

> `markdown` 和 `draw` 只是资源形态，真正决定用户心智与入口的是 `collabPurpose`。

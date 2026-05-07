# 协作资源模型

更新时间：2026-04-17

本文只描述当前已经落地的协作资源规则，不讨论未来 Office 在线编辑能力。

## 1. 模型概览

协作资源由两层字段共同决定：

1. `resourceKind`
2. `collabPurpose`

规则如下：

| resourceKind | collabPurpose | 用户侧名称 | 默认入口       |
| ------------ | ------------- | ---------- | -------------- |
| `markdown`   | `notes`       | 协作文档   | 左侧资源菜单   |
| `draw`       | `freeform`    | 自由画布   | 左侧资源菜单   |
| `draw`       | `workflow`    | 流程画布   | 左侧“流程”入口 |

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
- 编辑时支持 AI 上下文补齐，基于当前光标附近内容预测后续文本
- 用户按 `Tab` 接受当前补齐建议
- 每次成功接受建议暂按 `0.1 credits` 计入工作空间 AI 配额消耗

### 自由画布

- 打开后进入资源 tab
- 中央区为真实画布引擎
- 适合自由讨论、临时结构发散和草图整理

### 流程画布

- 可从固定 `flow` tab 打开
- 也可作为资源出现在资源列表中
- 两个入口最终指向同一条底层资源记录
- 当前主编辑器为 `draw.io embed`
- draw.io 的读图上下文来自 `autosave/save` 回传 XML，经前端解析为 `workflowSnapshot`
- 右侧 `AgentProto` 已支持 `AI 生成 / AI 补全 / AI 续改 / 调样式` 四类草案动作
- 首期所有 AI 改图都必须先生成草案卡，再由用户手动应用
- 当前只支持单页 workflow 直接 apply；多页资源仍允许分析和预览，但禁止自动写回
- apply 前会校验 `baseWorkflowHash`，如果用户在草案生成后又改过画布，旧草案会失效
- draw.io embed 宿主可通过 `WINLOOP_PUBLIC_DRAWIO_EMBED_BASE_URL` 显式覆盖，默认走 `https://embed.diagrams.net`

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

## 7. AI 补齐计费约定

- 当前只有 `markdown + notes` 形态的协作文档接入 AI 上下文补齐。
- 自动预测本身不直接落正文，只有用户按 `Tab` 接受后才视为一次有效补齐。
- 每次有效补齐暂按 `0.1 credits` 扣减工作空间 AI 配额。

## 8. 一句话结论

当前协作模型的核心原则是：

> `markdown` 和 `draw` 只是资源形态，真正决定用户心智与入口的是 `collabPurpose`。

## 9. 新设计画布（New Host）当前落地进度

当前 `draw + freeform` 设计画布已经以新 `CanvasKit Host` 作为主编辑入口推进，目标是先稳定替代旧 `WorkspaceDesignStage.vue` 的日常设计闭环。

### 已完成

- frame 编辑态内已支持基础图元创建：`rectangle`、`ellipse`、`arrow`、`path`、`text`
- 文本闭环已打通：文本工具创建后立即编辑，双击现有文本可再次编辑，提交仍复用既有元素更新协议
- 元素基础编辑已覆盖：单选拖动、框选多选、单元素 resize、单元素 rotate
- frame 级交互已补齐：frame 选择、拖拽、resize、小地图与 grid guides
- 图片插入已提供双入口：toolbar 本地上传放置、assets 面板“放置到画布”
- 分组能力已落地：`group / ungroup`、group 命中、group 内双击进入编辑态、组拖动
- 元素吸附与参考线已落地：同层 sibling、frame 边界/中心线、`8px` 栅格吸附
- Auto Layout 基础闭环已可用：新元素 append、子元素重排、inspector 参数调整后即时 relayout
- 图层顺序命令已补齐：上移、下移、置顶、置底
- 导出仍沿用现有 Page / Frame 的 PNG / SVG 路径，本轮未改导出协议

### 当前约束

- 当前仍以 frame 内编辑为主，不覆盖跨 frame / page 的自由设计
- auto layout frame 内关闭子元素自由拖动、absolute resize、rotate，改为重排语义
- group 仅支持选择、拖动、层级调整和 ungroup；本轮不支持 group resize / rotate
- `path` 仍未进入节点级编辑，本轮只保留绘制与基础选择

### 暂未纳入本轮

- 布尔运算
- 路径节点编辑
- 元素 resize snap
- 组件 / variant
- 富文本
- 图片裁切
- 跨 frame / 跨 page 吸附

### 维护原则

- 不修改 `SceneDocument`、`DesignElementModel`、`DesignFrameModel` 持久化结构
- 新 Host 继续复用现有 inspector、导出与文档写回协议，不额外引入新的渲染引擎或存储模型
- 后续优先级固定为：元素级更完整的吸附与排版体验，然后再进入海报效率型样式条和路径/布尔运算基础

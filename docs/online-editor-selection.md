# 在线文档编辑选型建议（可落地版）

更新时间：2026-03-19  
适用项目：`touch-win-loop`（Nuxt + Node 服务端）

## 1. 背景与目标

你当前要解决的核心问题不是“做一个编辑器”，而是：

1. 用户上传 `doc/docx/ppt/pptx` 后可在线查看与编辑。
2. 尽量保证格式保真（尤其是 PPT 排版、字体、图片、表格）。
3. 支持多人协作与权限控制。
4. 成本和集成复杂度可控，能在当前项目内快速落地。

## 2. 需求边界（先把范围卡死）

### 2.1 必选（Must Have）

1. `docx/xlsx/pptx` 在线编辑。
2. `doc/ppt/xls` 上传后自动转 `OOXML`（并提示可能存在格式差异）。
3. 基础协作能力：多人编辑、版本历史（至少最近 N 次）、只读/可编辑权限。
4. 与现有账号体系打通（工作区、角色、邀请）。
5. 可私有化部署（避免核心数据外流风险）。

### 2.2 可选（Nice to Have）

1. Markdown 编辑（知识库、技术说明类文档）。
2. 批注、修订、评论流。
3. 审计日志与内容水印。

### 2.3 非目标（当前阶段不做）

1. 追求 `doc/ppt/xls` 100% 像素级还原（不现实）。
2. 自研 Office 渲染/编辑内核（成本过高，不符合 YAGNI）。

## 3. 候选方案

### 3.1 方案 A：ONLYOFFICE Docs（Office 主编辑内核）

定位：面向 `docx/xlsx/pptx` 的在线文档套件，适合做主编辑能力。  
特点：支持文档/表格/演示协作，常见做法为自托管 + 业务系统集成。

优点：

1. 对 Office 场景覆盖完整，PPT/DOC 在线编辑能力成熟。
2. 可私有化部署，便于数据合规控制。
3. 与业务系统通过 API/WOPI 风格集成，工程路径清晰。

注意点：

1. 旧二进制格式（`doc/ppt/xls`）需要先转换成 OOXML 再编辑。
2. 字体、宏、复杂对象在跨引擎时可能有兼容差异。
3. 商业授权与并发规模需要提前核算。

### 3.2 方案 B：Collabora Online（LibreOffice 在线化）

定位：偏开源生态，适合已有 LibreOffice 体系或 Nextcloud 体系团队。

优点：

1. 开源生态友好，私有化可控。
2. Office 文档在线处理能力较全。

注意点：

1. 集成与运维门槛通常不低于方案 A。
2. UI/交互和生态适配需要更强工程投入。

### 3.3 方案 C：Tiptap/ProseMirror（Markdown/富文本内核）

定位：适合知识库、技术文档、说明文档协作；不适合承担 PPT/DOC 高保真主编辑。

优点：

1. 前端扩展性强，自定义能力高。
2. 协作（Yjs）生态成熟。

注意点：

1. `docx/pptx` round-trip 保真弱，不适合做主线 Office 编辑。
2. Word/PPT 导入多为“语义迁移”，不是“版式保真”。

### 3.4 方案 D：Microsoft 365/Google 在线编辑器直连

定位：强能力 SaaS，但通常受平台接入门槛、授权和数据边界约束。

优点：

1. 最强 Office 兼容度（尤其原生生态内）。
2. 用户认知成本低。

注意点：

1. 集成资格/授权/合规条款限制较多，不一定适合通用产品快速落地。
2. 数据驻留和计费模型需要法务与商务提前介入。

## 4. 对比矩阵（1-5 分，5 为最好）

| 维度 | A ONLYOFFICE | B Collabora | C Markdown 内核 | D M365/Google 直连 |
|---|---:|---:|---:|---:|
| Office 格式保真 | 4 | 3.5 | 2 | 4.5-5 |
| PPT 在线编辑能力 | 4 | 3.5 | 1.5 | 5 |
| 私有化与数据可控 | 4.5 | 4.5 | 5 | 2-3 |
| 与现有系统集成可控性 | 4 | 3.5 | 4.5 | 2.5 |
| 落地速度（当前团队） | 4 | 3 | 3.5 | 2 |
| 长期演进空间 | 4 | 4 | 4.5 | 3 |

结论：

1. 若“Office 文档可编辑”是主诉求，优先 A。
2. 若“知识库写作协作”是主诉求，C 很强，但不能替代 A。
3. D 更像特定生态项目，不是当前阶段最稳妥路线。

## 5. 推荐方案（主张）

采用“双轨制”，避免单方案硬扛全部需求：

1. 主轨（业务核心）：`ONLYOFFICE Docs` 处理 `docx/xlsx/pptx` 在线编辑。
2. 辅轨（知识沉淀）：`Tiptap + ProseMirror + Yjs` 处理 Markdown/富文本协作。

为什么是双轨：

1. 符合 KISS：每条链路只做自己擅长的事。
2. 符合 YAGNI：不自研 Office 内核，不做过度抽象。
3. 符合 DRY：统一权限、存储、审计中台，编辑能力按类型分治。
4. 符合 SOLID：编辑引擎通过抽象接口接入，可扩展替换。

## 6. 目标架构（MVP）

### 6.1 服务分层

1. `document-gateway`：统一文档元数据、权限校验、签名 URL、审计。
2. `office-adapter`：对接 ONLYOFFICE，负责会话、回调、版本写回。
3. `markdown-adapter`：对接 Tiptap 协作会话与存储。
4. `convert-worker`：处理 `doc/ppt/xls -> docx/pptx/xlsx` 异步转换。
5. `storage`：对象存储（原始文件、转换文件、快照、版本包）。

### 6.2 核心流程

1. 上传文件 -> 入库元数据 -> 根据扩展名分流。
2. 若为旧格式，进入 `convert-worker`，完成后回写新版本并标记“转换来源”。
3. 前端打开编辑页 -> 后端签发编辑会话 -> 跳转/嵌入对应编辑器。
4. 编辑结束回调 -> 保存新版本 -> 更新审计日志。

### 6.3 与当前仓库结合点

1. 新增服务目录建议：`server/services/document/*`。
2. 新增 API 建议：
   - `POST /api/documents/upload`
   - `POST /api/documents/:id/open-session`
   - `POST /api/documents/:id/convert`
   - `GET /api/documents/:id/versions`
3. 权限复用现有 Workspace 模型，避免重复造权限系统（DRY）。

## 7. 4-6 周落地计划

### 第 1 周：PoC 验证

1. 验证 `docx/pptx/xlsx` 在线编辑闭环。
2. 验证旧格式自动转换链路可用。
3. 输出兼容性基线（20 份真实样本：PPT 10、DOC 10）。

### 第 2-3 周：MVP 开发

1. 打通上传、分流、会话、回调、版本。
2. 接入工作区权限。
3. 完成基础审计日志（打开、编辑、保存、下载）。

### 第 4 周：灰度与稳定性

1. 灰度到内部用户。
2. 监控失败率、保存成功率、回调延迟。
3. 修复高频兼容问题（字体、图片、表格）。

### 第 5-6 周：上线准备

1. 完成 SLO 指标和告警。
2. 补齐异常重试与人工回滚策略。
3. 输出运维手册与应急预案。

## 8. 验收指标（建议）

1. 文件打开成功率 >= 99.5%（`docx/xlsx/pptx`）。
2. 编辑保存成功率 >= 99.0%。
3. 旧格式转换成功率 >= 95%（允许部分样式差异）。
4. 平均首开时延：
   - 小文件（< 5MB）<= 3s
   - 中文件（5-30MB）<= 8s
5. P0 线上故障恢复时间（MTTR）<= 30 分钟。

## 9. 风险清单与应对

1. 格式兼容风险：
   - 应对：建立“高风险模板库”，上线前专项回归；前端明确展示“转换后可能有样式差异”。
2. 字体缺失风险：
   - 应对：统一服务器字体包与替代策略，禁止使用未备案字体模板。
3. 并发与成本风险：
   - 应对：先按活跃并发分级部署，观测后扩容，避免一次性过配。
4. 厂商绑定风险：
   - 应对：设计 `EditorProvider` 抽象接口，核心域模型不与具体厂商耦合。

## 10. 最终建议（一句话）

当前项目建议优先落地：  
`ONLYOFFICE（Office 主编辑） + Tiptap（Markdown 辅编辑）` 双轨方案。  
先解决“可编辑 + 可协作 + 可上线”，再逐步优化“保真与高级能力”。

---

## 附：调研参考（官方文档）

1. ONLYOFFICE Docs API: https://api.onlyoffice.com/docs
2. ONLYOFFICE 二进制格式编辑说明: https://api.onlyoffice.com/docs/docs-api/using-wopi/editing-binary-documents/
3. Microsoft 365 for web 集成概览: https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/online/overview
4. Tiptap Markdown 指南: https://tiptap.dev/docs/editor/markdown/guides/integrate-markdown-in-your-extension
5. Yjs + ProseMirror: https://docs.yjs.dev/ecosystem/editor-bindings/prosemirror

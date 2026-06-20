# 知识检索可信引用微架构图说明

> 本文档配套 `figures/source/F22-hybrid-retrieval-okabe-ito.paper.html`，用于比赛技术答辩、科研图说明和申报材料。图中使用 Okabe-Ito 色盲友好配色，聚焦 AI 小块：Hybrid Retrieval + Evidence Pack。

## 图的定位

这张图不是重新画一张泛化 AI 总架构，而是把已有 F07“混合检索与可溯源引用”和 F16“项目知识上下文与可信引用链路”中的关键机制放大成科研图。它回答一个更尖锐的问题：WinLoop 的 AI 为什么不是普通聊天接壳，而是能给出可复核、可治理、可追溯回答的知识推理链路。

适合放在“AI 内核技术深描”章节中，作为评委追问“RAG 具体怎么做”“引用为什么可信”“资料未索引完成怎么办”时的核心解释图。

## AI 技术知识点：Evidence-Grounded Hybrid Retrieval

这个小块可以翻译成“证据约束的混合检索增强生成”。它不是单纯把相似片段塞进提示词，而是在模型生成前先构造一份结构化证据包。

核心思想是把“相似度”与“可信度”拆开。相似度解决候选片段是否相关，可信度解决片段是否可见、是否 ready、是否来自 stale fallback、是否能在 UI 中形成引用卡片。只有同时满足语义相关和证据可信的片段，才应进入主回答上下文。

## 主链路说明

| 模块                | 作用             | 对应技术点                 | 讲解重点                                               |
| ------------------- | ---------------- | -------------------------- | ------------------------------------------------------ |
| ProjectResource     | 项目资料统一入口 | 资源对象建模               | 所有文件、协作文档、画布和会议沉淀先收敛为项目资源     |
| knowledge_sources   | 索引状态真相源   | source lifecycle           | 记录 ready、stale、failed 等状态，避免前端自行拼接状态 |
| knowledge_chunks    | 检索真相源       | chunking / projection      | 正文、OCR、图片摘要、会议转写统一切成可引用片段        |
| Embedding Space     | 语义向量空间     | text embedding / pgvector  | V1 使用文本投影优先，降低多模态系统复杂度              |
| Query Planner       | 查询规划         | query variants / relations | 把用户问题扩成更稳定的检索意图和候选路径               |
| Candidate Recall    | 双通道召回       | lexical + vector preselect | 词法召回补精确命中，向量预选补语义近邻                 |
| Evidence Normalizer | 证据归一         | permission / ready gate    | 权限、状态、模态、fallback 在进入模型前统一处理        |
| Rerank / Fusion     | 重排融合         | semantic rerank            | 结合相似度、鲜度、来源可信度选择 topK 证据             |
| Context Assembler   | 上下文装配       | summaryText + citations    | 模型拿到的是结构化证据，不是散乱片段                   |
| Answer Payload      | 产品协议输出     | citations / warning        | 回答、引用、warning、usedFallback 一起回流 UI          |

## 为什么用 Okabe-Ito

Okabe-Ito 配色适合科研图和答辩屏幕，因为它对常见色觉差异更友好，也能在打印材料里保持较好的区分度。本图的颜色语义如下：

| 颜色           | 色值      | 图中语义             |
| -------------- | --------- | -------------------- |
| Black          | `#000000` | 用户输入、原始问题   |
| Orange         | `#E69F00` | 查询规划、意图扩展   |
| Sky Blue       | `#56B4E9` | 词法召回、关键词匹配 |
| Bluish Green   | `#009E73` | 向量预选、语义近邻   |
| Yellow         | `#F0E442` | 证据归一、状态解释   |
| Vermillion     | `#D55E00` | 重排融合、风险门控   |
| Reddish Purple | `#CC79A7` | 上下文装配           |
| Blue           | `#0072B2` | 输出协议、引用回流   |

## 90 秒讲稿

WinLoop 的知识问答不是把资料片段简单拼进提示词。我们先把项目资料统一收敛到 ProjectResource，再由 knowledge sources 和 chunks 维护索引状态与引用片段。查询发生时，系统会先做 Query Planner，把用户问题转成更稳定的检索意图，再同时走词法召回和向量预选。

真正关键的是 Evidence Pack。候选片段不会直接进入模型，而是先经过权限过滤、ready 优先、stale fallback、模态标记和重排融合。最终进入模型的是 summaryText、citations、warning、usedFallback 这类结构化上下文。模型输出后，前端也不是只展示一段自然语言，而是同时展示引用卡片和索引风险提示。

所以这条链路的价值不是“AI 能回答”，而是“AI 的回答能解释来源、能指出不完整风险、能被用户回跳复核”。这也是它和普通聊天机器人最核心的区别。

## 可追溯实现依据

- `server/services/ai/project-knowledge-context.ts`
- `server/utils/project-knowledge-store.ts`
- `server/utils/platform-ai-channels.ts`
- `app/components/workspace/WorkspaceAssistantMessageContent.vue`
- `scripts/tests/project-knowledge-query-planner.test.mjs`
- `scripts/tests/project-knowledge-evidence-context.test.mjs`
- `docs/project-knowledge-rag-progress.md`

## 可继续强化的方向

1. 在引用卡片里补页码、章节或画布节点定位，让 citation 更接近“可点击证据路径”。
2. 增加 citation 后验校验，检查模型正文中的关键断言是否真的被证据支持。
3. 对 retrievalPlan、evidencePaths、warning 展示做统计埋点，形成召回质量和资料健康的运营指标。

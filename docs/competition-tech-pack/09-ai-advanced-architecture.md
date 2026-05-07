# AI 深描与高级架构技术文档

> 本文档聚焦比赛讲解里最容易形成技术壁垒的 AI 板块，强调“可治理、可恢复、可追溯、可落地”的系统级智能能力。

## 为什么需要这一层补充

前 8 份文档已经覆盖总体架构、知识索引、工作流、协作与答辩链路，但在比赛答辩里，评委通常还会追问三个更深的问题：第一，为什么这套 AI 不是普通聊天接壳；第二，复杂链路失败后如何恢复与治理；第三，多模态、实时与工作流这些能力如何在一个平台中协同而不是割裂存在。本文档专门回答这三个问题。

## 1. AI 提供商治理与多模型路由

平台不是把单一模型硬塞到所有场景，而是先定义 channel，再按能力、治理规则和成本约束分配 provider 与 model。`workspace_chat`、`project_knowledge`、`knowledge_embedding`、`knowledge_visual_embedding`、`defense_realtime`、`meeting_summary`、`workflow_agent` 等场景拥有不同的输入形态、输出协议和风险边界，因此必须经过统一运行时选择。

这一层的关键价值有三点。第一，避免把“模型是否可用”隐藏在黑盒内部，而是把未配置、降级、fallback、writeBlocked、rebuildRecommended 等状态直接暴露出来。第二，同一团队能根据成本与稳定性调整不同 channel 的 provider，不会因为某个模型异常而拖垮整个平台。第三，比赛讲解时可以明确说明：WinLoop 的 AI 不是“一个模型 + 一个聊天框”，而是“场景感知的智能运行时”。

![AI 提供商治理与多模型路由](./figures/paper/F15-ai-provider-routing-governance.png)

PPT 版：![AI 提供商治理与多模型路由 PPT](./figures/ppt/F15-ai-provider-routing-governance-ppt.png)

## 2. 项目知识上下文与可信引用链路

知识增强链路的重点不是召回得多，而是证据链能否对评委解释清楚。当前项目把 `ProjectResource` 作为知识入口真相源，把 `project_knowledge_sources` 作为索引真相源，把 `project_knowledge_chunks` 作为检索真相源。回答前先构建 `summaryText`、`citations`、`warning` 与 `usedFallback`，再把这些结构化结果回流到前端消息卡片，而不是只把一段自然语言文本输出给用户。

这条链路可以用“资源可见性过滤 -> 多模态文本投影 -> 分块与 embedding -> 词法召回 + 向量预选 -> rerank -> summaryText/citation payload -> 前端引用渲染”来讲。它适合比赛现场回答“为什么你们的 AI 结论可信”“如何避免一本正经胡说八道”这类问题。

![项目知识上下文与可信引用链路](./figures/paper/F16-knowledge-context-citation-chain.png)

PPT 版：![项目知识上下文与可信引用链路 PPT](./figures/ppt/F16-knowledge-context-citation-chain-ppt.png)

## 3. DeepAgent 长任务恢复与检查点

真正的项目智能体很少停留在单轮对话。工作流执行、长任务总结、写操作提案、会议归档这些场景都要求智能体在更长的时间尺度上持续工作。当前项目通过 `contextSnapshot`、`runState`、thread binding、store item 和 checkpoint 组合出“可恢复执行”的底座。当任务命中写操作审核门时，执行链会暂停；用户确认后，再从 checkpoint 继续，而不是整条任务从头重来。

这使平台具备三个比赛级卖点。第一，长任务可以审计。第二，写操作不会因为模型瞬时输出就直接落盘。第三，刷新、断线或中途中断不会让任务上下文丢失。对评委而言，这说明产品已经从“演示级 AI”进入“可用于真实团队协作”的阶段。

![DeepAgent 长任务恢复与检查点](./figures/paper/F17-deepagent-checkpoint-recovery.png)

PPT 版：![DeepAgent 长任务恢复与检查点 PPT](./figures/ppt/F17-deepagent-checkpoint-recovery-ppt.png)

## 4. 多模态视觉投影与统一语义空间

多模态经常被做成多套割裂系统，维护成本高，调试困难。当前仓库采用“文本投影优先”的策略：图片、OCR、视觉摘要、会议转写、流程图快照、网页抓取都先转化为统一文本语义表示，再进入同一个 embedding 空间。这种设计牺牲了一部分纯视觉检索上限，但换来了更低复杂度、更强一致性和更容易解释的语义空间。

Loopy Data 这一层让评委能直观看到知识聚类、关系连线与语义布局，不再只是后台表结构。技术讲解时可以强调：WinLoop 没有为了“多模态”再建一套孤立向量岛，而是选择了可治理、可解释、能快速扩展的统一空间方案。

![多模态视觉投影与统一语义空间](./figures/paper/F18-multimodal-semantic-projection.png)

PPT 版：![多模态视觉投影与统一语义空间 PPT](./figures/ppt/F18-multimodal-semantic-projection-ppt.png)

## 5. 答辩智能体实时音视频推理链路

答辩场景的关键不是“做一个会说话的模型”，而是在真实会议系统之上叠加实时感知与辅助。当前实现保留 LiveKit 作为会议 RTC 真壳，Qwen/Coze realtime 通过 relay 和 bootstrap 进入实时推理层，ASR、turn 管理、摘要和答辩建议则在服务端与前端工作台之间形成闭环。

这条链路非常适合比赛演示，因为它体现了平台对“实时性”的理解不是炫技，而是把音视频采集、鉴权、实时推理、会后沉淀放在同一张系统图里。讲法上建议突出一句话：答辩 AI 依附于真实会议链路运行，而不是脱离业务场景的独立聊天机器人。

![答辩智能体实时音视频推理链路](./figures/paper/F19-defense-realtime-inference-chain.png)

PPT 版：![答辩智能体实时音视频推理链路 PPT](./figures/ppt/F19-defense-realtime-inference-chain-ppt.png)

## 6. 上下文感知工作台助手

右侧 AI 助手的真实价值在于“上下文装配”，而不是统一聊天入口。当前工作台会根据文档、资源、设计画布、流程画布、Loopy Data、答辩工作台等不同 tab，动态装配页面状态、项目资源、知识上下文、场景 prompt 与输出协议。最终回流形态也不同，可能是回答、引用卡片、文档补全、流程草案、设计建议或待确认的 apply 提案。

这部分能够很好地回答“为什么你们的助手比普通 Copilot 更贴近业务”的问题。因为它不是把所有页面都映射成同一种问答，而是把 AI 变成工作台中的上下文执行器。

![上下文感知工作台助手融合架构](./figures/paper/F20-contextual-assistant-fusion.png)

PPT 版：![上下文感知工作台助手融合架构 PPT](./figures/ppt/F20-contextual-assistant-fusion-ppt.png)

## 7. AI 观测与治理闭环

平台级 AI 最终会回到运维能力。当前仓库已经具备 provider 探测、channel 测试、embedding 维度校验、knowledge worker backlog 和 recent failures 监控、warning/fallback 捕获、Sentry 事件上报与后台诊断入口。这意味着平台并不依赖“模型今天刚好工作正常”这一脆弱前提，而是能对异常做定位、告警与修复。

比赛答辩里这一部分很重要，因为它能把“我们用了 AI”升级成“我们具备可规模化运行 AI 的工程能力”。对评委而言，后者的技术含量和落地可信度显著更高。

![AI 观测与治理闭环](./figures/paper/F21-ai-observability-governance.png)

PPT 版：![AI 观测与治理闭环 PPT](./figures/ppt/F21-ai-observability-governance-ppt.png)

## 推荐讲法

如果是 5 分钟以内的技术路演，建议只保留三张补充图：F15 讲场景化路由，F16 讲可信引用，F19 讲实时答辩。这样最容易形成“平台级 AI + 真实竞赛场景”的记忆点。

如果是 10 分钟以上的技术答辩，建议在上述三张基础上继续加入 F17 和 F21，分别证明平台具备长任务恢复能力与 AI 运维治理能力。这样会把“能演示”升级为“能长期运行”。

## 代码与文档依据

- `server/utils/platform-ai-channels.ts`
- `server/utils/ai-runtime.ts`
- `server/services/ai/project-knowledge-context.ts`
- `docs/project-knowledge-rag-progress.md`
- `server/services/admin-ai/orchestrator.ts`
- `server/services/ai/deepagent-factory.ts`
- `server/services/knowledge-vision.ts`
- `server/services/meeting/rtc-provider.ts`
- `server/api/projects/[id]/defense/realtime-sessions/[sessionId]/bootstrap.post.ts`
- `server/api/admin/ai/channels/test.post.ts`
- `server/api/admin/resources/knowledge-worker.get.ts`

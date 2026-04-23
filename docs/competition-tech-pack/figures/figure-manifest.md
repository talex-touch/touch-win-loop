# Figure Manifest

## F01 WinLoop 总体技术架构

- 重点：面向竞赛团队的 AI 作战系统全景
- 论文图：`figures/paper/F01-overall-architecture.png`
- PPT 图：`figures/ppt/F01-overall-architecture-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`01-technical-overview.md`
- 代码与文档依据：`README.md`、`docs/workspace-information-architecture.md`、`app/pages/team/[teamId]/project/[projectId].vue`

## F02 竞赛业务闭环

- 重点：从选赛到答辩的端到端链路
- 论文图：`figures/paper/F02-competition-loop.png`
- PPT 图：`figures/ppt/F02-competition-loop-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`01-technical-overview.md`
- 代码与文档依据：`README.md`、`server/utils/contest-store.ts`、`app/components/workspace/WorkspaceDefenseWorkbench.vue`

## F03 团队优先协作与权限

- 重点：团队、成员、席位、配额和项目可见性
- 论文图：`figures/paper/F03-team-first-permission.png`
- PPT 图：`figures/ppt/F03-team-first-permission-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`05-workspace-resource-collaboration.md`
- 代码与文档依据：`server/utils/team-first.ts`、`server/utils/team-membership-store.ts`、`server/api/teams/[id]/members.get.ts`

## F04 项目资源统一模型

- 重点：资料、文档、画布与协作用途的组合语义
- 论文图：`figures/paper/F04-project-resource-model.png`
- PPT 图：`figures/ppt/F04-project-resource-model-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`05-workspace-resource-collaboration.md`
- 代码与文档依据：`docs/collab-resource-model.md`、`server/api/projects/[id]/resources/collab.post.ts`、`server/utils/project-resource-store.ts`

## F05 智能运行时与场景路由

- 重点：按工作台、知识、答辩和会议分配模型能力
- 论文图：`figures/paper/F05-ai-runtime-routing.png`
- PPT 图：`figures/ppt/F05-ai-runtime-routing-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`02-ai-intelligence-core.md`
- 代码与文档依据：`server/utils/platform-ai-channels.ts`、`server/utils/ai-runtime.ts`、`server/api/user/ai/runtime.get.ts`

## F06 多模态知识索引机制

- 重点：来源、任务、片段、向量与后台任务的执行链
- 论文图：`figures/paper/F06-multimodal-knowledge-index.png`
- PPT 图：`figures/ppt/F06-multimodal-knowledge-index-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`03-multimodal-knowledge-index.md`
- 代码与文档依据：`docs/project-knowledge-rag-progress.md`、`server/utils/project-knowledge-store.ts`、`server/plugins/project-knowledge-worker.ts`

## F07 混合检索与可溯源引用

- 重点：词法召回、向量预选、重排与引用可信链
- 论文图：`figures/paper/F07-hybrid-retrieval-citation.png`
- PPT 图：`figures/ppt/F07-hybrid-retrieval-citation-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`03-multimodal-knowledge-index.md`
- 代码与文档依据：`server/services/ai/project-knowledge-context.ts`、`app/components/workspace/WorkspaceAssistantMessageContent.vue`、`scripts/tests/project-knowledge-focused-regression.test.mjs`

## F08 智能会话持久化

- 重点：上下文快照、运行状态与智能体检查点
- 论文图：`figures/paper/F08-ai-session-persistence.png`
- PPT 图：`figures/ppt/F08-ai-session-persistence-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`02-ai-intelligence-core.md`
- 代码与文档依据：`scripts/migrations/2026-04-21-ai-session-persistence.sql`、`server/services/ai/deepagent-factory.ts`、`server/utils/chat-session-context-store.ts`

## F09 智能工作流第一版

- 重点：定义、运行、步骤与提示/工具/智能体线性编排
- 论文图：`figures/paper/F09-intelligence-workflow-v1.png`
- PPT 图：`figures/ppt/F09-intelligence-workflow-v1-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`04-agent-workflow-runtime.md`
- 代码与文档依据：`docs/intelligence-workflow-v1.md`、`server/services/ai/intelligence-workflow-engine.ts`、`server/utils/project-intelligence-workflow-store.ts`

## F10 数据语义空间

- 重点：知识健康、关系网络、语义空间与工作流入口
- 论文图：`figures/paper/F10-loopy-data-semantic-space.png`
- PPT 图：`figures/ppt/F10-loopy-data-semantic-space-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`03-multimodal-knowledge-index.md`
- 代码与文档依据：`app/components/workspace/WorkspaceLoopyDataTab.vue`、`app/components/workspace/WorkspaceLoopyDataSemanticSpace.client.vue`、`server/api/projects/[id]/knowledge/semantic-layout.get.ts`

## F11 流程/设计画布智能协作

- 重点：画布快照、智能草案与人工确认写回
- 论文图：`figures/paper/F11-canvas-ai-collaboration.png`
- PPT 图：`figures/ppt/F11-canvas-ai-collaboration-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`05-workspace-resource-collaboration.md`
- 代码与文档依据：`docs/collab-resource-model.md`、`app/components/workspace/WorkspaceFlowTab.vue`、`app/components/workspace/design/WorkspaceDesignCanvasKitHost.client.vue`

## F12 答辩实时智能体

- 重点：实时会议、语音识别、评委智能体与总结链路
- 论文图：`figures/paper/F12-defense-realtime-agent.png`
- PPT 图：`figures/ppt/F12-defense-realtime-agent-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`06-defense-meeting-realtime-ai.md`
- 代码与文档依据：`docs/workspace-defense-workbench-progress.md`、`docs/meeting-runtime-setup.md`、`app/components/meeting/ProjectMeetingWebClient.vue`

## F13 飞书数据同步闭环

- 重点：主同步、同步项、样本分页、诊断与回填
- 论文图：`figures/paper/F13-feishu-sync-loop.png`
- PPT 图：`figures/ppt/F13-feishu-sync-loop-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`07-data-integration-admin-ops.md`
- 代码与文档依据：`docs/feishu-bitable-sync-guide.md`、`server/services/feishu/bitable-sync.ts`、`app/components/admin/AdminFeishuBitableSyncEditor.vue`

## F14 部署与可观测闭环

- 重点：数据库、缓存、后台任务、监控与配置加密
- 论文图：`figures/paper/F14-deployment-observability.png`
- PPT 图：`figures/ppt/F14-deployment-observability-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`08-deployment-security-observability.md`
- 代码与文档依据：`README.md`、`server/api/admin/sentry/smoke.post.ts`、`server/utils/platform-ai-config-store.ts`

## F15 AI 提供商治理与多模型路由

- 重点：按场景、能力、成本和治理规则动态选择模型
- 论文图：`figures/paper/F15-ai-provider-routing-governance.png`
- PPT 图：`figures/ppt/F15-ai-provider-routing-governance-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`09-ai-advanced-architecture.md`
- 代码与文档依据：`server/utils/platform-ai-channels.ts`、`server/utils/ai-runtime.ts`、`server/api/user/ai/runtime.get.ts`

## F16 项目知识上下文与可信引用链路

- 重点：资源过滤、混合检索、结构化 citations 和 warning 回流
- 论文图：`figures/paper/F16-knowledge-context-citation-chain.png`
- PPT 图：`figures/ppt/F16-knowledge-context-citation-chain-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`09-ai-advanced-architecture.md`
- 代码与文档依据：`server/services/ai/project-knowledge-context.ts`、`docs/project-knowledge-rag-progress.md`、`app/components/workspace/WorkspaceAssistantMessageContent.vue`

## F17 DeepAgent 长任务恢复与检查点

- 重点：contextSnapshot、runState、checkpoint、审批暂停与恢复续跑
- 论文图：`figures/paper/F17-deepagent-checkpoint-recovery.png`
- PPT 图：`figures/ppt/F17-deepagent-checkpoint-recovery-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`09-ai-advanced-architecture.md`
- 代码与文档依据：`server/services/admin-ai/orchestrator.ts`、`server/services/ai/deepagent-factory.ts`、`server/utils/chat-session-context-store.ts`

## F18 多模态视觉投影与统一语义空间

- 重点：图片、OCR、转写和流程快照汇入统一文本 embedding 空间
- 论文图：`figures/paper/F18-multimodal-semantic-projection.png`
- PPT 图：`figures/ppt/F18-multimodal-semantic-projection-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`09-ai-advanced-architecture.md`
- 代码与文档依据：`server/services/knowledge-vision.ts`、`server/services/knowledge-ai.ts`、`app/components/workspace/WorkspaceLoopyDataSemanticSpace.client.vue`

## F19 答辩智能体实时音视频推理链路

- 重点：LiveKit、ASR、Qwen/Coze realtime、turn 管理和答辩辅助
- 论文图：`figures/paper/F19-defense-realtime-inference-chain.png`
- PPT 图：`figures/ppt/F19-defense-realtime-inference-chain-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`09-ai-advanced-architecture.md`
- 代码与文档依据：`server/services/meeting/rtc-provider.ts`、`server/api/projects/[id]/defense/realtime-sessions/[sessionId]/bootstrap.post.ts`、`server/api/projects/[id]/defense/realtime-sessions/[sessionId]/qwen-relay.get.ts`

## F20 上下文感知工作台助手融合架构

- 重点：按当前 tab 装配资源、知识、场景 prompt 和输出协议
- 论文图：`figures/paper/F20-contextual-assistant-fusion.png`
- PPT 图：`figures/ppt/F20-contextual-assistant-fusion-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`09-ai-advanced-architecture.md`
- 代码与文档依据：`app/components/workspace/WorkspaceRightSidebar.vue`、`app/components/workspace/WorkspaceFlowTab.vue`、`app/components/workspace/design/WorkspaceDesignCanvasKitHost.client.vue`

## F21 AI 观测与治理闭环

- 重点：provider 探测、channel 测试、worker 监控、warning/fallback 与 Sentry
- 论文图：`figures/paper/F21-ai-observability-governance.png`
- PPT 图：`figures/ppt/F21-ai-observability-governance-ppt.png`
- 生成方式：图片模型生成，最终归档为 `paper` / `ppt` PNG
- 关联文档：`09-ai-advanced-architecture.md`
- 代码与文档依据：`server/api/admin/ai/channels/test.post.ts`、`server/api/admin/resources/knowledge-worker.get.ts`、`server/api/admin/sentry/smoke.post.ts`

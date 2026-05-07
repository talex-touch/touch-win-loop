# WinLoop 比赛技术资料包

本目录是一套面向比赛路演、技术评审和文章传播的资料包。交付形态为 Markdown 文档与 PNG 图片，不包含 PPTX 文件。

## 推荐汇报主线

1. 先讲总体架构与竞赛业务闭环，建立“竞赛团队智能作战系统”的定位。
2. 再讲 AI 内核、多模态知识索引和可溯源引用，突出技术壁垒。
3. 继续讲 Intelligence Workflow、Loopy Data、画布 AI 协作和答辩实时智能体，展示系统级智能闭环。
4. 最后讲飞书同步、后台运营、部署安全和可观测性，证明平台可落地、可运行、可治理。

## 技术文档

- [系统总体技术白皮书](./01-technical-overview.md)
- [AI 内核与运行时技术文档](./02-ai-intelligence-core.md)
- [多模态知识索引与可信引用技术文档](./03-multimodal-knowledge-index.md)
- [Intelligence Workflow v1 技术文档](./04-agent-workflow-runtime.md)
- [工作台协作与资源模型技术文档](./05-workspace-resource-collaboration.md)
- [答辩与会议实时智能技术文档](./06-defense-meeting-realtime-ai.md)
- [数据集成与后台运营技术文档](./07-data-integration-admin-ops.md)
- [部署、安全与可观测性技术文档](./08-deployment-security-observability.md)
- [AI 深描与高级架构技术文档](./09-ai-advanced-architecture.md)
- [比赛答辩逐页讲稿](./10-defense-presentation-script.md)
- [评委版技术白皮书（强化版）](./11-judge-technical-whitepaper-plus.md)
- [正式申报材料源稿](./12-application-material.md)
- [正式申报材料 Word 版](./exports/WinLoop-正式申报材料.docx)

## 图像索引

| ID  | 主题                         | 论文/文章图                                                       | PPT 图                                                            | 关联文档                                |
| --- | ---------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------- |
| F01 | WinLoop 总体技术架构         | [paper](./figures/paper/F01-overall-architecture.png)             | [ppt](./figures/ppt/F01-overall-architecture-ppt.png)             | 01-technical-overview.md                |
| F02 | 竞赛业务闭环                 | [paper](./figures/paper/F02-competition-loop.png)                 | [ppt](./figures/ppt/F02-competition-loop-ppt.png)                 | 01-technical-overview.md                |
| F03 | 团队优先协作与权限           | [paper](./figures/paper/F03-team-first-permission.png)            | [ppt](./figures/ppt/F03-team-first-permission-ppt.png)            | 05-workspace-resource-collaboration.md  |
| F04 | 项目资源统一模型             | [paper](./figures/paper/F04-project-resource-model.png)           | [ppt](./figures/ppt/F04-project-resource-model-ppt.png)           | 05-workspace-resource-collaboration.md  |
| F05 | 智能运行时与场景路由         | [paper](./figures/paper/F05-ai-runtime-routing.png)               | [ppt](./figures/ppt/F05-ai-runtime-routing-ppt.png)               | 02-ai-intelligence-core.md              |
| F06 | 多模态知识索引机制           | [paper](./figures/paper/F06-multimodal-knowledge-index.png)       | [ppt](./figures/ppt/F06-multimodal-knowledge-index-ppt.png)       | 03-multimodal-knowledge-index.md        |
| F07 | 混合检索与可溯源引用         | [paper](./figures/paper/F07-hybrid-retrieval-citation.png)        | [ppt](./figures/ppt/F07-hybrid-retrieval-citation-ppt.png)        | 03-multimodal-knowledge-index.md        |
| F08 | 智能会话持久化               | [paper](./figures/paper/F08-ai-session-persistence.png)           | [ppt](./figures/ppt/F08-ai-session-persistence-ppt.png)           | 02-ai-intelligence-core.md              |
| F09 | 智能工作流第一版             | [paper](./figures/paper/F09-intelligence-workflow-v1.png)         | [ppt](./figures/ppt/F09-intelligence-workflow-v1-ppt.png)         | 04-agent-workflow-runtime.md            |
| F10 | 数据语义空间                 | [paper](./figures/paper/F10-loopy-data-semantic-space.png)        | [ppt](./figures/ppt/F10-loopy-data-semantic-space-ppt.png)        | 03-multimodal-knowledge-index.md        |
| F11 | 流程/设计画布智能协作        | [paper](./figures/paper/F11-canvas-ai-collaboration.png)          | [ppt](./figures/ppt/F11-canvas-ai-collaboration-ppt.png)          | 05-workspace-resource-collaboration.md  |
| F12 | 答辩实时智能体               | [paper](./figures/paper/F12-defense-realtime-agent.png)           | [ppt](./figures/ppt/F12-defense-realtime-agent-ppt.png)           | 06-defense-meeting-realtime-ai.md       |
| F13 | 飞书数据同步闭环             | [paper](./figures/paper/F13-feishu-sync-loop.png)                 | [ppt](./figures/ppt/F13-feishu-sync-loop-ppt.png)                 | 07-data-integration-admin-ops.md        |
| F14 | 部署与可观测闭环             | [paper](./figures/paper/F14-deployment-observability.png)         | [ppt](./figures/ppt/F14-deployment-observability-ppt.png)         | 08-deployment-security-observability.md |
| F15 | AI 提供商治理与多模型路由    | [paper](./figures/paper/F15-ai-provider-routing-governance.png)   | [ppt](./figures/ppt/F15-ai-provider-routing-governance-ppt.png)   | 09-ai-advanced-architecture.md          |
| F16 | 项目知识上下文与可信引用链路 | [paper](./figures/paper/F16-knowledge-context-citation-chain.png) | [ppt](./figures/ppt/F16-knowledge-context-citation-chain-ppt.png) | 09-ai-advanced-architecture.md          |
| F17 | DeepAgent 长任务恢复与检查点 | [paper](./figures/paper/F17-deepagent-checkpoint-recovery.png)    | [ppt](./figures/ppt/F17-deepagent-checkpoint-recovery-ppt.png)    | 09-ai-advanced-architecture.md          |
| F18 | 多模态视觉投影与统一语义空间 | [paper](./figures/paper/F18-multimodal-semantic-projection.png)   | [ppt](./figures/ppt/F18-multimodal-semantic-projection-ppt.png)   | 09-ai-advanced-architecture.md          |
| F19 | 答辩智能体实时音视频推理链路 | [paper](./figures/paper/F19-defense-realtime-inference-chain.png) | [ppt](./figures/ppt/F19-defense-realtime-inference-chain-ppt.png) | 09-ai-advanced-architecture.md          |
| F20 | 上下文感知工作台助手融合架构 | [paper](./figures/paper/F20-contextual-assistant-fusion.png)      | [ppt](./figures/ppt/F20-contextual-assistant-fusion-ppt.png)      | 09-ai-advanced-architecture.md          |
| F21 | AI 观测与治理闭环            | [paper](./figures/paper/F21-ai-observability-governance.png)      | [ppt](./figures/ppt/F21-ai-observability-governance-ppt.png)      | 09-ai-advanced-architecture.md          |

## 目录说明

- `figures/paper/`：白底科研机制图，适合技术文章、论文式材料和申报书。
- `figures/ppt/`：16:9 深色路演图，适合直接插入比赛 PPT。
- `figures/source/`：图片模型提示词索引、历史草稿和生成辅助文件。
- `figures/figure-manifest.md`：每张图的主题、用途和代码依据。

## 生成与维护

当前资料包中的最终 PNG 已切换为图片模型生成结果；`figures/source/model-prompt-notes.md` 记录了主题映射与提示词原则。历史生成脚本仍保留在目录中，仅作为草稿辅助，不再代表最终图片来源。补充的 AI 深描文档与 F15-F21 图组以当前目录中的归档结果为准。

正式申报材料的 Word 导出脚本为：

```bash
"/Users/talexdreamsoul/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" \
  "docs/competition-tech-pack/export-application-docx.py"
```

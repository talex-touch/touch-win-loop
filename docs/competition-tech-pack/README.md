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

## 图像索引

| ID | 主题 | 论文/文章图 | PPT 图 | 关联文档 |
| --- | --- | --- | --- | --- |
| F01 | WinLoop 总体技术架构 | [paper](./figures/paper/F01-overall-architecture.png) | [ppt](./figures/ppt/F01-overall-architecture-ppt.png) | 01-technical-overview.md |
| F02 | 竞赛业务闭环 | [paper](./figures/paper/F02-competition-loop.png) | [ppt](./figures/ppt/F02-competition-loop-ppt.png) | 01-technical-overview.md |
| F03 | 团队优先协作与权限 | [paper](./figures/paper/F03-team-first-permission.png) | [ppt](./figures/ppt/F03-team-first-permission-ppt.png) | 05-workspace-resource-collaboration.md |
| F04 | 项目资源统一模型 | [paper](./figures/paper/F04-project-resource-model.png) | [ppt](./figures/ppt/F04-project-resource-model-ppt.png) | 05-workspace-resource-collaboration.md |
| F05 | 智能运行时与场景路由 | [paper](./figures/paper/F05-ai-runtime-routing.png) | [ppt](./figures/ppt/F05-ai-runtime-routing-ppt.png) | 02-ai-intelligence-core.md |
| F06 | 多模态知识索引机制 | [paper](./figures/paper/F06-multimodal-knowledge-index.png) | [ppt](./figures/ppt/F06-multimodal-knowledge-index-ppt.png) | 03-multimodal-knowledge-index.md |
| F07 | 混合检索与可溯源引用 | [paper](./figures/paper/F07-hybrid-retrieval-citation.png) | [ppt](./figures/ppt/F07-hybrid-retrieval-citation-ppt.png) | 03-multimodal-knowledge-index.md |
| F08 | 智能会话持久化 | [paper](./figures/paper/F08-ai-session-persistence.png) | [ppt](./figures/ppt/F08-ai-session-persistence-ppt.png) | 02-ai-intelligence-core.md |
| F09 | 智能工作流第一版 | [paper](./figures/paper/F09-intelligence-workflow-v1.png) | [ppt](./figures/ppt/F09-intelligence-workflow-v1-ppt.png) | 04-agent-workflow-runtime.md |
| F10 | 数据语义空间 | [paper](./figures/paper/F10-loopy-data-semantic-space.png) | [ppt](./figures/ppt/F10-loopy-data-semantic-space-ppt.png) | 03-multimodal-knowledge-index.md |
| F11 | 流程/设计画布智能协作 | [paper](./figures/paper/F11-canvas-ai-collaboration.png) | [ppt](./figures/ppt/F11-canvas-ai-collaboration-ppt.png) | 05-workspace-resource-collaboration.md |
| F12 | 答辩实时智能体 | [paper](./figures/paper/F12-defense-realtime-agent.png) | [ppt](./figures/ppt/F12-defense-realtime-agent-ppt.png) | 06-defense-meeting-realtime-ai.md |
| F13 | 飞书数据同步闭环 | [paper](./figures/paper/F13-feishu-sync-loop.png) | [ppt](./figures/ppt/F13-feishu-sync-loop-ppt.png) | 07-data-integration-admin-ops.md |
| F14 | 部署与可观测闭环 | [paper](./figures/paper/F14-deployment-observability.png) | [ppt](./figures/ppt/F14-deployment-observability-ppt.png) | 08-deployment-security-observability.md |

## 目录说明

- `figures/paper/`：白底科研机制图，适合技术文章、论文式材料和申报书。
- `figures/ppt/`：16:9 深色路演图，适合直接插入比赛 PPT。
- `figures/source/`：HTML 源文件和生成脚本，便于后续维护。
- `figures/figure-manifest.md`：每张图的主题、用途和代码依据。

## 生成与维护

如需重新生成，请在仓库根目录执行：

```bash
node "docs/competition-tech-pack/generate-tech-pack.mjs"
```

脚本只写入 `docs/competition-tech-pack/`，不修改应用运行时代码、数据库或 git 状态。

import type { TopicProposal, TopicProposalItem } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { findContestById, findTrackById } from '~~/server/data/catalog'
import { fail, ok } from '~~/server/utils/api'
import { readRuntimeSettings } from '~~/server/utils/env'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const body = await readBody<{ contestId?: string, trackId?: string, major?: string }>(event)

  const contest = body.contestId ? findContestById(body.contestId) : undefined
  const track = body.contestId && body.trackId ? findTrackById(body.contestId, body.trackId) : undefined

  if (!contest || !track) {
    return fail('contestId 或 trackId 无效', {
      startedAt,
      provider: runtime.ai.provider,
      model: runtime.ai.model,
      fallbackUsed: true,
      attempts: 1,
    }, 40001)
  }

  const major = body.major || '目标专业'

  const proposals: TopicProposalItem[] = [
    {
      title: `${track.name}：${major} 智能辅导决策平台`,
      reason: '结合竞赛评分口径与专业能力，具备可展示的工程成果。',
      innovationPoints: ['评分维度反向驱动迭代', '任务分解可追踪'],
      techRouteSteps: ['定义问题边界', '设计数据结构', '实现核心流程', '构建可视化评审面板'],
      scoringMapping: ['创新性', '可行性', '表达规范'],
      risks: ['数据样本不足', '时间排期冲突'],
      references: ['竞赛官网评分细则', '往届优秀作品关键词'],
    },
    {
      title: `${track.name}：竞赛资料智能检索与答辩演练`,
      reason: '从资料管理到答辩训练形成闭环，展示完整产品思路。',
      innovationPoints: ['多角色评委模拟', '结构化缺口识别'],
      techRouteSteps: ['聚合资料索引', '构建问答流程', '生成答辩清单'],
      scoringMapping: ['应用价值', '证据与数据'],
      risks: ['外部链接失效', '演示复杂度过高'],
      references: ['竞赛 FAQ', '行业最佳实践'],
    },
    {
      title: `${track.name}：${major} 项目质量评审助手`,
      reason: '聚焦“可执行修改清单”，直连竞赛交付目标。',
      innovationPoints: ['章节级建议生成', '工作量分级排期'],
      techRouteSteps: ['加载 rubric', '执行多维评估', '输出改进计划'],
      scoringMapping: ['可行性', '表达规范', '应用价值'],
      risks: ['评审口径偏差', '指标定义不清'],
      references: ['往届评审意见', '主办方评分标准'],
    },
  ]

  const data: TopicProposal = {
    id: randomUUID(),
    contestId: contest.id,
    trackId: track.id,
    createdAt: new Date().toISOString(),
    proposals,
  }

  return ok(data, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: true,
    attempts: 1,
  })
})

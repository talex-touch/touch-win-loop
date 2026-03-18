import type { ReviewReport } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { findContestById, findTrackById } from '~~/server/data/catalog'
import { fail, ok } from '~~/server/utils/api'
import { readRuntimeSettings } from '~~/server/utils/env'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const body = await readBody<{ contestId?: string, trackId?: string, text?: string }>(event)

  const contest = body.contestId ? findContestById(body.contestId) : undefined
  const track = body.contestId && body.trackId ? findTrackById(body.contestId, body.trackId) : undefined
  const rawText = (body.text || '').trim()

  if (!contest || !track)
    return fail('contestId 或 trackId 无效', { startedAt, provider: runtime.ai.provider, model: runtime.ai.model, fallbackUsed: true, attempts: 1 }, 40002)

  const baseScore = Math.max(58, Math.min(90, Math.round(60 + rawText.length / 25)))

  const report: ReviewReport = {
    id: randomUUID(),
    contestId: contest.id,
    trackId: track.id,
    totalScore: baseScore,
    dimensionScores: [
      { role: '学术规范评委', score: Math.max(50, baseScore - 4), comment: '结构完整但证据链需进一步强化。' },
      { role: '创新价值评委', score: Math.max(52, baseScore - 2), comment: '亮点明确，建议补充差异化对比。' },
      { role: '专业评委', score: baseScore, comment: '技术路线可行，建议增加关键指标定义。' },
      { role: '表达规范评委', score: Math.max(55, baseScore - 3), comment: '图表与文字的一致性仍有提升空间。' },
      { role: '综合评委', score: Math.max(56, baseScore - 1), comment: '优先聚焦可验证成果，提升答辩稳定性。' },
    ],
    topPriorities: [
      '补齐核心指标定义与计算口径。',
      '增加实验对照或竞品对比证据。',
      '优化结论页与价值页，突出成果闭环。',
    ],
    chapterSuggestions: [
      { chapter: '摘要', suggestions: ['突出问题-方案-结果链路', '增加量化成果一句话总结'] },
      { chapter: '方法', suggestions: ['补充数据来源说明', '明确关键参数与实验配置'] },
      { chapter: '结果', suggestions: ['增加对照组', '展示失败案例与改进过程'] },
    ],
    actionItems: [
      { task: '补充指标口径与计算说明', workload: 'low' },
      { task: '完善实验对照和结果可视化', workload: 'medium' },
      { task: '重构答辩故事线与演示脚本', workload: 'high' },
    ],
    riskWarnings: ['存在“结论先行、证据不足”的风险', '交付物中技术细节与口头陈述可能不一致'],
    createdAt: new Date().toISOString(),
  }

  return ok(report, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: true,
    attempts: 1,
  })
})

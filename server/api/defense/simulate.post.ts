import type { DefenseSession } from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { findContestById, findTrackById } from '~~/server/data/catalog'
import { fail, ok } from '~~/server/utils/api'
import { readRuntimeSettings } from '~~/server/utils/env'

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const runtime = readRuntimeSettings(event)
  const body = await readBody<{ contestId?: string, trackId?: string, strictness?: 'normal' | 'strict', rounds?: number }>(event)

  const contest = body.contestId ? findContestById(body.contestId) : undefined
  const track = body.contestId && body.trackId ? findTrackById(body.contestId, body.trackId) : undefined

  if (!contest || !track)
    return fail('contestId 或 trackId 无效', { startedAt, provider: runtime.ai.provider, model: runtime.ai.model, fallbackUsed: true, attempts: 1 }, 40003)

  const strictness = body.strictness || 'normal'
  const rounds = Math.max(1, Math.min(5, body.rounds || 3))

  const topQuestions = [
    `你们方案相较于现有方案的核心差异是什么？`,
    `为什么选择 ${track.name} 作为切入点，而不是其他赛道？`,
    '关键指标如何定义？是否有客观可复现的计算方式？',
    '若核心数据不可得，方案如何降级仍能完成演示？',
    '你们的结论是否存在样本偏差？如何证明结果稳定？',
    '若评委质疑创新点“只是功能叠加”，你将如何回应？',
    '技术路线中风险最高的一步是什么？应对策略是什么？',
    '项目落地后，如何衡量真实应用价值？',
    '团队分工如何保证在截止日前完成高质量交付？',
    `请在 ${strictness === 'strict' ? '30 秒内' : '90 秒内'} 给出最有说服力的总结陈述。`,
  ]

  const data: DefenseSession = {
    id: randomUUID(),
    contestId: contest.id,
    trackId: track.id,
    topQuestions,
    answer30s: [
      '结论：我们解决的是高频、可量化、可复现的问题。',
      '依据：已有实验数据和对照分析支撑。',
      '方案：采用可落地的分阶段实施路线。',
      '指标：覆盖准确率、效率和用户价值三类关键指标。',
      '风险：已准备数据不足与资源受限两套降级方案。',
    ],
    answer90s: [
      '先明确问题背景与目标人群，再给出现有方案痛点。',
      '说明核心创新点与技术路线，并展示阶段性结果。',
      '补充对照实验、边界条件与失败案例复盘。',
      '给出落地路径、成本收益估算和后续迭代方向。',
    ],
    materialGaps: [
      '缺可复现的数据采样过程说明',
      '缺竞品对比基线和评价标准',
      '缺落地场景中成本与收益测算',
      `建议至少完成 ${rounds} 轮模拟答辩并记录修订项`,
    ],
    createdAt: new Date().toISOString(),
  }

  return ok(data, {
    startedAt,
    provider: runtime.ai.provider,
    model: runtime.ai.model,
    fallbackUsed: true,
    attempts: 1,
  })
})

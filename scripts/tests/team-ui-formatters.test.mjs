import assert from 'node:assert/strict'
import { it } from 'vitest'
import {
  formatPreciseDateTime,
  formatProjectContestSummary,
  formatRelativeUpdatedAt,
  resolveUserAvatarFallback,
} from '../../app/composables/team-ui.ts'

it('相对更新时间覆盖秒分时天周月与日期分支', () => {
  const base = new Date(2026, 3, 8, 12, 0, 0)
  const now = base.getTime()

  assert.equal(formatRelativeUpdatedAt(new Date(now - 30 * 1000).toISOString(), now), '30 秒前更新')
  assert.equal(formatRelativeUpdatedAt(new Date(now - 5 * 60 * 1000).toISOString(), now), '5 分钟前更新')
  assert.equal(formatRelativeUpdatedAt(new Date(now - 3 * 60 * 60 * 1000).toISOString(), now), '3 小时前更新')
  assert.equal(formatRelativeUpdatedAt(new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(), now), '2 天前更新')
  assert.equal(formatRelativeUpdatedAt(new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString(), now), '2 周前更新')
  assert.equal(formatRelativeUpdatedAt(new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString(), now), '1 个月前更新')
  assert.equal(formatRelativeUpdatedAt(new Date(2026, 0, 5, 10, 0, 0).toISOString(), now), '1 月 5 日更新')
  assert.equal(formatRelativeUpdatedAt(new Date(2025, 2, 11, 9, 0, 0).toISOString(), now), '2025 年 3 月更新')
})

it('精确时间格式化到秒，并提供头像和比赛摘要回退', () => {
  const precise = new Date(2026, 3, 8, 3, 4, 5)

  assert.equal(formatPreciseDateTime(precise.toISOString()), '2026-04-08 03:04:05')
  assert.equal(resolveUserAvatarFallback('john_doe'), 'JD')
  assert.equal(resolveUserAvatarFallback('张三丰'), '张三')
  assert.equal(formatProjectContestSummary([]), '暂未绑定比赛')
  assert.equal(formatProjectContestSummary(['中国国际大学生创新大赛']), '中国国际大学生创新大赛')
  assert.equal(formatProjectContestSummary(['A 赛', 'B 赛', 'C 赛']), 'A 赛 +2 个比赛')
})

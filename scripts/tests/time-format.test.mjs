import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'

const timeFormatModuleUrl = pathToFileURL(resolve(process.cwd(), 'app/utils/time-format.ts')).href

it('time 相对时间覆盖分钟、月份、年份和超过一年绝对时间', async () => {
  const { formatRelativeTime } = await import(timeFormatModuleUrl)
  const now = new Date('2026-05-05T12:00:00.000+08:00').getTime()

  assert.equal(formatRelativeTime(new Date('2026-05-05T11:59:00.000+08:00'), now), '1 分钟前')
  assert.equal(formatRelativeTime(new Date('2026-04-05T12:00:00.000+08:00'), now), '上个月')
  assert.equal(formatRelativeTime(new Date('2026-02-05T12:00:00.000+08:00'), now), '3 个月以前')
  assert.equal(formatRelativeTime(new Date('2025-05-05T12:00:00.000+08:00'), now), '1 年前')
  assert.equal(formatRelativeTime(new Date('2025-05-04T11:59:00.000+08:00'), now), '2025-05-04 11:59')
})

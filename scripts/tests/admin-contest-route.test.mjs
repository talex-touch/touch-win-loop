import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fromDatetimeLocal, toDatetimeLocal } from '../../app/composables/useAdminContestRoute.ts'

const ADMIN_CONTEST_ROUTE_FILE = resolve(process.cwd(), 'app/composables/useAdminContestRoute.ts')

describe('useAdminContestRoute helpers', () => {
  it('在上海时区与 ISO 时间之间双向转换', () => {
    expect(fromDatetimeLocal('2026-04-09T10:30')).toBe('2026-04-09T02:30:00.000Z')
    expect(toDatetimeLocal('2026-04-09T02:30:00.000Z')).toBe('2026-04-09T10:30')
  })

  it('遇到空值或非法值时安全回退', () => {
    expect(fromDatetimeLocal('')).toBeNull()
    expect(fromDatetimeLocal('not-a-date')).toBeNull()
    expect(toDatetimeLocal('')).toBe('')
    expect(toDatetimeLocal('not-a-date')).toBe('')
  })
})

it('admin contest route composable 暴露统一上下文与 embed helper', async () => {
  const source = await readFile(ADMIN_CONTEST_ROUTE_FILE, 'utf8')

  assert.match(source, /const contestId = computed\(/, '缺少 contestId 统一上下文')
  assert.match(source, /const trackId = computed\(/, '缺少 trackId 统一上下文')
  assert.match(source, /const timelineId = computed\(/, '缺少 timelineId 统一上下文')
  assert.match(source, /const rubricId = computed\(/, '缺少 rubricId 统一上下文')
  assert.match(source, /const resourceId = computed\(/, '缺少 resourceId 统一上下文')
  assert.match(source, /const isEmbedMode = computed\(/, '缺少 embed 模式上下文')
  assert.match(source, /function withEmbed\(path: string\)/, '缺少 withEmbed 统一 helper')
  assert.match(source, /fromDatetimeLocal/, '缺少 datetime local 转换 helper')
  assert.match(source, /toDatetimeLocal/, '缺少 datetime local 转换 helper')
})

import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  CONTEST_MANUAL_PRESERVED_FIELDS,
  mergeContestManualPreservedFields,
} from '../../server/utils/release-contest-preservation.ts'

function buildContest(overrides = {}) {
  return {
    externalId: 'contest_ext_preserve',
    name: '人工字段保留测试竞赛',
    level: 'national',
    officialUrl: 'https://example.test/preserve',
    summary: '用于验证竞赛库同步不会清空人工维护字段。',
    disciplines: ['计算机'],
    keywords: ['保留'],
    recommendedFor: ['高校学生'],
    visibility: 'internal',
    ...overrides,
  }
}

describe('release contest manual field preservation', () => {
  it('源表缺失人工字段时从现有竞赛快照保留并返回 preservedFields', () => {
    const current = buildContest({
      organizer: '主办单位',
      coOrganizer: '协办单位',
      participantRequirements: '全国高校学生',
      teamRule: '每队 3-5 人',
      currentSeason: '2026',
    })
    const incoming = buildContest({
      summary: '飞书竞赛库同步摘要。',
    })

    const result = mergeContestManualPreservedFields(incoming, current)

    assert.equal(result.contest.organizer, '主办单位')
    assert.equal(result.contest.coOrganizer, '协办单位')
    assert.equal(result.contest.participantRequirements, '全国高校学生')
    assert.equal(result.contest.teamRule, '每队 3-5 人')
    assert.equal(result.contest.currentSeason, '2026')
    assert.deepEqual(result.preservedFields, [...CONTEST_MANUAL_PRESERVED_FIELDS])
  })

  it('源表显式给出空人工字段时不从现有值回填', () => {
    const current = buildContest({
      organizer: '主办单位',
      coOrganizer: '协办单位',
      participantRequirements: '全国高校学生',
      teamRule: '每队 3-5 人',
      currentSeason: '2026',
    })
    const incoming = buildContest({
      organizer: '',
      coOrganizer: '',
      participantRequirements: '',
      teamRule: '',
      currentSeason: '',
    })

    const result = mergeContestManualPreservedFields(incoming, current)

    assert.equal(result.contest.organizer, '')
    assert.equal(result.contest.coOrganizer, '')
    assert.equal(result.contest.participantRequirements, '')
    assert.equal(result.contest.teamRule, '')
    assert.equal(result.contest.currentSeason, '')
    assert.deepEqual(result.preservedFields, [])
  })
})

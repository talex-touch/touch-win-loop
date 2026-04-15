import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, it } from 'vitest'

const TARGET_FILE = pathToFileURL(resolve(process.cwd(), 'server/utils/defense-persona-preset-store.ts')).href

async function loadModule() {
  return import(TARGET_FILE)
}

function createPreset(overrides = {}) {
  return {
    id: 'preset_default',
    externalId: 'persona-default',
    contestExternalId: 'contest-2026',
    trackExternalId: null,
    syncItemId: 'sync-item-1',
    judgeType: 'technical',
    name: '技术评委',
    summary: '默认技术向评委',
    systemPrompt: '请从技术实现与可行性角度提问。',
    focusAreas: ['实现', '可行性'],
    scoringRubric: [],
    enabled: true,
    sortOrder: 0,
    metadata: {},
    createdByUserId: 'user-1',
    updatedByUserId: 'user-1',
    createdAt: '2026-04-15T00:00:00.000Z',
    updatedAt: '2026-04-15T00:00:00.000Z',
    ...overrides,
  }
}

describe('defense-persona-preset-store', () => {
  it('导入选择优先使用赛道级预设，没有赛道级时回退到比赛级', async () => {
    const { pickDefensePersonaPresetsForImport } = await loadModule()
    const contestLevel = createPreset({
      id: 'contest-level',
      externalId: 'persona-contest',
      name: '比赛通用评委',
      sortOrder: 10,
    })
    const trackLevelA = createPreset({
      id: 'track-level-a',
      externalId: 'persona-track-a',
      trackExternalId: 'track-a',
      name: '赛道 A 评委',
      sortOrder: 2,
    })
    const trackLevelB = createPreset({
      id: 'track-level-b',
      externalId: 'persona-track-b',
      trackExternalId: 'track-b',
      name: '赛道 B 评委',
      sortOrder: 1,
    })

    assert.deepEqual(
      pickDefensePersonaPresetsForImport({
        presets: [contestLevel, trackLevelA, trackLevelB],
        trackExternalId: 'track-b',
      }).map(item => item.externalId),
      ['persona-track-b'],
    )

    assert.deepEqual(
      pickDefensePersonaPresetsForImport({
        presets: [contestLevel, trackLevelA],
        trackExternalId: 'track-missing',
      }).map(item => item.externalId),
      ['persona-contest'],
    )

    assert.deepEqual(
      pickDefensePersonaPresetsForImport({
        presets: [trackLevelA, contestLevel],
      }).map(item => item.externalId),
      ['persona-contest'],
    )
  })

  it('从预设构造项目导入草稿时保留 preset source key 与启用状态', async () => {
    const { buildDefensePersonaImportDraftsFromPresets } = await loadModule()
    const drafts = buildDefensePersonaImportDraftsFromPresets({
      presets: [
        createPreset({
          id: 'preset-business',
          externalId: 'persona-icpc-2',
          judgeType: 'custom',
          name: 'ICPC · 人设2',
          enabled: false,
          sortOrder: 20,
        }),
        createPreset({
          id: 'preset-technical',
          externalId: 'persona-icpc-1',
          judgeType: 'custom',
          name: 'ICPC · 人设1',
          sortOrder: 5,
        }),
      ],
      sourceContestId: 'contest-live-1',
      sourceTrackId: 'track-live-2',
    })

    assert.deepEqual(
      drafts.map(item => ({
        sourceTemplateKey: item.sourceTemplateKey,
        judgeType: item.judgeType,
        enabled: item.enabled,
        sortOrder: item.sortOrder,
      })),
      [
        {
          sourceTemplateKey: 'preset:persona-icpc-1',
          judgeType: 'custom',
          enabled: true,
          sortOrder: 5,
        },
        {
          sourceTemplateKey: 'preset:persona-icpc-2',
          judgeType: 'custom',
          enabled: false,
          sortOrder: 20,
        },
      ],
    )
    assert.deepEqual(drafts.map(item => item.sourceContestId), ['contest-live-1', 'contest-live-1'])
    assert.deepEqual(drafts.map(item => item.sourceTrackId), ['track-live-2', 'track-live-2'])
  })
})

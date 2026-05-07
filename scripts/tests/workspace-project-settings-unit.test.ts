import { describe, expect, it } from 'vitest'

describe('useWorkspaceProjectSettings', () => {
  it('初始化时会创建可用的 adaptation 草稿表单', async () => {
    const { useWorkspaceProjectSettings } = await import('~/composables/useWorkspaceProjectSettings')

    const settings = useWorkspaceProjectSettings()

    expect(settings.projectSettingsAdaptation.contestId).toBe('')
    expect(settings.projectSettingsAdaptation.trackId).toBe('')
    expect(settings.projectSettingsAdaptation.problemStatement).toBe('')
    expect(settings.projectSettingsAdaptation.summary).toBe('')
  })
})

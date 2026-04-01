import type {
  FeishuBitableSyncItemEntityType,
  FeishuBitableWritebackConfig,
} from '../types/domain'

export interface FeishuDefaultSyncItemConfig {
  mapping: Record<string, unknown>
  options: Record<string, unknown>
  writeback: FeishuBitableWritebackConfig
}

function buildDefaultWriteback(): FeishuBitableWritebackConfig {
  return {
    enabled: true,
    fields: {
      status: '',
      syncedAt: '',
      errorMessage: '',
      reasonCode: '',
      entityId: '',
      runId: '',
      triggerSource: '',
    },
    values: {
      success: '已同步',
      failed: '失败',
      skipped: '跳过',
    },
  }
}

export function buildDefaultSyncItemConfig(entityType: FeishuBitableSyncItemEntityType): FeishuDefaultSyncItemConfig {
  if (entityType === 'contest') {
    return {
      mapping: {
        externalIdField: '',
        fieldMap: {
          name: '',
          officialUrl: '',
          summary: '',
          level: '',
          organizer: '',
          coOrganizer: '',
          participantRequirements: '',
          teamRule: '',
          currentSeason: '',
          disciplines: '',
          aliases: '',
          keywords: '',
          recommendedFor: '',
        },
      },
      options: {},
      writeback: buildDefaultWriteback(),
    }
  }

  if (entityType === 'track') {
    return {
      mapping: {
        externalIdField: '',
        contestExternalIdField: '',
        fieldMap: {
          name: '',
          summary: '',
          suitableMajors: '',
          deliverableTypes: '',
          sortOrder: '',
        },
      },
      options: {
        contestId: '',
      },
      writeback: buildDefaultWriteback(),
    }
  }

  return {
    mapping: {
      externalIdField: '',
      contestExternalIdField: '',
      trackExternalIdField: '',
      fieldMap: {
        title: '',
        name: '',
        summary: '',
        content: '',
        category: '',
        url: '',
        sourceType: '',
        year: '',
      },
    },
    options: {
      contestId: '',
      defaultVisibility: 'internal',
      defaultStatus: 'active',
      defaultResourceCategory: 'basic_info',
      defaultResourceAccessLevel: 'public',
    },
    writeback: buildDefaultWriteback(),
  }
}

export function isSyncItemConfigEmpty(raw: unknown): boolean {
  if (raw == null)
    return true
  if (typeof raw === 'string')
    return raw.trim().length === 0
  if (Array.isArray(raw))
    return raw.length === 0 || raw.every(isSyncItemConfigEmpty)
  if (typeof raw === 'object')
    return Object.values(raw as Record<string, unknown>).every(isSyncItemConfigEmpty)
  return false
}

import type {
  FeishuBitableSyncItemEntityType,
  FeishuBitableWritebackConfig,
} from '../types/domain'

export interface FeishuDefaultSyncItemConfig {
  mapping: Record<string, unknown>
  options: Record<string, unknown>
  writeback: FeishuBitableWritebackConfig
}

const ENTITY_TYPE_SOURCE_HINTS: Record<FeishuBitableSyncItemEntityType, string[]> = {
  contest: ['竞赛', '赛事', 'contest', 'match'],
  track: ['赛道', '方向', 'track'],
  track_timeline: ['赛道时间线', '赛道节点', '赛道日程', 'tracktimeline', 'track_timeline'],
  resource: ['资料', '资源', '素材', '文档', 'resource', 'material'],
  policy: ['政策', '会议', '大会', 'policy', 'notice'],
}

const REQUIRED_MAPPING_FIELD_KEYS: Record<FeishuBitableSyncItemEntityType, string[]> = {
  contest: ['externalId', 'name', 'officialUrl'],
  track: ['externalId', 'contestExternalId', 'name'],
  track_timeline: ['externalId', 'contestExternalId', 'trackExternalId', 'nodeType'],
  resource: ['externalId', 'contestExternalId', 'title', 'attachment'],
  policy: ['externalId', 'meetingName'],
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
          level: '',
          disciplines: '',
          officialUrl: '',
          summary: '',
          keywords: '',
          timelineText: '',
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
          coverImageUrl: '',
          location: '',
          organizer: '',
          undertaker: '',
          summary: '',
          participantRequirements: '',
          teamRule: '',
          timelineText: '',
          suitableMajors: '',
          awardRatio: '',
          evidenceRequirements: '',
          scoringPoints: '',
          deductionItems: '',
          deliverableTypes: '',
        },
      },
      options: {
        contestId: '',
      },
      writeback: buildDefaultWriteback(),
    }
  }

  if (entityType === 'track_timeline') {
    return {
      mapping: {
        externalIdField: '',
        contestExternalIdField: '',
        trackExternalIdField: '',
        fieldMap: {
          year: '',
          nodeType: '',
          startAt: '',
          endAt: '',
          note: '',
          sourceLink: '',
        },
      },
      options: {},
      writeback: buildDefaultWriteback(),
    }
  }

  if (entityType === 'policy') {
    return {
      mapping: {
        externalIdField: '',
        fieldMap: {
          meetingName: '',
          summary: '',
          conferenceDate: '',
          importance: '',
          officialMaterial: '',
          officialMaterialLink: '',
          wechatMaterial: '',
          wechatMaterialLink: '',
          weiboMaterial: '',
          weiboMaterialLink: '',
          douyinMaterial: '',
          douyinMaterialLink: '',
          xiaohongshuMaterial: '',
          xiaohongshuMaterialLink: '',
        },
      },
      options: {},
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
        category: '',
        attachment: '',
        attachmentSummary: '',
        contestRelationInfo: '',
        trackRelationInfo: '',
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

function normalizeText(raw: unknown): string {
  return String(raw || '').trim()
}

function normalizeSourceHintText(raw: unknown): string {
  return normalizeText(raw).toLowerCase().replace(/\s+/g, '')
}

export function listRequiredSyncItemFieldKeys(entityType: FeishuBitableSyncItemEntityType): string[] {
  return [...(REQUIRED_MAPPING_FIELD_KEYS[entityType] || [])]
}

export function suggestSyncItemEntityType(input: {
  tableName?: string
  viewName?: string
  name?: string
}): FeishuBitableSyncItemEntityType | null {
  const sourceText = normalizeSourceHintText([
    input.tableName,
    input.viewName,
    input.name,
  ].filter(Boolean).join(' '))
  if (!sourceText)
    return null

  for (const entityType of ['track_timeline', 'track', 'policy', 'resource', 'contest'] as const) {
    const hints = ENTITY_TYPE_SOURCE_HINTS[entityType]
    if (hints.some(hint => sourceText.includes(normalizeSourceHintText(hint))))
      return entityType
  }

  return null
}

export function buildSuggestedSyncItemName(
  entityType: FeishuBitableSyncItemEntityType,
  tableName?: string,
  viewName?: string,
): string {
  const normalizedTableName = normalizeText(tableName)
  const normalizedViewName = normalizeText(viewName)
  const entityLabel = entityType === 'contest'
    ? '竞赛同步'
    : entityType === 'track'
      ? '赛道同步'
      : entityType === 'track_timeline'
        ? '赛道时间线同步'
        : entityType === 'policy'
          ? '政策同步'
          : '资料同步'

  if (normalizedTableName && normalizedViewName)
    return `${normalizedTableName} / ${normalizedViewName} · ${entityLabel}`
  if (normalizedTableName)
    return `${normalizedTableName} · ${entityLabel}`
  return entityLabel
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

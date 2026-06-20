import type { FeishuBitableRecord } from '~~/server/services/feishu/client'
import type {
  FeishuBitableAutoSyncConfig,
  FeishuBitableSyncItem,
  FeishuBitableSyncItemEntityType,
  FeishuBitableWritebackConfig,
} from '~~/shared/types/domain'
import { batchUpdateFeishuBitableRecords } from '~~/server/services/feishu/client'
import { buildDefaultSyncItemConfig } from '~~/shared/utils/feishu-bitable-sync-config'

export interface FeishuBitableChangedRecordEvent {
  recordId: string
  action: string
  changedFieldNames: string[]
}

export interface FeishuBitableAutoSyncDecision {
  kind: 'ignore' | 'reset' | 'sync'
  watchedFieldNames: string[]
  effectiveChangedFieldNames: string[]
  reason:
    | 'auto_sync_disabled'
    | 'record_deleted'
    | 'writeback_only_change'
    | 'business_change_reset'
    | 'completed_pending_sync'
    | 'conditions_unmatched'
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return {}
  return raw as Record<string, unknown>
}

function normalizeStringList(raw: unknown): string[] {
  if (Array.isArray(raw))
    return [...new Set(raw.map(item => toText(item)).filter(Boolean))]
  const single = toText(raw)
  return single ? [single] : []
}

function collectTextValues(raw: unknown, target: Set<string>): void {
  if (raw == null)
    return

  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    const value = toText(raw)
    if (value)
      target.add(value)
    return
  }

  if (Array.isArray(raw)) {
    for (const item of raw)
      collectTextValues(item, target)
    return
  }

  const objectRaw = raw as Record<string, unknown>
  const direct = toText(objectRaw.text || objectRaw.name || objectRaw.label || objectRaw.value)
  if (direct) {
    target.add(direct)
    return
  }

  for (const value of Object.values(objectRaw))
    collectTextValues(value, target)
}

function extractFieldTexts(record: FeishuBitableRecord | null | undefined, fieldName: string): string[] {
  const normalizedFieldName = toText(fieldName)
  if (!record || !normalizedFieldName)
    return []

  const value = record.fields?.[normalizedFieldName]
  const texts = new Set<string>()
  collectTextValues(value, texts)
  return [...texts]
}

function anyConfiguredValueMatched(sourceValues: string[], candidates: string[]): boolean {
  if (!sourceValues.length || !candidates.length)
    return false
  const normalizedValues = new Set(sourceValues.map(item => toText(item)))
  return candidates.some(item => normalizedValues.has(toText(item)))
}

function extractWritebackFieldNames(writeback?: FeishuBitableWritebackConfig | Record<string, unknown>): string[] {
  const fields = parseJsonObject(parseJsonObject(writeback).fields)
  return [...new Set(Object.values(fields).map(item => toText(item)).filter(Boolean))]
}

function extractMappingSourceFieldNames(mapping: unknown): string[] {
  const source = parseJsonObject(mapping)
  const result = new Set<string>()

  for (const key of ['externalIdField', 'contestExternalIdField', 'trackExternalIdField']) {
    const value = toText(source[key])
    if (value)
      result.add(value)
  }

  const fieldMap = parseJsonObject(source.fieldMap)
  for (const value of Object.values(fieldMap)) {
    const fieldName = toText(value)
    if (fieldName)
      result.add(fieldName)
  }

  const match = parseJsonObject(source.match)
  for (const key of ['externalIdField', 'contestExternalIdField', 'trackExternalIdField']) {
    const value = toText(match[key])
    if (value)
      result.add(value)
  }

  const layers = Array.isArray(source.layers) ? source.layers : []
  for (const layer of layers) {
    const layerRaw = parseJsonObject(layer)
    const layerFieldMap = parseJsonObject(layerRaw.fieldMap)
    for (const value of Object.values(layerFieldMap)) {
      const fieldName = toText(value)
      if (fieldName)
        result.add(fieldName)
    }

    const bindings = Array.isArray(layerRaw.fieldBindings) ? layerRaw.fieldBindings : []
    for (const binding of bindings) {
      const bindingRaw = parseJsonObject(binding)
      const sourceField = toText(bindingRaw.sourceField)
      if (sourceField)
        result.add(sourceField)
    }
  }

  return [...result]
}

export function normalizeFeishuBitableAutoSyncConfig(
  entityType: FeishuBitableSyncItemEntityType,
  raw: FeishuBitableAutoSyncConfig | Record<string, unknown> | null | undefined,
): FeishuBitableAutoSyncConfig {
  const defaults = buildDefaultSyncItemConfig(entityType).autoSync
  const source = parseJsonObject(raw)
  return {
    enabled: source.enabled === undefined ? defaults.enabled === true : Boolean(source.enabled),
    recordStatusField: toText(source.recordStatusField || defaults.recordStatusField),
    syncStatusField: toText(source.syncStatusField || defaults.syncStatusField),
    completedValues: normalizeStringList(source.completedValues).length
      ? normalizeStringList(source.completedValues)
      : [...(defaults.completedValues || [])],
    pendingValues: normalizeStringList(source.pendingValues).length
      ? normalizeStringList(source.pendingValues)
      : [...(defaults.pendingValues || [])],
    syncedValues: normalizeStringList(source.syncedValues).length
      ? normalizeStringList(source.syncedValues)
      : [...(defaults.syncedValues || [])],
    resetRecordStatusValue: toText(source.resetRecordStatusValue || defaults.resetRecordStatusValue),
    resetSyncStatusValue: toText(source.resetSyncStatusValue || defaults.resetSyncStatusValue),
    useMappedFieldsAsWatched: source.useMappedFieldsAsWatched === undefined
      ? defaults.useMappedFieldsAsWatched !== false
      : Boolean(source.useMappedFieldsAsWatched),
    watchedFieldNames: normalizeStringList(source.watchedFieldNames),
    ignoredFieldNames: normalizeStringList(source.ignoredFieldNames),
  }
}

export function computeFeishuBitableWatchedFieldNames(input: {
  autoSync: FeishuBitableAutoSyncConfig
  mapping: unknown
  writeback?: FeishuBitableWritebackConfig | Record<string, unknown>
}): string[] {
  const watched = new Set<string>()
  if (input.autoSync.useMappedFieldsAsWatched !== false) {
    for (const fieldName of extractMappingSourceFieldNames(input.mapping))
      watched.add(fieldName)
  }

  for (const fieldName of input.autoSync.watchedFieldNames || [])
    watched.add(toText(fieldName))

  watched.delete(toText(input.autoSync.recordStatusField))
  watched.delete(toText(input.autoSync.syncStatusField))

  for (const fieldName of extractWritebackFieldNames(input.writeback))
    watched.delete(fieldName)

  for (const fieldName of input.autoSync.ignoredFieldNames || [])
    watched.delete(toText(fieldName))

  return [...watched].filter(Boolean)
}

export function decideFeishuBitableAutoSyncAction(input: {
  action: string
  changedFieldNames: string[]
  record: FeishuBitableRecord | null | undefined
  autoSync: FeishuBitableAutoSyncConfig
  mapping: unknown
  writeback?: FeishuBitableWritebackConfig | Record<string, unknown>
}): FeishuBitableAutoSyncDecision {
  if (input.autoSync.enabled !== true) {
    return {
      kind: 'ignore',
      watchedFieldNames: [],
      effectiveChangedFieldNames: [],
      reason: 'auto_sync_disabled',
    }
  }

  const action = toText(input.action)
  if (action === 'record_deleted') {
    return {
      kind: 'ignore',
      watchedFieldNames: [],
      effectiveChangedFieldNames: [],
      reason: 'record_deleted',
    }
  }

  const watchedFieldNames = computeFeishuBitableWatchedFieldNames({
    autoSync: input.autoSync,
    mapping: input.mapping,
    writeback: input.writeback,
  })
  const watchedFieldSet = new Set(watchedFieldNames)
  const ignoredFieldSet = new Set<string>([
    toText(input.autoSync.recordStatusField),
    toText(input.autoSync.syncStatusField),
    ...extractWritebackFieldNames(input.writeback),
    ...(input.autoSync.ignoredFieldNames || []).map(item => toText(item)),
  ].filter(Boolean))
  const normalizedChangedFields = [...new Set((input.changedFieldNames || []).map(item => toText(item)).filter(Boolean))]
  const effectiveChangedFieldNames = normalizedChangedFields.filter(fieldName => !ignoredFieldSet.has(fieldName))

  const recordStatusValues = extractFieldTexts(input.record, input.autoSync.recordStatusField || '')
  const syncStatusValues = extractFieldTexts(input.record, input.autoSync.syncStatusField || '')
  const isCompleted = anyConfiguredValueMatched(recordStatusValues, input.autoSync.completedValues || [])
  const isPending = anyConfiguredValueMatched(syncStatusValues, input.autoSync.pendingValues || [])
  const isSynced = anyConfiguredValueMatched(syncStatusValues, input.autoSync.syncedValues || [])
  const changedBusinessFields = effectiveChangedFieldNames.filter(fieldName => watchedFieldSet.has(fieldName))

  if (action === 'record_edited' && normalizedChangedFields.length > 0 && effectiveChangedFieldNames.length === 0) {
    return {
      kind: 'ignore',
      watchedFieldNames,
      effectiveChangedFieldNames,
      reason: 'writeback_only_change',
    }
  }

  if (action === 'record_edited' && changedBusinessFields.length > 0 && isCompleted && isSynced) {
    return {
      kind: 'reset',
      watchedFieldNames,
      effectiveChangedFieldNames,
      reason: 'business_change_reset',
    }
  }

  if (isCompleted && isPending) {
    return {
      kind: 'sync',
      watchedFieldNames,
      effectiveChangedFieldNames,
      reason: 'completed_pending_sync',
    }
  }

  return {
    kind: 'ignore',
    watchedFieldNames,
    effectiveChangedFieldNames,
    reason: 'conditions_unmatched',
  }
}

export async function handleFeishuBitableAutoSyncForItem(input: {
  tenantAccessToken: string
  item: FeishuBitableSyncItem
  recordEvents: FeishuBitableChangedRecordEvent[]
  recordsById: Map<string, FeishuBitableRecord>
}): Promise<{
  triggeredRecordIds: string[]
  resetRecordIds: string[]
  ignoredRecordIds: string[]
}> {
  const autoSync = normalizeFeishuBitableAutoSyncConfig(input.item.entityType, input.item.autoSync)
  const triggeredRecordIds: string[] = []
  const resetRecords: Array<{ recordId: string, fields: Record<string, unknown> }> = []
  const ignoredRecordIds: string[] = []

  for (const recordEvent of input.recordEvents) {
    const record = input.recordsById.get(recordEvent.recordId)
    const decision = decideFeishuBitableAutoSyncAction({
      action: recordEvent.action,
      changedFieldNames: recordEvent.changedFieldNames,
      record,
      autoSync,
      mapping: input.item.mapping,
      writeback: input.item.writeback,
    })

    if (decision.kind === 'sync') {
      triggeredRecordIds.push(recordEvent.recordId)
      continue
    }

    if (decision.kind === 'reset') {
      const fields: Record<string, unknown> = {}
      const recordStatusField = toText(autoSync.recordStatusField)
      const syncStatusField = toText(autoSync.syncStatusField)
      if (recordStatusField && autoSync.resetRecordStatusValue)
        fields[recordStatusField] = autoSync.resetRecordStatusValue
      if (syncStatusField && autoSync.resetSyncStatusValue)
        fields[syncStatusField] = autoSync.resetSyncStatusValue
      if (Object.keys(fields).length > 0) {
        resetRecords.push({
          recordId: recordEvent.recordId,
          fields,
        })
        continue
      }
    }

    ignoredRecordIds.push(recordEvent.recordId)
  }

  if (resetRecords.length > 0) {
    await batchUpdateFeishuBitableRecords({
      tenantAccessToken: input.tenantAccessToken,
      appToken: input.item.appToken,
      tableId: input.item.tableId,
      records: resetRecords,
    })
  }

  return {
    triggeredRecordIds: [...new Set(triggeredRecordIds)],
    resetRecordIds: resetRecords.map(item => item.recordId),
    ignoredRecordIds: [...new Set(ignoredRecordIds)],
  }
}

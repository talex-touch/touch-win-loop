<script setup lang="ts">
import type {
  ApiResponse,
  FeishuBitableSync,
  FeishuBitableSyncDetail,
  FeishuBitableSyncItem,
  FeishuBitableSyncItemDetail,
  FeishuBitableSyncItemEntityType,
  FeishuBitableSyncItemPreviewResult,
  FeishuBitableTableMeta,
  FeishuBitableViewMeta,
  FeishuFieldDiagnosticItem,
  FeishuFieldInspectionItem,
  FeishuTaskScheduleMode,
} from '~~/shared/types/domain'

interface MappingOption {
  key: string
  label: string
}

interface MappingWizardBinding {
  targetKey: string
  sourceField: string
  transform: string
}

interface SelectOption<T extends string = string> {
  value: T
  label: string
}

const props = withDefaults(defineProps<{
  syncId: string
  selectedItemId?: string | null
  draftTableId?: string | null
  draftViewId?: string | null
  embedded?: boolean
  showBackButton?: boolean
}>(), {
  selectedItemId: '',
  draftTableId: '',
  draftViewId: '',
  embedded: false,
  showBackButton: true,
})

const emit = defineEmits<{
  (event: 'itemChange', itemId: string): void
  (event: 'updated'): void
}>()

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const DEFAULT_MAPPING_TEXT = `{
  "externalIdField": "",
  "contestExternalIdField": "",
  "trackExternalIdField": "",
  "fieldMap": {
    "name": "",
    "officialUrl": "",
    "summary": "",
    "title": "",
    "content": "",
    "category": "",
    "url": "",
    "sourceType": "",
    "year": ""
  }
}`

const DEFAULT_OPTIONS_TEXT = `{
  "contestId": "",
  "defaultVisibility": "internal",
  "defaultStatus": "active",
  "defaultResourceCategory": "basic_info",
  "defaultResourceAccessLevel": "public"
}`

const DEFAULT_WRITEBACK_TEXT = `{
  "enabled": true,
  "fields": {
    "status": "",
    "syncedAt": "",
    "errorMessage": "",
    "reasonCode": "",
    "entityId": "",
    "runId": "",
    "triggerSource": ""
  },
  "values": {
    "success": "已同步",
    "failed": "失败",
    "skipped": "跳过"
  }
}`

const MAPPING_OPTIONS: Record<FeishuBitableSyncItemEntityType, MappingOption[]> = {
  contest: [
    { key: 'externalId', label: 'externalId（主键）' },
    { key: 'name', label: 'name（名称）' },
    { key: 'officialUrl', label: 'officialUrl（官网）' },
    { key: 'summary', label: 'summary（简介）' },
    { key: 'level', label: 'level（级别）' },
    { key: 'organizer', label: 'organizer（主办方）' },
    { key: 'coOrganizer', label: 'coOrganizer（协办方）' },
    { key: 'participantRequirements', label: 'participantRequirements（参赛对象）' },
    { key: 'teamRule', label: 'teamRule（组队规则）' },
    { key: 'currentSeason', label: 'currentSeason（届次）' },
    { key: 'disciplines', label: 'disciplines（学科）' },
    { key: 'aliases', label: 'aliases（别名）' },
    { key: 'keywords', label: 'keywords（关键词）' },
    { key: 'recommendedFor', label: 'recommendedFor（推荐人群）' },
  ],
  track: [
    { key: 'externalId', label: 'externalId（主键）' },
    { key: 'contestExternalId', label: 'contestExternalId（赛事外部 ID）' },
    { key: 'name', label: 'name（赛道名）' },
    { key: 'summary', label: 'summary（简介）' },
    { key: 'suitableMajors', label: 'suitableMajors（适用专业）' },
    { key: 'deliverableTypes', label: 'deliverableTypes（交付物类型）' },
    { key: 'sortOrder', label: 'sortOrder（排序）' },
  ],
  resource: [
    { key: 'externalId', label: 'externalId（主键）' },
    { key: 'contestExternalId', label: 'contestExternalId（赛事外部 ID）' },
    { key: 'trackExternalId', label: 'trackExternalId（赛道外部 ID）' },
    { key: 'title', label: 'title（标题）' },
    { key: 'name', label: 'name（别名标题）' },
    { key: 'summary', label: 'summary（摘要）' },
    { key: 'content', label: 'content（正文）' },
    { key: 'category', label: 'category（分类）' },
    { key: 'url', label: 'url（链接）' },
    { key: 'sourceType', label: 'sourceType（来源类型）' },
    { key: 'year', label: 'year（年份）' },
  ],
}

const MAPPING_GUESS_ALIASES: Record<string, string[]> = {
  externalId: ['external_id', 'externalid', 'id', 'record_id', '业务id'],
  contestExternalId: ['contest_external_id', 'contestid', '赛事外部id', '赛事id'],
  trackExternalId: ['track_external_id', 'trackid', '赛道外部id', '赛道id'],
  name: ['name', '名称', '名字'],
  title: ['title', '标题'],
  summary: ['summary', '简介', '描述'],
  content: ['content', '正文', '内容', '详情'],
  officialUrl: ['officialurl', 'official_url', '官网', '官网链接', 'url'],
  organizer: ['organizer', '主办方', '主办单位'],
  coOrganizer: ['coorganizer', 'co_organizer', '协办方', '承办方'],
  participantRequirements: ['participantrequirements', '参赛对象', '参赛要求'],
  teamRule: ['teamrule', '组队规则'],
  currentSeason: ['currentseason', '届次', '赛季'],
  disciplines: ['disciplines', '学科', '专业'],
  aliases: ['aliases', '别名'],
  keywords: ['keywords', '关键字', '关键词', '标签'],
  recommendedFor: ['recommendedfor', '推荐人群'],
  suitableMajors: ['suitablemajors', '适合专业', '适用专业'],
  deliverableTypes: ['deliverabletypes', '交付物', '成果类型'],
  sortOrder: ['sortorder', '排序', '序号'],
  category: ['category', '分类'],
  url: ['url', '链接'],
  sourceType: ['sourcetype', '来源类型'],
  year: ['year', '年份'],
}

const ENTITY_TYPE_OPTIONS: SelectOption<FeishuBitableSyncItemEntityType>[] = [
  { value: 'contest', label: '竞赛' },
  { value: 'track', label: '赛道' },
  { value: 'resource', label: '资料' },
]

const SCHEDULE_MODE_OPTIONS: SelectOption<FeishuTaskScheduleMode>[] = [
  { value: 'interval', label: '固定间隔' },
  { value: 'cron', label: 'Cron 表达式' },
]

const savingItem = ref(false)
const savingSync = ref(false)
const runningItem = ref(false)
const previewingItem = ref(false)
const loadingSync = ref(false)
const loadingItem = ref(false)
const loadingTables = ref(false)
const loadingViews = ref(false)
const loadingFieldInspection = ref(false)
const creatingItem = ref(false)
const addItemDrawerVisible = ref(false)

const feedbackError = ref('')
const feedbackSuccess = ref('')

const syncDetail = ref<FeishuBitableSyncDetail | null>(null)
const currentItem = ref<FeishuBitableSyncItemDetail | null>(null)
const previewResult = ref<FeishuBitableSyncItemPreviewResult | null>(null)
const fieldInspection = ref<FeishuFieldInspectionItem[]>([])
const fieldInspectionError = ref('')
const availableTables = ref<FeishuBitableTableMeta[]>([])
const availableViews = ref<FeishuBitableViewMeta[]>([])
const newItemViews = ref<FeishuBitableViewMeta[]>([])
const mappingWizardBindings = ref<MappingWizardBinding[]>([])
const activeItemId = ref('')

const syncForm = reactive({
  name: '',
})

const itemForm = reactive({
  id: '',
  name: '',
  entityType: 'contest' as FeishuBitableSyncItemEntityType,
  appToken: '',
  appName: '',
  tableId: '',
  tableName: '',
  viewId: '',
  viewName: '',
  sourceUrl: '',
  isEnabled: false,
  mappingText: DEFAULT_MAPPING_TEXT,
  optionsText: DEFAULT_OPTIONS_TEXT,
  writebackText: DEFAULT_WRITEBACK_TEXT,
  scheduleEnabled: false,
  scheduleMode: 'interval' as FeishuTaskScheduleMode,
  scheduleIntervalMinutes: 60,
  scheduleCronExpr: '0 * * * *',
  scheduleTimezone: 'Asia/Shanghai',
})

const newItemForm = reactive({
  name: '',
  entityType: 'contest' as FeishuBitableSyncItemEntityType,
  tableId: '',
  viewId: '',
})

const normalizedSyncId = computed(() => toText(props.syncId))
const normalizedSelectedItemId = computed(() => toText(props.selectedItemId))
const normalizedDraftTableId = computed(() => toText(props.draftTableId))
const normalizedDraftViewId = computed(() => toText(props.draftViewId))
const activeMappingOptions = computed(() => MAPPING_OPTIONS[itemForm.entityType] || [])

function setError(message: string) {
  feedbackError.value = message
  feedbackSuccess.value = ''
}

function setSuccess(message: string) {
  feedbackSuccess.value = message
  feedbackError.value = ''
}

function clearFeedback() {
  feedbackError.value = ''
  feedbackSuccess.value = ''
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function parseJsonText(text: string, label: string): Record<string, unknown> {
  const source = String(text || '').trim()
  if (!source)
    return {}
  try {
    const parsed = JSON.parse(source)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error(`${label} 必须为 JSON 对象。`)
    return parsed as Record<string, unknown>
  }
  catch (error) {
    if (error instanceof Error && error.message.includes('必须为 JSON 对象'))
      throw error
    throw new Error(`${label} JSON 格式错误。`)
  }
}

function fieldSamplePreview(sampleValues: string[]): string {
  const values = Array.isArray(sampleValues)
    ? sampleValues.map(item => String(item || '').trim()).filter(Boolean).slice(0, 3)
    : []
  return values.join(' | ') || '-'
}

function normalizeKey(text: string): string {
  return String(text || '').trim().toLowerCase().replace(/[\s_\-]/g, '')
}

function entityTypeLabel(entityType: FeishuBitableSyncItemEntityType): string {
  return ENTITY_TYPE_OPTIONS.find(item => item.value === entityType)?.label || entityType
}

function runStatusLabel(status: string): string {
  if (status === 'success')
    return '成功'
  if (status === 'partial_success')
    return '部分成功'
  if (status === 'failed')
    return '失败'
  return '运行中'
}

function formatDateTime(value?: string | null): string {
  if (!value)
    return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function fillItemForm(item: FeishuBitableSyncItemDetail) {
  itemForm.id = item.id
  itemForm.name = item.name
  itemForm.entityType = item.entityType
  itemForm.appToken = item.appToken
  itemForm.appName = item.source?.appName || syncDetail.value?.source.appName || ''
  itemForm.tableId = item.tableId
  itemForm.tableName = item.source?.tableName || ''
  itemForm.viewId = item.viewId || ''
  itemForm.viewName = item.source?.viewName || ''
  itemForm.sourceUrl = item.source?.sourceUrl || syncDetail.value?.source.sourceUrl || ''
  itemForm.isEnabled = item.isEnabled
  itemForm.mappingText = JSON.stringify(item.mapping || {}, null, 2)
  itemForm.optionsText = JSON.stringify(item.options || {}, null, 2)
  itemForm.writebackText = JSON.stringify(item.writeback || {}, null, 2)
  itemForm.scheduleEnabled = item.schedule.enabled
  itemForm.scheduleMode = item.schedule.mode
  itemForm.scheduleIntervalMinutes = Number(item.schedule.intervalMinutes || 60)
  itemForm.scheduleCronExpr = item.schedule.cronExpr || '0 * * * *'
  itemForm.scheduleTimezone = item.schedule.timezone || 'Asia/Shanghai'
}

function resetCurrentItemState() {
  currentItem.value = null
  previewResult.value = null
  fieldInspection.value = []
  fieldInspectionError.value = ''
  mappingWizardBindings.value = []
}

function applyDraftToNewItemForm() {
  newItemForm.tableId = normalizedDraftTableId.value
  newItemForm.viewId = normalizedDraftViewId.value
  if (!newItemForm.name && newItemForm.tableId)
    newItemForm.name = '子表同步项'
}

async function loadSyncDetail() {
  if (!normalizedSyncId.value)
    return
  loadingSync.value = true
  clearFeedback()
  try {
    const response = await $fetch<ApiResponse<FeishuBitableSyncDetail>>(endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}?includeInactive=true`))
    syncDetail.value = response.data
    syncForm.name = response.data.name || ''
    itemForm.appToken = response.data.source.appToken || ''
    itemForm.appName = response.data.source.appName || ''
    await loadTables()

    const nextItemId = normalizedSelectedItemId.value && response.data.items.some(item => item.id === normalizedSelectedItemId.value)
      ? normalizedSelectedItemId.value
      : activeItemId.value && response.data.items.some(item => item.id === activeItemId.value)
        ? activeItemId.value
        : response.data.items[0]?.id || ''

    if (nextItemId) {
      activeItemId.value = nextItemId
      await loadItemDetail(nextItemId)
    }
    else {
      activeItemId.value = ''
      resetCurrentItemState()
      applyDraftToNewItemForm()
      if (newItemForm.tableId)
        await loadNewItemViews()
      else
        newItemViews.value = []
      if (newItemForm.tableId || newItemForm.viewId)
        addItemDrawerVisible.value = true
    }
  }
  catch (error: any) {
    syncDetail.value = null
    activeItemId.value = ''
    resetCurrentItemState()
    setError(String(error?.data?.message || '同步信息加载失败。'))
  }
  finally {
    loadingSync.value = false
  }
}

async function loadItemDetail(itemId: string) {
  if (!normalizedSyncId.value || !itemId)
    return
  loadingItem.value = true
  try {
    const response = await $fetch<ApiResponse<FeishuBitableSyncItemDetail>>(endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}/items/${encodeURIComponent(itemId)}?runLimit=20&issueLimit=50`))
    currentItem.value = response.data
    fillItemForm(response.data)
    previewResult.value = null
    await loadViews()
    loadMappingWizardFromJson()
    await inspectFields()
  }
  catch (error: any) {
    resetCurrentItemState()
    setError(String(error?.data?.message || '子表同步项详情加载失败。'))
  }
  finally {
    loadingItem.value = false
  }
}

async function selectItem(itemId: string) {
  const nextId = String(itemId || '').trim()
  if (!nextId)
    return
  activeItemId.value = nextId
  emit('itemChange', nextId)
  await loadItemDetail(nextId)
}

async function loadTables() {
  const appToken = toText(syncDetail.value?.source.appToken || itemForm.appToken)
  if (!appToken) {
    availableTables.value = []
    return
  }

  loadingTables.value = true
  try {
    const response = await $fetch<ApiResponse<FeishuBitableTableMeta[]>>(endpoint(`/admin/integrations/feishu/bitable/sources/${encodeURIComponent(appToken)}/tables`))
    availableTables.value = response.data || []
  }
  catch {
    availableTables.value = []
  }
  finally {
    loadingTables.value = false
  }
}

async function loadViews() {
  const appToken = toText(syncDetail.value?.source.appToken || itemForm.appToken)
  const tableId = toText(itemForm.tableId)
  if (!appToken || !tableId) {
    availableViews.value = []
    return
  }

  loadingViews.value = true
  try {
    const response = await $fetch<ApiResponse<{ tables: FeishuBitableTableMeta[], views: FeishuBitableViewMeta[] }>>(endpoint(`/admin/integrations/feishu/bitable/sources/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/views`))
    availableViews.value = response.data.views || []
  }
  catch {
    availableViews.value = []
  }
  finally {
    loadingViews.value = false
  }
}

async function loadNewItemViews() {
  const appToken = toText(syncDetail.value?.source.appToken || itemForm.appToken)
  const tableId = toText(newItemForm.tableId)
  if (!appToken || !tableId) {
    newItemViews.value = []
    return
  }

  loadingViews.value = true
  try {
    const response = await $fetch<ApiResponse<{ tables: FeishuBitableTableMeta[], views: FeishuBitableViewMeta[] }>>(endpoint(`/admin/integrations/feishu/bitable/sources/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/views`))
    newItemViews.value = response.data.views || []
  }
  catch {
    newItemViews.value = []
  }
  finally {
    loadingViews.value = false
  }
}

function syncSelectedNames() {
  itemForm.tableName = availableTables.value.find(item => item.tableId === itemForm.tableId)?.name || itemForm.tableName
  itemForm.viewName = availableViews.value.find(item => item.viewId === itemForm.viewId)?.name || itemForm.viewName
}

function addMappingWizardBinding() {
  mappingWizardBindings.value.push({
    targetKey: '',
    sourceField: '',
    transform: '',
  })
}

function removeMappingWizardBinding(index: number) {
  if (index < 0 || index >= mappingWizardBindings.value.length)
    return
  mappingWizardBindings.value.splice(index, 1)
}

function pickMappingFromRaw(raw: Record<string, unknown>) {
  const schemaVersion = Number(raw.schemaVersion || 0)
  const fieldMap: Record<string, string> = {}
  const computedMap: Record<string, string> = {}
  let externalIdField = String(raw.externalIdField || '').trim()
  let contestExternalIdField = String(raw.contestExternalIdField || '').trim()
  let trackExternalIdField = String(raw.trackExternalIdField || '').trim()

  if (schemaVersion === 2 && Array.isArray(raw.layers)) {
    const match = raw.match && typeof raw.match === 'object' && !Array.isArray(raw.match)
      ? raw.match as Record<string, unknown>
      : {}
    externalIdField = String(match.externalIdField || externalIdField || '').trim()
    contestExternalIdField = String(match.contestExternalIdField || contestExternalIdField || '').trim()
    trackExternalIdField = String(match.trackExternalIdField || trackExternalIdField || '').trim()

    for (const layerRaw of raw.layers) {
      if (!layerRaw || typeof layerRaw !== 'object' || Array.isArray(layerRaw))
        continue
      const layer = layerRaw as Record<string, unknown>
      if (layer.enabled === false || String(layer.scopeType || 'global').trim() !== 'global')
        continue
      const layerFieldMap = layer.fieldMap && typeof layer.fieldMap === 'object' && !Array.isArray(layer.fieldMap)
        ? layer.fieldMap as Record<string, unknown>
        : {}
      for (const [key, value] of Object.entries(layerFieldMap)) {
        const fieldName = String(value || '').trim()
        if (fieldName)
          fieldMap[key] = fieldName
      }
      const fieldBindings = Array.isArray(layer.fieldBindings) ? layer.fieldBindings : []
      for (const item of fieldBindings) {
        if (!item || typeof item !== 'object' || Array.isArray(item))
          continue
        const binding = item as Record<string, unknown>
        const key = String(binding.key || '').trim()
        const sourceField = String(binding.sourceField || '').trim()
        const transform = String(binding.transform || '').trim()
        if (key && sourceField)
          fieldMap[key] = sourceField
        if (key && transform)
          computedMap[key] = transform
      }
    }
  }
  else {
    const rawFieldMap = raw.fieldMap && typeof raw.fieldMap === 'object' && !Array.isArray(raw.fieldMap)
      ? raw.fieldMap as Record<string, unknown>
      : {}
    const rawComputedMap = raw.computedMap && typeof raw.computedMap === 'object' && !Array.isArray(raw.computedMap)
      ? raw.computedMap as Record<string, unknown>
      : {}
    for (const [key, value] of Object.entries(rawFieldMap)) {
      const fieldName = String(value || '').trim()
      if (fieldName)
        fieldMap[key] = fieldName
    }
    for (const [key, value] of Object.entries(rawComputedMap)) {
      const transform = String(value || '').trim()
      if (transform)
        computedMap[key] = transform
    }
  }

  return {
    schemaVersion,
    fieldMap,
    computedMap,
    externalIdField,
    contestExternalIdField,
    trackExternalIdField,
  }
}

function loadMappingWizardFromJson() {
  const mapping = parseJsonText(itemForm.mappingText, '字段映射')
  const parsed = pickMappingFromRaw(mapping)
  const nextBindings: MappingWizardBinding[] = []
  for (const [key, fieldName] of Object.entries(parsed.fieldMap)) {
    nextBindings.push({
      targetKey: key,
      sourceField: fieldName,
      transform: parsed.computedMap[key] || '',
    })
  }
  if (parsed.externalIdField) {
    nextBindings.push({ targetKey: 'externalId', sourceField: parsed.externalIdField, transform: parsed.computedMap.externalId || '' })
  }
  if (parsed.contestExternalIdField) {
    nextBindings.push({ targetKey: 'contestExternalId', sourceField: parsed.contestExternalIdField, transform: parsed.computedMap.contestExternalId || '' })
  }
  if (parsed.trackExternalIdField) {
    nextBindings.push({ targetKey: 'trackExternalId', sourceField: parsed.trackExternalIdField, transform: parsed.computedMap.trackExternalId || '' })
  }
  const dedup = new Map<string, MappingWizardBinding>()
  for (const item of nextBindings) {
    if (item.targetKey)
      dedup.set(item.targetKey, item)
  }
  mappingWizardBindings.value = [...dedup.values()]
}

function applyMappingWizardToJson() {
  const mapping = parseJsonText(itemForm.mappingText, '字段映射')
  const fieldMap: Record<string, string> = {}
  const computedMap: Record<string, string> = {}
  let externalIdField = ''
  let contestExternalIdField = ''
  let trackExternalIdField = ''

  for (const item of mappingWizardBindings.value) {
    const key = toText(item.targetKey)
    const sourceField = toText(item.sourceField)
    const transform = toText(item.transform)
    if (!key || !sourceField)
      continue
    if (key === 'externalId')
      externalIdField = sourceField
    else if (key === 'contestExternalId')
      contestExternalIdField = sourceField
    else if (key === 'trackExternalId')
      trackExternalIdField = sourceField
    else
      fieldMap[key] = sourceField
    if (transform)
      computedMap[key] = transform
  }

  const schemaVersion = Number(mapping.schemaVersion || 0)
  if (schemaVersion === 2 && Array.isArray(mapping.layers)) {
    const source = { ...mapping }
    const layers = Array.isArray(source.layers) ? [...source.layers] : []
    const restLayers = layers.filter((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        return true
      return String((item as Record<string, unknown>).id || '') !== 'wizard_global'
    })
    const fieldBindings = Object.entries(computedMap).map(([key, transform]) => ({
      key,
      targetPath: key,
      sourceField: fieldMap[key] || (key === 'externalId' ? externalIdField : key === 'contestExternalId' ? contestExternalIdField : key === 'trackExternalId' ? trackExternalIdField : ''),
      transform,
    }))
    const hasWizardContent = Object.keys(fieldMap).length > 0 || fieldBindings.length > 0 || Boolean(externalIdField || contestExternalIdField || trackExternalIdField)
    if (hasWizardContent) {
      restLayers.push({
        id: 'wizard_global',
        scopeType: 'global',
        scopeValue: '*',
        priority: 0,
        enabled: true,
        fieldMap,
        fieldBindings,
        defaults: {},
      })
    }
    source.match = {
      ...(source.match && typeof source.match === 'object' && !Array.isArray(source.match) ? source.match : {}),
      externalIdField,
      contestExternalIdField,
      trackExternalIdField,
    }
    source.layers = restLayers
    itemForm.mappingText = JSON.stringify(source, null, 2)
  }
  else {
    itemForm.mappingText = JSON.stringify({
      ...mapping,
      externalIdField,
      contestExternalIdField,
      trackExternalIdField,
      fieldMap,
      computedMap,
    }, null, 2)
  }
  setSuccess('已将映射向导写回 JSON。')
}

function guessFieldNameByTarget(targetKey: string): string {
  const aliases = MAPPING_GUESS_ALIASES[targetKey] || [targetKey]
  const normalizedAliases = aliases.map(alias => normalizeKey(alias))
  for (const item of fieldInspection.value) {
    const fieldName = toText(item.fieldName)
    if (!fieldName)
      continue
    const normalizedField = normalizeKey(fieldName)
    if (normalizedAliases.includes(normalizedField))
      return fieldName
    if (normalizedAliases.some(alias => normalizedField.includes(alias) || alias.includes(normalizedField)))
      return fieldName
  }
  return ''
}

function autoFillMappingWizardBindings() {
  const existing = new Map(mappingWizardBindings.value.map(item => [item.targetKey, item]))
  for (const option of activeMappingOptions.value) {
    if (existing.has(option.key))
      continue
    const guessedField = guessFieldNameByTarget(option.key)
    if (!guessedField)
      continue
    existing.set(option.key, {
      targetKey: option.key,
      sourceField: guessedField,
      transform: '',
    })
  }
  mappingWizardBindings.value = [...existing.values()]
}

async function inspectFields() {
  const appToken = toText(itemForm.appToken || syncDetail.value?.source.appToken)
  const tableId = toText(itemForm.tableId)
  if (!appToken || !tableId) {
    fieldInspection.value = []
    fieldInspectionError.value = '请先选择子表后再查看字段概览。'
    return
  }

  loadingFieldInspection.value = true
  fieldInspectionError.value = ''
  try {
    const response = await $fetch<ApiResponse<FeishuFieldInspectionItem[]>>(endpoint('/admin/integrations/feishu/bitable/sources/inspect-fields'), {
      method: 'POST',
      body: {
        appToken,
        tableId,
        viewId: toText(itemForm.viewId),
        sampleRecords: 120,
      },
    })
    fieldInspection.value = response.data || []
    autoFillMappingWizardBindings()
  }
  catch (error: any) {
    fieldInspectionError.value = String(error?.data?.message || '字段巡检失败。')
    fieldInspection.value = []
  }
  finally {
    loadingFieldInspection.value = false
  }
}

async function saveCurrentItem() {
  if (!normalizedSyncId.value || !currentItem.value)
    return

  clearFeedback()
  let mapping: Record<string, unknown>
  let options: Record<string, unknown>
  let writeback: Record<string, unknown>
  try {
    mapping = parseJsonText(itemForm.mappingText, '字段映射')
    options = parseJsonText(itemForm.optionsText, '同步选项')
    writeback = parseJsonText(itemForm.writebackText, '状态回填配置')
  }
  catch (error) {
    setError(error instanceof Error ? error.message : '同步项配置解析失败。')
    return
  }

  savingItem.value = true
  try {
    await $fetch(endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}/items/${encodeURIComponent(currentItem.value.id)}`), {
      method: 'PATCH',
      body: {
        name: itemForm.name.trim(),
        entityType: itemForm.entityType,
        tableId: itemForm.tableId.trim(),
        viewId: itemForm.viewId.trim(),
        source: {
          appToken: itemForm.appToken.trim(),
          appName: itemForm.appName.trim(),
          tableId: itemForm.tableId.trim(),
          tableName: itemForm.tableName.trim(),
          viewId: itemForm.viewId.trim(),
          viewName: itemForm.viewName.trim(),
          sourceUrl: itemForm.sourceUrl.trim(),
        },
        isEnabled: itemForm.isEnabled,
        mapping,
        options,
        writeback,
        schedule: {
          enabled: itemForm.scheduleEnabled,
          mode: itemForm.scheduleMode,
          intervalMinutes: itemForm.scheduleMode === 'interval' ? Number(itemForm.scheduleIntervalMinutes || 60) : null,
          cronExpr: itemForm.scheduleMode === 'cron' ? itemForm.scheduleCronExpr.trim() : null,
          timezone: itemForm.scheduleTimezone.trim(),
        },
      },
    })
    await loadSyncDetail()
    emit('updated')
    setSuccess('子表同步项已保存。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || '子表同步项保存失败。'))
  }
  finally {
    savingItem.value = false
  }
}

async function saveSyncInfo() {
  if (!normalizedSyncId.value)
    return

  const name = syncForm.name.trim()
  if (!name) {
    setError('同步信息名称不能为空。')
    return
  }

  savingSync.value = true
  clearFeedback()
  try {
    const response = await $fetch<ApiResponse<FeishuBitableSync>>(endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}`), {
      method: 'PATCH',
      body: {
        name,
      },
    })
    const nextName = String(response.data?.name || name).trim()
    if (syncDetail.value)
      syncDetail.value = { ...syncDetail.value, name: nextName }
    syncForm.name = nextName
    emit('updated')
    setSuccess('同步信息已更新。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || '同步信息更新失败。'))
  }
  finally {
    savingSync.value = false
  }
}

async function previewCurrentItem() {
  if (!normalizedSyncId.value || !currentItem.value)
    return
  previewingItem.value = true
  clearFeedback()
  try {
    const response = await $fetch<ApiResponse<FeishuBitableSyncItemPreviewResult>>(endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}/items/${encodeURIComponent(currentItem.value.id)}/preview`), {
      method: 'POST',
    })
    previewResult.value = response.data
    setSuccess('预检完成。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || '预检失败。'))
  }
  finally {
    previewingItem.value = false
  }
}

async function runCurrentItem() {
  if (!normalizedSyncId.value || !currentItem.value)
    return
  runningItem.value = true
  clearFeedback()
  try {
    await $fetch(endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}/items/${encodeURIComponent(currentItem.value.id)}/run`), {
      method: 'POST',
    })
    await loadSyncDetail()
    emit('updated')
    setSuccess('同步执行完成。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || '同步执行失败。'))
  }
  finally {
    runningItem.value = false
  }
}

async function openAddItemDrawer() {
  newItemForm.name = ''
  newItemForm.entityType = 'contest'
  newItemForm.tableId = ''
  newItemForm.viewId = ''
  newItemViews.value = []
  applyDraftToNewItemForm()
  if (newItemForm.tableId)
    await loadNewItemViews()
  addItemDrawerVisible.value = true
}

async function createItem() {
  if (!normalizedSyncId.value)
    return
  const tableId = toText(newItemForm.tableId)
  if (!tableId) {
    setError('请先选择子表。')
    return
  }

  creatingItem.value = true
  clearFeedback()
  try {
    const tableName = availableTables.value.find(item => item.tableId === newItemForm.tableId)?.name || ''
    const viewName = newItemViews.value.find(item => item.viewId === newItemForm.viewId)?.name || ''
    const response = await $fetch<ApiResponse<FeishuBitableSyncItem>>(endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}/items`), {
      method: 'POST',
      body: {
        name: newItemForm.name.trim() || tableName || '子表同步项',
        entityType: newItemForm.entityType,
        tableId,
        viewId: toText(newItemForm.viewId),
        source: {
          appToken: syncDetail.value?.source.appToken || '',
          appName: syncDetail.value?.source.appName || '',
          tableId,
          tableName,
          viewId: toText(newItemForm.viewId),
          viewName,
          sourceUrl: syncDetail.value?.source.sourceUrl || '',
        },
        isEnabled: false,
        mapping: {},
        options: {},
        writeback: {},
      },
    })
    addItemDrawerVisible.value = false
    await loadSyncDetail()
    await selectItem(response.data.id)
    emit('updated')
    setSuccess('子表同步项已创建，默认保持禁用。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || '子表同步项创建失败。'))
  }
  finally {
    creatingItem.value = false
  }
}

function previewActionSummary(result: FeishuBitableSyncItemPreviewResult | null): string {
  if (!result)
    return '尚未执行预检。'
  return `抓取 ${result.fetchedCount} / 新增 ${result.createdCount} / 更新 ${result.updatedCount} / 跳过 ${result.skippedCount} / 错误 ${result.errorCount}`
}

function diagnosticClass(level: FeishuFieldDiagnosticItem['level']): string {
  return level === 'error' ? 'text-rose-600' : 'text-amber-600'
}

watch(() => props.syncId, () => {
  activeItemId.value = normalizedSelectedItemId.value
  void loadSyncDetail()
}, { immediate: true })

watch(() => props.selectedItemId, (value) => {
  const nextId = String(value || '').trim()
  if (!nextId || nextId === activeItemId.value)
    return
  if (!syncDetail.value?.items.some(item => item.id === nextId))
    return
  activeItemId.value = nextId
  void loadItemDetail(nextId)
})
</script>

<template>
  <div class="space-y-4" :class="embedded ? 'pb-4' : ''">
    <div class="flex flex-wrap gap-3 items-start justify-between">
      <div class="space-y-1">
        <div class="flex gap-2 items-center">
          <a-button v-if="showBackButton" size="small" @click="navigateTo('/admin/integrations/feishu')">
            返回列表
          </a-button>
          <a-tag color="arcoblue" size="small">
            多维主库
          </a-tag>
        </div>
        <h1 class="text-[16px] text-slate-900 font-semibold m-0">
          {{ syncDetail?.name || '多维同步信息' }}
        </h1>
        <p class="text-[12px] text-slate-500 m-0">
          主库 appToken：{{ syncDetail?.source.appToken || '-' }} / 最近执行：{{ syncDetail?.latestRunSummary ? formatDateTime(syncDetail.latestRunSummary.startedAt) : '-' }}
        </p>
      </div>
      <div class="flex gap-2">
        <a-button size="small" :loading="loadingSync" @click="loadSyncDetail">
          刷新
        </a-button>
        <a-button size="small" type="primary" @click="openAddItemDrawer">
          新增子表同步项
        </a-button>
      </div>
    </div>

    <a-alert v-if="feedbackError" type="error" :show-icon="true">
      {{ feedbackError }}
    </a-alert>
    <a-alert v-else-if="feedbackSuccess" type="success" :show-icon="true">
      {{ feedbackSuccess }}
    </a-alert>

    <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
      <div class="flex flex-wrap gap-3 items-end justify-between">
        <div class="gap-3 grid items-end md:grid-cols-[minmax(220px,320px),auto]">
          <label class="text-[11px] text-slate-600 font-medium block">
            同步信息名称
            <a-input v-model="syncForm.name" class="mt-1" size="small" allow-clear placeholder="输入主库同步信息名称" />
          </label>
          <a-button size="small" type="primary" :loading="savingSync" @click="saveSyncInfo">
            保存名称
          </a-button>
        </div>
        <div class="text-[11px] text-slate-500">
          最近更新时间：{{ syncDetail ? formatDateTime(syncDetail.updatedAt) : '-' }}
        </div>
      </div>

      <div class="gap-3 grid md:grid-cols-2 xl:grid-cols-4">
        <div class="p-3 border border-slate-200 rounded bg-slate-50">
          <p class="text-[10px] text-slate-500 m-0">
            主库名称
          </p>
          <p class="text-[11px] text-slate-900 font-medium m-0 mt-1 break-all">
            {{ syncDetail?.source.appName || '-' }}
          </p>
        </div>
        <div class="p-3 border border-slate-200 rounded bg-slate-50">
          <p class="text-[10px] text-slate-500 m-0">
            主库 appToken
          </p>
          <p class="text-[11px] text-slate-900 font-medium m-0 mt-1 break-all">
            {{ syncDetail?.source.appToken || '-' }}
          </p>
        </div>
        <div class="p-3 border border-slate-200 rounded bg-slate-50">
          <p class="text-[10px] text-slate-500 m-0">
            子表同步项
          </p>
          <p class="text-[11px] text-slate-900 font-medium m-0 mt-1">
            {{ syncDetail?.items.length || 0 }} 个 / 已启用 {{ syncDetail?.enabledItemCount || 0 }} 个
          </p>
        </div>
        <div class="p-3 border border-slate-200 rounded bg-slate-50">
          <p class="text-[10px] text-slate-500 m-0">
            问题概览
          </p>
          <p class="text-[11px] text-slate-900 font-medium m-0 mt-1">
            待处理 {{ syncDetail?.issueStats.open || 0 }} / 总计 {{ syncDetail?.issueStats.total || 0 }}
          </p>
        </div>
      </div>

      <p v-if="syncDetail?.source.sourceUrl" class="text-[11px] text-slate-500 m-0 break-all">
        来源 URL：{{ syncDetail.source.sourceUrl }}
      </p>
    </section>

    <div class="gap-4 grid xl:grid-cols-[280px,minmax(0,1fr)]">
      <aside class="space-y-3">
        <section class="p-3 border border-slate-200 rounded bg-white space-y-2">
          <div class="flex items-center justify-between">
            <h2 class="text-[12px] text-slate-900 font-semibold m-0">
              子表同步项
            </h2>
            <span class="text-[10px] text-slate-500">{{ syncDetail?.items.length || 0 }} 个</span>
          </div>

          <a-spin :loading="loadingSync">
            <div v-if="syncDetail?.items.length" class="space-y-2">
              <button
                v-for="item in syncDetail.items"
                :key="item.id"
                type="button"
                class="px-3 py-2 text-left border rounded w-full transition"
                :class="activeItemId === item.id ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-white hover:border-slate-300'"
                @click="selectItem(item.id)"
              >
                <div class="flex gap-2 items-center justify-between">
                  <p class="text-[12px] text-slate-900 font-medium m-0 truncate">
                    {{ item.name }}
                  </p>
                  <a-tag :color="item.isEnabled ? 'green' : 'gray'" size="small">
                    {{ item.isEnabled ? '启用' : '停用' }}
                  </a-tag>
                </div>
                <p class="text-[10px] text-slate-500 m-0 mt-1">
                  {{ entityTypeLabel(item.entityType) }} / {{ item.source?.tableName || item.tableId }}
                </p>
              </button>
            </div>
            <a-empty v-else description="当前主库还没有子表同步项" />
          </a-spin>
        </section>
      </aside>

      <main class="space-y-4">
        <a-spin :loading="loadingItem">
          <template v-if="currentItem">
            <section class="p-4 border border-slate-200 rounded bg-white space-y-4">
              <div class="flex gap-3 items-center justify-between">
                <div>
                  <h2 class="text-[13px] text-slate-900 font-semibold m-0">
                    {{ currentItem.name }}
                  </h2>
                  <p class="text-[11px] text-slate-500 m-0 mt-1">
                    子表同步项 ID：{{ currentItem.id }}
                  </p>
                </div>
                <div class="flex gap-2">
                  <a-button size="small" :loading="previewingItem" @click="previewCurrentItem">
                    预检
                  </a-button>
                  <a-button size="small" type="primary" :loading="runningItem" @click="runCurrentItem">
                    手动执行
                  </a-button>
                  <a-button size="small" type="primary" :loading="savingItem" @click="saveCurrentItem">
                    保存配置
                  </a-button>
                </div>
              </div>

              <div class="gap-3 grid md:grid-cols-2 xl:grid-cols-3">
                <label class="text-[11px] text-slate-600 font-medium block">
                  同步项名称
                  <a-input v-model="itemForm.name" class="mt-1" size="small" allow-clear />
                </label>
                <label class="text-[11px] text-slate-600 font-medium block">
                  同步到
                  <a-select v-model="itemForm.entityType" class="mt-1" size="small">
                    <a-option v-for="option in ENTITY_TYPE_OPTIONS" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </a-option>
                  </a-select>
                </label>
                <div class="text-[11px] text-slate-600 font-medium block">
                  <div>启用状态</div>
                  <div class="mt-2">
                    <a-switch v-model="itemForm.isEnabled" />
                  </div>
                </div>
                <label class="text-[11px] text-slate-600 font-medium block">
                  子表
                  <a-select v-model="itemForm.tableId" class="mt-1" size="small" allow-search allow-clear @change="() => { syncSelectedNames(); void loadViews() }">
                    <a-option v-for="item in availableTables" :key="item.tableId" :value="item.tableId">
                      {{ item.name }} ({{ item.tableId }})
                    </a-option>
                  </a-select>
                </label>
                <label class="text-[11px] text-slate-600 font-medium block">
                  视图
                  <a-select v-model="itemForm.viewId" class="mt-1" size="small" allow-search allow-clear @change="syncSelectedNames">
                    <a-option v-for="item in availableViews" :key="item.viewId" :value="item.viewId">
                      {{ item.name }} ({{ item.viewId }})
                    </a-option>
                  </a-select>
                </label>
                <label class="text-[11px] text-slate-600 font-medium block">
                  时区
                  <a-input v-model="itemForm.scheduleTimezone" class="mt-1" size="small" />
                </label>
              </div>

              <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-slate-50 space-y-1">
                <p class="m-0">
                  主库：{{ syncDetail?.source.appName || '-' }} / {{ itemForm.appToken || '-' }}
                </p>
                <p class="m-0">
                  当前子表：{{ itemForm.tableName || itemForm.tableId || '-' }} / {{ itemForm.viewName || itemForm.viewId || '-' }}
                </p>
                <p class="m-0">
                  最近执行：{{ currentItem.latestRunSummary ? formatDateTime(currentItem.latestRunSummary.startedAt) : '-' }}
                </p>
              </div>
            </section>

            <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                  字段概览
                </h3>
                <a-button size="mini" :loading="loadingFieldInspection" @click="inspectFields">
                  刷新字段
                </a-button>
              </div>
              <p v-if="fieldInspectionError" class="text-[11px] text-rose-600 m-0">
                {{ fieldInspectionError }}
              </p>
              <div v-else-if="fieldInspection.length" class="max-h-[220px] overflow-auto space-y-2">
                <div v-for="field in fieldInspection" :key="field.fieldName" class="px-3 py-2 border border-slate-200 rounded">
                  <div class="flex gap-2 items-center justify-between">
                    <span class="text-[11px] text-slate-900 font-medium">{{ field.fieldName }}</span>
                    <span class="text-[10px] text-slate-400">命中 {{ field.sampleCount }}</span>
                  </div>
                  <p class="text-[10px] text-slate-500 m-0 mt-1">
                    {{ fieldSamplePreview(field.sampleValues) }}
                  </p>
                </div>
              </div>
              <a-empty v-else description="当前视图暂无可巡检字段" />
            </section>

            <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                  映射配置
                </h3>
                <div class="flex gap-2">
                  <a-button size="mini" @click="loadMappingWizardFromJson">
                    从 JSON 读取
                  </a-button>
                  <a-button size="mini" @click="applyMappingWizardToJson">
                    写回 JSON
                  </a-button>
                  <a-button size="mini" @click="addMappingWizardBinding">
                    添加映射
                  </a-button>
                </div>
              </div>

              <div v-if="mappingWizardBindings.length" class="space-y-2">
                <div v-for="(binding, index) in mappingWizardBindings" :key="`binding-${index}`" class="p-3 border border-slate-200 rounded space-y-2">
                  <div class="gap-2 grid md:grid-cols-[180px,minmax(0,1fr),minmax(0,1fr),72px]">
                    <a-select v-model="binding.targetKey" size="small" placeholder="目标字段">
                      <a-option v-for="item in activeMappingOptions" :key="item.key" :value="item.key">
                        {{ item.label }}
                      </a-option>
                    </a-select>
                    <a-select v-model="binding.sourceField" size="small" allow-search allow-clear placeholder="来源字段">
                      <a-option v-for="field in fieldInspection" :key="field.fieldName" :value="field.fieldName">
                        {{ field.fieldName }}
                      </a-option>
                    </a-select>
                    <a-input v-model="binding.transform" size="small" allow-clear placeholder="transform（可选）" />
                    <a-button size="mini" status="danger" @click="removeMappingWizardBinding(index)">
                      删除
                    </a-button>
                  </div>
                  <p class="text-[10px] text-slate-500 m-0">
                    样本：{{ fieldSamplePreview(fieldInspection.find(field => field.fieldName === binding.sourceField)?.sampleValues || []) }}
                  </p>
                </div>
              </div>
              <a-empty v-else description="还没有可视化映射，点击上方按钮新增" />

              <label class="text-[11px] text-slate-600 font-medium block">
                映射 JSON
                <a-textarea v-model="itemForm.mappingText" class="font-mono mt-1" :auto-size="{ minRows: 8, maxRows: 18 }" />
              </label>
            </section>

            <section class="gap-4 grid xl:grid-cols-2">
              <div class="p-4 border border-slate-200 rounded bg-white space-y-3">
                <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                  同步选项
                </h3>
                <a-textarea v-model="itemForm.optionsText" class="font-mono" :auto-size="{ minRows: 8, maxRows: 16 }" />
              </div>
              <div class="p-4 border border-slate-200 rounded bg-white space-y-3">
                <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                  回填配置
                </h3>
                <a-textarea v-model="itemForm.writebackText" class="font-mono" :auto-size="{ minRows: 8, maxRows: 16 }" />
              </div>
            </section>

            <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
              <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                调度配置
              </h3>
              <div class="gap-3 grid md:grid-cols-4">
                <div class="text-[11px] text-slate-600 font-medium block">
                  <div>启用定时</div>
                  <div class="mt-2">
                    <a-switch v-model="itemForm.scheduleEnabled" />
                  </div>
                </div>
                <label class="text-[11px] text-slate-600 font-medium block">
                  调度模式
                  <a-select v-model="itemForm.scheduleMode" class="mt-1" size="small">
                    <a-option v-for="option in SCHEDULE_MODE_OPTIONS" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </a-option>
                  </a-select>
                </label>
                <label v-if="itemForm.scheduleMode === 'interval'" class="text-[11px] text-slate-600 font-medium block">
                  间隔分钟
                  <a-input-number v-model="itemForm.scheduleIntervalMinutes" class="mt-1 w-full" size="small" :min="1" :step="5" />
                </label>
                <label v-else class="text-[11px] text-slate-600 font-medium block md:col-span-2">
                  Cron
                  <a-input v-model="itemForm.scheduleCronExpr" class="mt-1" size="small" />
                </label>
              </div>
            </section>

            <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                  预检结果
                </h3>
                <span class="text-[10px] text-slate-500">{{ previewActionSummary(previewResult) }}</span>
              </div>
              <template v-if="previewResult">
                <div class="flex flex-wrap gap-2">
                  <a-tag v-if="previewResult.issueCounts.externalIdMissing" color="red">
                    externalId 缺失 {{ previewResult.issueCounts.externalIdMissing }}
                  </a-tag>
                  <a-tag v-if="previewResult.issueCounts.missingRequiredField" color="orange">
                    必填缺失 {{ previewResult.issueCounts.missingRequiredField }}
                  </a-tag>
                  <a-tag v-if="previewResult.issueCounts.transformError" color="red">
                    transform 错误 {{ previewResult.issueCounts.transformError }}
                  </a-tag>
                  <a-tag v-if="previewResult.issueCounts.writebackFieldMissing" color="gold">
                    回填字段缺失 {{ previewResult.issueCounts.writebackFieldMissing }}
                  </a-tag>
                </div>
                <div v-if="previewResult.fieldDiagnostics.length" class="space-y-1">
                  <p class="text-[11px] text-slate-700 font-medium m-0">
                    诊断
                  </p>
                  <div v-for="(item, index) in previewResult.fieldDiagnostics.slice(0, 8)" :key="`diag-${index}`" class="text-[10px]" :class="diagnosticClass(item.level)">
                    {{ item.message }}<span v-if="item.detail">：{{ item.detail }}</span>
                  </div>
                </div>
              </template>
            </section>

            <section class="gap-4 grid xl:grid-cols-2">
              <div class="p-4 border border-slate-200 rounded bg-white space-y-3">
                <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                  最近执行
                </h3>
                <div v-if="currentItem.recentRuns.length" class="space-y-2">
                  <div v-for="run in currentItem.recentRuns" :key="run.id" class="px-3 py-2 border border-slate-200 rounded">
                    <p class="text-[11px] text-slate-900 m-0">
                      {{ formatDateTime(run.startedAt) }} / {{ runStatusLabel(run.status) }}
                    </p>
                    <p class="text-[10px] text-slate-500 m-0 mt-1">
                      抓取 {{ run.fetchedCount }} / 新增 {{ run.createdCount }} / 更新 {{ run.updatedCount }} / 跳过 {{ run.skippedCount }} / 错误 {{ run.errorCount }}
                    </p>
                  </div>
                </div>
                <a-empty v-else description="暂无执行记录" />
              </div>

              <div class="p-4 border border-slate-200 rounded bg-white space-y-3">
                <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                  关联问题
                </h3>
                <div v-if="currentItem.issues.length" class="space-y-2">
                  <div v-for="issue in currentItem.issues" :key="issue.id" class="px-3 py-2 border border-slate-200 rounded">
                    <p class="text-[11px] text-slate-900 m-0">
                      {{ issue.reasonCode }} / {{ issue.status }}
                    </p>
                    <p class="text-[10px] text-slate-500 m-0 mt-1">
                      {{ issue.message }}
                    </p>
                  </div>
                </div>
                <a-empty v-else description="暂无问题单" />
              </div>
            </section>
          </template>

          <a-empty v-else description="请先从左侧选择一个子表同步项" />
        </a-spin>
      </main>
    </div>

    <a-drawer
      v-model:visible="addItemDrawerVisible"
      title="新增子表同步项"
      :mask-closable="!creatingItem"
      :closable="!creatingItem"
      :footer="false"
      width="520px"
    >
      <div class="space-y-3">
        <label class="text-[11px] text-slate-600 font-medium block">
          同步项名称
          <a-input v-model="newItemForm.name" class="mt-1" size="small" allow-clear placeholder="可留空，默认用表名" />
        </label>
        <label class="text-[11px] text-slate-600 font-medium block">
          同步到
          <a-select v-model="newItemForm.entityType" class="mt-1" size="small">
            <a-option v-for="option in ENTITY_TYPE_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </a-option>
          </a-select>
        </label>
        <label class="text-[11px] text-slate-600 font-medium block">
          子表 tableId
          <a-select v-model="newItemForm.tableId" class="mt-1" size="small" allow-search allow-clear @change="() => { newItemForm.viewId = ''; void loadNewItemViews() }">
            <a-option v-for="item in availableTables" :key="item.tableId" :value="item.tableId">
              {{ item.name }} ({{ item.tableId }})
            </a-option>
          </a-select>
        </label>
        <label class="text-[11px] text-slate-600 font-medium block">
          视图 viewId（可选）
          <a-select v-model="newItemForm.viewId" class="mt-1" size="small" allow-search allow-clear>
            <a-option v-for="item in newItemViews" :key="item.viewId" :value="item.viewId">
              {{ item.name }} ({{ item.viewId }})
            </a-option>
          </a-select>
        </label>
        <div class="flex gap-2 justify-end">
          <a-button size="small" :disabled="creatingItem" @click="addItemDrawerVisible = false">
            取消
          </a-button>
          <a-button size="small" type="primary" :loading="creatingItem" @click="createItem">
            创建
          </a-button>
        </div>
      </div>
    </a-drawer>
  </div>
</template>

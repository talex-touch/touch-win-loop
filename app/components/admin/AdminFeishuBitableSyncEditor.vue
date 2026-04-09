<script setup lang="ts">
import type {
  ApiResponse,
  FeishuBitableSync,
  FeishuBitableSyncDetail,
  FeishuBitableSyncEnvironment,
  FeishuBitableSyncItem,
  FeishuBitableSyncItemDetail,
  FeishuBitableSyncItemEntityType,
  FeishuBitableSyncItemPreviewRequest,
  FeishuBitableSyncItemPreviewResult,
  FeishuBitableTableMeta,
  FeishuBitableViewMeta,
  FeishuFieldDiagnosticItem,
  FeishuFieldInspectionItem,
  FeishuTaskLatestRunSummary,
  FeishuTaskScheduleMode,
} from '~~/shared/types/domain'
import {
  buildDefaultSyncItemConfig,
  buildSuggestedSyncItemName,
  isSyncItemConfigEmpty,
  listRequiredSyncItemFieldKeys,
  suggestSyncItemEntityType,
} from '~~/shared/utils/feishu-bitable-sync-config'

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

interface SyncOptionFormState {
  contestId: string
  defaultVisibility: string
  defaultStatus: string
  defaultResourceCategory: string
  defaultResourceAccessLevel: string
}

interface SyncWritebackFormState {
  enabled: boolean
  status: string
  syncedAt: string
  errorMessage: string
  reasonCode: string
  entityId: string
  runId: string
  triggerSource: string
  success: string
  failed: string
  skipped: string
}

type SyncWritebackFieldKey = keyof Pick<SyncWritebackFormState, 'status' | 'syncedAt' | 'errorMessage' | 'reasonCode' | 'entityId' | 'runId' | 'triggerSource'>
type SaveCurrentItemContext = 'main' | 'mapping'

const props = withDefaults(defineProps<{
  syncId: string
  selectedItemId?: string | null
  draftTableId?: string | null
  draftViewId?: string | null
  includeArchived?: boolean
  embedded?: boolean
  showBackButton?: boolean
}>(), {
  selectedItemId: '',
  draftTableId: '',
  draftViewId: '',
  includeArchived: false,
  embedded: false,
  showBackButton: true,
})

const emit = defineEmits<{
  (event: 'itemChange', itemId: string): void
  (event: 'updated'): void
}>()

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

type ApiRequestError = Error & {
  data?: {
    message?: string
  }
}

function createApiRequestError(message: string): ApiRequestError {
  const error = new Error(message) as ApiRequestError
  error.data = { message }
  return error
}

async function requestApi<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    body?: unknown
  } = {},
  fallbackMessage = '请求失败。',
): Promise<T> {
  const headers = new Headers()
  let body: BodyInit | undefined

  if (options.body !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(options.body)
  }

  const response = await fetch(path, {
    method: options.method || 'GET',
    credentials: 'include',
    headers,
    body,
  })
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null
  if (!response.ok || !payload || payload.code !== 0)
    throw createApiRequestError(String(payload?.message || fallbackMessage))
  return payload.data
}

const MAPPING_OPTIONS: Record<FeishuBitableSyncItemEntityType, MappingOption[]> = {
  contest: [
    { key: 'externalId', label: 'externalId（主键）' },
    { key: 'name', label: 'name（名称）' },
    { key: 'officialUrl', label: 'officialUrl（官网）' },
    { key: 'summary', label: 'summary（简介）' },
    { key: 'level', label: 'level（级别）' },
    { key: 'disciplines', label: 'disciplines（学科）' },
    { key: 'keywords', label: 'keywords（关键词）' },
    { key: 'registrationWindow', label: 'registrationWindow（报名时间）' },
    { key: 'submissionDeadline', label: 'submissionDeadline（截止时间）' },
  ],
  track: [
    { key: 'externalId', label: 'externalId（主键）' },
    { key: 'contestExternalId', label: 'contestExternalId（赛事外部 ID）' },
    { key: 'name', label: 'name（赛道名）' },
    { key: 'summary', label: 'summary（简介）' },
    { key: 'coverImageUrl', label: 'coverImageUrl（封面）' },
    { key: 'location', label: 'location（具体位置）' },
    { key: 'organizer', label: 'organizer（主办方）' },
    { key: 'undertaker', label: 'undertaker（承办方）' },
    { key: 'participantRequirements', label: 'participantRequirements（参赛对象）' },
    { key: 'teamRule', label: 'teamRule（组队规则）' },
    { key: 'awardRatio', label: 'awardRatio（获奖比例）' },
    { key: 'suitableMajors', label: 'suitableMajors（适用专业）' },
    { key: 'deliverableTypes', label: 'deliverableTypes（交付物类型）' },
    { key: 'sortOrder', label: 'sortOrder（排序）' },
    { key: 'evidenceRequirements', label: 'evidenceRequirements（必备项）' },
    { key: 'scoringPoints', label: 'scoringPoints（加分项）' },
    { key: 'deductionItems', label: 'deductionItems（扣分项）' },
  ],
  track_timeline: [
    { key: 'externalId', label: 'externalId（主键）' },
    { key: 'contestExternalId', label: 'contestExternalId（赛事外部 ID）' },
    { key: 'trackExternalId', label: 'trackExternalId（赛道外部 ID）' },
    { key: 'year', label: 'year（年份）' },
    { key: 'nodeType', label: 'nodeType（节点类型）' },
    { key: 'startAt', label: 'startAt（开始时间）' },
    { key: 'endAt', label: 'endAt（结束时间）' },
    { key: 'note', label: 'note（备注）' },
    { key: 'sourceLink', label: 'sourceLink（来源链接）' },
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
  externalId: ['external_id', 'externalid', 'id', 'record_id', '业务id', '外部id', '外部编号', '唯一标识', '编号', '主键', '赛事编号', '竞赛编号', '赛道编号', '资料编号'],
  contestExternalId: ['contest_external_id', 'contestid', '赛事外部id', '赛事id', '竞赛外部id', '竞赛id', '所属赛事id', '所属竞赛id'],
  trackExternalId: ['track_external_id', 'trackid', '赛道外部id', '赛道id', '所属赛道id'],
  name: ['name', '名称', '名字', '竞赛名称', '赛事名称', '赛道名称'],
  title: ['title', '标题', '资料标题', '资源标题'],
  summary: ['summary', '简介', '描述', '说明', '概述'],
  content: ['content', '正文', '内容', '详情', '全文'],
  officialUrl: ['officialurl', 'official_url', '官网', '官网链接', '赛事链接', '竞赛链接', '报名链接', 'url'],
  disciplines: ['disciplines', '学科', '专业', '所属学科'],
  keywords: ['keywords', '关键字', '关键词', '标签'],
  registrationWindow: ['registrationwindow', 'registration_window', '报名时间', '报名窗口'],
  submissionDeadline: ['submissiondeadline', 'submission_deadline', '截止时间', '提交截止时间', '提交时间'],
  coverImageUrl: ['coverimageurl', 'cover_image_url', '封面', '封面图', '封面图片', '图片链接'],
  location: ['location', '位置', '具体位置', '地点', '赛道位置'],
  organizer: ['organizer', '主办方', '主办单位', '主办'],
  undertaker: ['undertaker', '承办方', '承办单位', '承办'],
  participantRequirements: ['participantrequirements', 'participant_requirements', '参赛对象', '适用对象', '参赛要求'],
  teamRule: ['teamrule', 'team_rule', '组队规则', '组队要求'],
  awardRatio: ['awardratio', 'award_ratio', '获奖比例'],
  suitableMajors: ['suitablemajors', '适合专业', '适用专业', '推荐专业'],
  deliverableTypes: ['deliverabletypes', '交付物', '成果类型', '提交物'],
  sortOrder: ['sortorder', '排序', '序号', 'sort', 'order'],
  evidenceRequirements: ['evidencerequirements', 'evidence_requirements', '必备项', '必备材料', '必须项'],
  scoringPoints: ['scoringpoints', 'scoring_points', '加分项', '亮点', '加分点'],
  deductionItems: ['deductionitems', 'deduction_items', '扣分项', '风险项', '减分项'],
  nodeType: ['nodetype', 'node_type', '节点类型', '阶段类型'],
  startAt: ['startat', 'start_at', '开始时间', '开始日期'],
  endAt: ['endat', 'end_at', '结束时间', '结束日期', '截止时间'],
  note: ['note', '备注', '说明'],
  sourceLink: ['sourcelink', 'source_link', '来源链接', '来源地址'],
  category: ['category', '分类', '资料分类'],
  url: ['url', '链接', '资料链接', '资源链接', '下载链接'],
  sourceType: ['sourcetype', '来源类型', '资源类型'],
  year: ['year', '年份', '年度'],
}

const ENTITY_TYPE_OPTIONS: SelectOption<FeishuBitableSyncItemEntityType>[] = [
  { value: 'contest', label: '竞赛' },
  { value: 'track', label: '赛道' },
  { value: 'track_timeline', label: '赛道时间线' },
  { value: 'resource', label: '资料' },
]

const SCHEDULE_MODE_OPTIONS: SelectOption<FeishuTaskScheduleMode>[] = [
  { value: 'interval', label: '固定间隔' },
  { value: 'cron', label: 'Cron 表达式' },
]

const SYNC_ENVIRONMENT_OPTIONS: Array<SelectOption<string> & { tagColor: string }> = [
  { value: '', label: '未标记', tagColor: 'gray' },
  { value: 'test', label: '测试环境', tagColor: 'gold' },
  { value: 'production', label: '正式环境', tagColor: 'green' },
]

const RESOURCE_VISIBILITY_OPTIONS = [
  { value: 'internal', label: '内部' },
  { value: 'public', label: '公开' },
]

const RESOURCE_STATUS_OPTIONS = [
  { value: 'active', label: 'active' },
  { value: 'draft', label: 'draft' },
  { value: 'archived', label: 'archived' },
]

const RESOURCE_CATEGORY_OPTIONS = [
  { value: 'basic_info', label: 'basic_info' },
  { value: 'guide', label: 'guide' },
  { value: 'news', label: 'news' },
  { value: 'material', label: 'material' },
]

const RESOURCE_ACCESS_LEVEL_OPTIONS = [
  { value: 'public', label: 'public' },
  { value: 'private', label: 'private' },
  { value: 'team', label: 'team' },
]

const QUICK_START_STEPS = [
  '1. 新增同步项并选择同步到哪类实体。',
  '2. 选择当前主库下的子表和视图。',
  '3. 打开详细配置后查看字段概览，确认系统自动猜测的映射。',
  '4. 补齐必填字段，尤其是 externalId 和关联实体 ID。',
  '5. 配置飞书回填列，先预检，再决定是否在主同步信息里启用调度。',
  '6. 首次建议手动执行一次，确认飞书侧出现已同步状态。',
]

const WRITEBACK_FIELD_CONFIGS: Array<{ key: SyncWritebackFieldKey, label: string }> = [
  { key: 'status', label: '状态字段' },
  { key: 'syncedAt', label: '同步时间字段' },
  { key: 'errorMessage', label: '错误摘要字段' },
  { key: 'reasonCode', label: '原因码字段' },
  { key: 'entityId', label: '平台实体 ID 字段' },
  { key: 'runId', label: 'runId 字段' },
  { key: 'triggerSource', label: 'triggerSource 字段' },
]

const REQUIRED_MAPPING_FIELD_KEYS: Record<FeishuBitableSyncItemEntityType, string[]> = {
  contest: ['externalId', 'name', 'officialUrl'],
  track: ['externalId', 'contestExternalId', 'name'],
  track_timeline: ['externalId', 'contestExternalId', 'trackExternalId', 'nodeType'],
  resource: ['externalId', 'contestExternalId', 'title', 'url'],
}

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
const itemToggleMutating = reactive<Record<string, boolean>>({})
const addItemDrawerVisible = ref(false)
const itemDrawerVisible = ref(false)
const mappingDrawerVisible = ref(false)
const writebackDrawerVisible = ref(false)
const suppressVisualSync = ref(false)
const syncingNewItemSuggestion = ref(false)
const newItemNameAuto = ref(true)

const feedbackError = ref('')
const feedbackSuccess = ref('')
const mappingSaveSuccess = ref('')

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
  enabled: true,
  environment: '' as '' | FeishuBitableSyncEnvironment,
  scheduleEnabled: false,
  scheduleMode: 'interval' as FeishuTaskScheduleMode,
  scheduleIntervalMinutes: 60,
  scheduleCronExpr: '0 * * * *',
  scheduleTimezone: 'Asia/Shanghai',
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
  mappingText: JSON.stringify(buildDefaultSyncItemConfig('contest').mapping, null, 2),
  optionsText: JSON.stringify(buildDefaultSyncItemConfig('contest').options, null, 2),
  writebackText: JSON.stringify(buildDefaultSyncItemConfig('contest').writeback, null, 2),
})

const optionForm = reactive<SyncOptionFormState>({
  contestId: '',
  defaultVisibility: 'internal',
  defaultStatus: 'active',
  defaultResourceCategory: 'basic_info',
  defaultResourceAccessLevel: 'public',
})

const writebackForm = reactive<SyncWritebackFormState>({
  enabled: true,
  status: '',
  syncedAt: '',
  errorMessage: '',
  reasonCode: '',
  entityId: '',
  runId: '',
  triggerSource: '',
  success: '已同步',
  failed: '失败',
  skipped: '跳过',
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
const archivedReadonly = computed(() => Boolean(props.includeArchived || syncDetail.value?.archivedAt))
const syncExecutionDisabled = computed(() => Boolean(syncDetail.value) && !syncDetail.value?.enabled)
const currentItemRunDisabled = computed(() => archivedReadonly.value || syncExecutionDisabled.value || !currentItem.value?.isEnabled)
const activeMappingOptions = computed(() => MAPPING_OPTIONS[itemForm.entityType] || [])
const syncItems = computed(() => syncDetail.value?.items || [])
const activeOptionFieldGroups = computed(() => optionFieldGroups(itemForm.entityType))
const newItemTableName = computed(() => availableTables.value.find(item => item.tableId === newItemForm.tableId)?.name || '')
const newItemViewName = computed(() => newItemViews.value.find(item => item.viewId === newItemForm.viewId)?.name || '')
const missingRequiredMappingLabels = computed(() => {
  const requiredKeys = new Set(REQUIRED_MAPPING_FIELD_KEYS[itemForm.entityType] || [])
  return mappingWizardBindings.value
    .filter(binding => requiredKeys.has(binding.targetKey) && !toText(binding.sourceField))
    .map(binding => mappingOptionLabel(binding.targetKey))
})
const newItemRequiredMappingLabels = computed(() => listRequiredSyncItemFieldKeys(newItemForm.entityType).map(key => mappingOptionLabelByEntityType(newItemForm.entityType, key)))
const newItemSuggestedEntityType = computed(() => suggestSyncItemEntityType({
  tableName: newItemTableName.value,
  viewName: newItemViewName.value,
  name: newItemForm.name,
}))
const canRefreshFieldInspection = computed(() => Boolean(toText(itemForm.tableId)) && !loadingItem.value && !loadingViews.value)
const configuredMappingCount = computed(() => mappingWizardBindings.value.filter(binding => Boolean(toText(binding.sourceField))).length)
const mappingFocusFieldLabels = computed(() => previewFocusFields(itemForm.entityType).map(item => mappingOptionLabel(item)))
const selectedWritebackFieldCount = computed(() => WRITEBACK_FIELD_CONFIGS.filter(field => Boolean(toText(writebackForm[field.key]))).length)
const writebackSelectableFieldCount = computed(() => fieldInspection.value.filter(field => Boolean(toText(field.fieldName))).length)
const writebackStatusLabel = computed(() => writebackForm.enabled ? '已启用回填' : '未启用回填')
const syncEnvironmentLabel = computed(() => SYNC_ENVIRONMENT_OPTIONS.find(item => item.value === syncForm.environment)?.label || '未标记')
const syncEnvironmentTagColor = computed(() => SYNC_ENVIRONMENT_OPTIONS.find(item => item.value === syncForm.environment)?.tagColor || 'gray')
const unexpectedConfiguredMappingLabels = computed(() => {
  const parsed = pickMappingFromRaw(parseJsonTextLoose(itemForm.mappingText))
  const supportedKeys = new Set(activeMappingOptions.value.map(item => item.key))
  const configuredKeys = new Set<string>()
  for (const key of Object.keys(parsed.fieldMap))
    configuredKeys.add(key)
  if (parsed.externalIdField)
    configuredKeys.add('externalId')
  if (parsed.contestExternalIdField)
    configuredKeys.add('contestExternalId')
  if (parsed.trackExternalIdField)
    configuredKeys.add('trackExternalId')
  return [...configuredKeys]
    .filter(key => !supportedKeys.has(key))
    .map(key => mappingOptionLabelByEntityType(itemForm.entityType, key))
})

function optionFieldGroups(entityType: FeishuBitableSyncItemEntityType) {
  if (entityType === 'track') {
    return [{
      key: 'contestId',
      label: '默认 contestId',
      description: '当赛道没有从飞书列里映射 contestExternalId 时，可用这个值兜底绑定到固定竞赛。',
    }]
  }

  if (entityType === 'resource') {
    return [
      {
        key: 'contestId',
        label: '默认 contestId',
        description: '资源没有显式竞赛外部 ID 时，可用固定 contestId 兜底。',
      },
      {
        key: 'defaultVisibility',
        label: '默认可见性',
        description: '资源未显式指定时，默认按这里写入可见性。',
      },
      {
        key: 'defaultStatus',
        label: '默认状态',
        description: '资源未显式指定时，默认状态。',
      },
      {
        key: 'defaultResourceCategory',
        label: '默认资料分类',
        description: '资源未显式给分类时，默认使用这个分类。',
      },
      {
        key: 'defaultResourceAccessLevel',
        label: '默认访问级别',
        description: '资源未显式给访问级别时，默认使用这个值。',
      },
    ]
  }

  return []
}

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
  mappingSaveSuccess.value = ''
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function formatJson(raw: unknown): string {
  return JSON.stringify(raw || {}, null, 2)
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

function withVisualSyncPaused(action: () => void) {
  suppressVisualSync.value = true
  try {
    action()
  }
  finally {
    suppressVisualSync.value = false
  }
}

function fieldSamplePreview(sampleValues: string[]): string {
  const values = Array.isArray(sampleValues)
    ? sampleValues.map(item => String(item || '').trim()).filter(Boolean).slice(0, 3)
    : []
  return values.join(' | ') || '-'
}

function selectableFieldNames(currentValue?: string) {
  const values = new Set<string>()
  for (const field of fieldInspection.value) {
    const fieldName = toText(field.fieldName)
    if (fieldName)
      values.add(fieldName)
  }
  const current = toText(currentValue)
  if (current)
    values.add(current)
  return [...values]
}

function normalizeKey(text: string): string {
  return String(text || '').trim().toLowerCase().replace(/[\s_\-]/g, '')
}

function parseJsonTextLoose(raw: string): Record<string, unknown> {
  try {
    const normalized = String(raw || '').trim()
    if (!normalized)
      return {}
    const parsed = JSON.parse(normalized)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  }
  catch {
    return {}
  }
}

function entityTypeLabel(entityType: FeishuBitableSyncItemEntityType): string {
  return ENTITY_TYPE_OPTIONS.find(item => item.value === entityType)?.label || entityType
}

function mappingOptionLabelByEntityType(entityType: FeishuBitableSyncItemEntityType, targetKey: string): string {
  return MAPPING_OPTIONS[entityType]?.find(item => item.key === targetKey)?.label || targetKey
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

function runStatusColor(status?: string | null): string {
  if (status === 'success')
    return 'green'
  if (status === 'partial_success')
    return 'gold'
  if (status === 'failed')
    return 'red'
  return 'gray'
}

function formatDateTime(value?: string | null): string {
  if (!value)
    return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function latestRunSummaryText(summary?: FeishuTaskLatestRunSummary | null): string {
  if (!summary)
    return '暂无执行记录'
  return `${formatDateTime(summary.startedAt)} / ${runStatusLabel(summary.status)} / 错误 ${summary.errorCount}`
}

function normalizeItemConfigText(entityType: FeishuBitableSyncItemEntityType, raw: {
  mapping?: Record<string, unknown> | null
  options?: Record<string, unknown> | null
  writeback?: Record<string, unknown> | null
}) {
  const defaults = buildDefaultSyncItemConfig(entityType)
  return {
    mappingText: formatJson(isSyncItemConfigEmpty(raw.mapping) ? defaults.mapping : raw.mapping || {}),
    optionsText: formatJson(isSyncItemConfigEmpty(raw.options) ? defaults.options : raw.options || {}),
    writebackText: formatJson(isSyncItemConfigEmpty(raw.writeback) ? defaults.writeback : raw.writeback || {}),
  }
}

function fillOptionForm(raw: Record<string, unknown>) {
  const defaults = buildDefaultSyncItemConfig(itemForm.entityType).options as Record<string, unknown>
  optionForm.contestId = toText(raw.contestId || defaults.contestId)
  optionForm.defaultVisibility = toText(raw.defaultVisibility || defaults.defaultVisibility || 'internal') || 'internal'
  optionForm.defaultStatus = toText(raw.defaultStatus || defaults.defaultStatus || 'active') || 'active'
  optionForm.defaultResourceCategory = toText(raw.defaultResourceCategory || defaults.defaultResourceCategory || 'basic_info') || 'basic_info'
  optionForm.defaultResourceAccessLevel = toText(raw.defaultResourceAccessLevel || defaults.defaultResourceAccessLevel || 'public') || 'public'
}

function fillWritebackForm(raw: Record<string, unknown>) {
  const defaults = buildDefaultSyncItemConfig(itemForm.entityType).writeback
  const rawFields = raw.fields && typeof raw.fields === 'object' && !Array.isArray(raw.fields)
    ? raw.fields as Record<string, unknown>
    : {}
  const defaultFields = defaults.fields || {}
  const rawValues = raw.values && typeof raw.values === 'object' && !Array.isArray(raw.values)
    ? raw.values as Record<string, unknown>
    : {}
  const defaultValues = defaults.values || {}

  writebackForm.enabled = raw.enabled === undefined ? defaults.enabled !== false : Boolean(raw.enabled)
  writebackForm.status = toText(rawFields.status || defaultFields.status)
  writebackForm.syncedAt = toText(rawFields.syncedAt || defaultFields.syncedAt)
  writebackForm.errorMessage = toText(rawFields.errorMessage || defaultFields.errorMessage)
  writebackForm.reasonCode = toText(rawFields.reasonCode || defaultFields.reasonCode)
  writebackForm.entityId = toText(rawFields.entityId || defaultFields.entityId)
  writebackForm.runId = toText(rawFields.runId || defaultFields.runId)
  writebackForm.triggerSource = toText(rawFields.triggerSource || defaultFields.triggerSource)
  writebackForm.success = toText(rawValues.success || defaultValues.success || '已同步') || '已同步'
  writebackForm.failed = toText(rawValues.failed || defaultValues.failed || '失败') || '失败'
  writebackForm.skipped = toText(rawValues.skipped || defaultValues.skipped || '跳过') || '跳过'
}

function buildOptionsPayload(entityType: FeishuBitableSyncItemEntityType): Record<string, unknown> {
  if (entityType === 'contest')
    return {}

  if (entityType === 'track') {
    return {
      contestId: toText(optionForm.contestId),
    }
  }

  if (entityType === 'resource') {
    return {
      contestId: toText(optionForm.contestId),
      defaultVisibility: toText(optionForm.defaultVisibility) || 'internal',
      defaultStatus: toText(optionForm.defaultStatus) || 'active',
      defaultResourceCategory: toText(optionForm.defaultResourceCategory) || 'basic_info',
      defaultResourceAccessLevel: toText(optionForm.defaultResourceAccessLevel) || 'public',
    }
  }

  return {}
}

function buildEmptyMappingBinding(targetKey: string): MappingWizardBinding {
  return {
    targetKey,
    sourceField: '',
    transform: '',
  }
}

function normalizeMappingWizardBindings(bindings: MappingWizardBinding[]) {
  const map = new Map<string, MappingWizardBinding>()
  for (const binding of bindings) {
    const targetKey = toText(binding.targetKey)
    if (!targetKey)
      continue
    map.set(targetKey, {
      targetKey,
      sourceField: toText(binding.sourceField),
      transform: toText(binding.transform),
    })
  }
  mappingWizardBindings.value = activeMappingOptions.value.map(option => map.get(option.key) || buildEmptyMappingBinding(option.key))
}

function mappingOptionLabel(targetKey: string): string {
  return activeMappingOptions.value.find(item => item.key === targetKey)?.label || targetKey
}

function previewRowStatusLabel(status: string): string {
  if (status === 'created')
    return '将新增'
  if (status === 'updated')
    return '将更新'
  if (status === 'skipped')
    return '将跳过'
  return '异常'
}

function previewRowStatusColor(status: string): string {
  if (status === 'created')
    return 'green'
  if (status === 'updated')
    return 'arcoblue'
  if (status === 'skipped')
    return 'gold'
  return 'red'
}

function previewFocusFields(entityType: FeishuBitableSyncItemEntityType): string[] {
  if (entityType === 'track')
    return ['externalId', 'contestExternalId', 'name']
  if (entityType === 'track_timeline')
    return ['externalId', 'contestExternalId', 'trackExternalId', 'nodeType', 'year']
  if (entityType === 'resource')
    return ['externalId', 'contestExternalId', 'trackExternalId', 'title', 'url']
  return ['externalId', 'name', 'officialUrl', 'registrationWindow', 'submissionDeadline']
}

function isRequiredMappingField(entityType: FeishuBitableSyncItemEntityType, targetKey: string): boolean {
  return (REQUIRED_MAPPING_FIELD_KEYS[entityType] || []).includes(targetKey)
}

function buildWritebackPayload(): Record<string, unknown> {
  return {
    enabled: Boolean(writebackForm.enabled),
    fields: {
      status: toText(writebackForm.status),
      syncedAt: toText(writebackForm.syncedAt),
      errorMessage: toText(writebackForm.errorMessage),
      reasonCode: toText(writebackForm.reasonCode),
      entityId: toText(writebackForm.entityId),
      runId: toText(writebackForm.runId),
      triggerSource: toText(writebackForm.triggerSource),
    },
    values: {
      success: toText(writebackForm.success) || '已同步',
      failed: toText(writebackForm.failed) || '失败',
      skipped: toText(writebackForm.skipped) || '跳过',
    },
  }
}

function fillItemForm(item: FeishuBitableSyncItemDetail) {
  const normalized = normalizeItemConfigText(item.entityType, {
    mapping: item.mapping as Record<string, unknown>,
    options: item.options,
    writeback: item.writeback as Record<string, unknown> | undefined,
  })
  mappingSaveSuccess.value = ''

  withVisualSyncPaused(() => {
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
    itemForm.mappingText = normalized.mappingText
    itemForm.optionsText = normalized.optionsText
    itemForm.writebackText = normalized.writebackText
    loadMappingWizardFromJson()
    loadOptionsFormFromJson(false)
    loadWritebackFormFromJson(false)
  })
}

function closeNestedConfigDrawers() {
  mappingDrawerVisible.value = false
  writebackDrawerVisible.value = false
}

function resetCurrentItemState() {
  closeNestedConfigDrawers()
  currentItem.value = null
  previewResult.value = null
  fieldInspection.value = []
  fieldInspectionError.value = ''
  mappingWizardBindings.value = []
}

function withNewItemSuggestionSync(action: () => void) {
  syncingNewItemSuggestion.value = true
  try {
    action()
  }
  finally {
    syncingNewItemSuggestion.value = false
  }
}

function syncNewItemSuggestedName() {
  if (!newItemNameAuto.value)
    return
  const suggestedName = buildSuggestedSyncItemName(
    newItemForm.entityType,
    newItemTableName.value,
    newItemViewName.value,
  )
  withNewItemSuggestionSync(() => {
    newItemForm.name = suggestedName
  })
}

function applyNewItemSuggestions() {
  syncNewItemSuggestedName()
}

function applyDraftToNewItemForm() {
  newItemForm.tableId = normalizedDraftTableId.value
  newItemForm.viewId = normalizedDraftViewId.value
  applyNewItemSuggestions()
}

function loadOptionsFormFromJson(showNotice = true) {
  const options = parseJsonText(itemForm.optionsText, '同步选项')
  withVisualSyncPaused(() => {
    fillOptionForm(options)
  })
  if (showNotice)
    setSuccess('已从 JSON 回读同步选项。')
}

function syncOptionsFormToJson(showNotice = false) {
  itemForm.optionsText = formatJson(buildOptionsPayload(itemForm.entityType))
  if (showNotice)
    setSuccess('已将同步选项同步到 JSON。')
}

function loadWritebackFormFromJson(showNotice = true) {
  const writeback = parseJsonText(itemForm.writebackText, '回填配置')
  withVisualSyncPaused(() => {
    fillWritebackForm(writeback)
  })
  if (showNotice)
    setSuccess('已从 JSON 回读回填配置。')
}

function syncWritebackFormToJson(showNotice = false) {
  itemForm.writebackText = formatJson(buildWritebackPayload())
  if (showNotice)
    setSuccess('已将回填配置同步到 JSON。')
}

function normalizeCurrentEntityTemplate() {
  try {
    normalizeMappingWizardBindings(mappingWizardBindings.value)
    autoFillMappingWizardBindings()
    writeMappingWizardToJson(false)
    syncOptionsFormToJson(false)
    syncWritebackFormToJson(false)
    loadMappingWizardFromJson()
    loadOptionsFormFromJson(false)
    loadWritebackFormFromJson(false)
    setSuccess('已按当前实体类型整理配置，并保留可识别的字段映射。')
  }
  catch (error) {
    setError(error instanceof Error ? error.message : '整理当前实体模板失败。')
  }
}

function applyRecommendedTemplateIfNeeded(entityType: FeishuBitableSyncItemEntityType) {
  const defaults = buildDefaultSyncItemConfig(entityType)
  const mapping = parseJsonText(itemForm.mappingText, '字段映射')
  const options = parseJsonText(itemForm.optionsText, '同步选项')
  const writeback = parseJsonText(itemForm.writebackText, '回填配置')

  withVisualSyncPaused(() => {
    if (isSyncItemConfigEmpty(mapping)) {
      itemForm.mappingText = formatJson(defaults.mapping)
      loadMappingWizardFromJson()
    }
    if (isSyncItemConfigEmpty(options)) {
      itemForm.optionsText = formatJson(defaults.options)
      fillOptionForm(defaults.options)
    }
    if (isSyncItemConfigEmpty(writeback)) {
      itemForm.writebackText = formatJson(defaults.writeback)
      fillWritebackForm(defaults.writeback as Record<string, unknown>)
    }
  })
}

async function loadSyncDetail() {
  if (!normalizedSyncId.value)
    return
  loadingSync.value = true
  clearFeedback()
  try {
    const query = new URLSearchParams({
      includeInactive: 'true',
    })
    if (props.includeArchived)
      query.set('includeArchived', 'true')
    const response = await fetch(endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}?${query.toString()}`), {
      credentials: 'include',
    })
    const payload = await response.json().catch(() => null) as ApiResponse<FeishuBitableSyncDetail> | null
    if (!response.ok || !payload || payload.code !== 0)
      throw new Error(String(payload?.message || '同步配置加载失败。'))

    const detail = payload.data
    syncDetail.value = detail
    syncForm.name = detail.name || ''
    syncForm.enabled = Boolean(detail.enabled)
    syncForm.environment = detail.source.environment === 'production' || detail.source.environment === 'test'
      ? detail.source.environment
      : ''
    syncForm.scheduleEnabled = Boolean(detail.schedule?.enabled)
    syncForm.scheduleMode = detail.schedule?.mode === 'cron' ? 'cron' : 'interval'
    syncForm.scheduleIntervalMinutes = Number(detail.schedule?.intervalMinutes || 60)
    syncForm.scheduleCronExpr = detail.schedule?.cronExpr || '0 * * * *'
    syncForm.scheduleTimezone = detail.schedule?.timezone || 'Asia/Shanghai'
    itemForm.appToken = detail.source.appToken || ''
    itemForm.appName = detail.source.appName || ''
    await loadTables()

    const nextItemId = normalizedSelectedItemId.value && detail.items.some(item => item.id === normalizedSelectedItemId.value)
      ? normalizedSelectedItemId.value
      : itemDrawerVisible.value && activeItemId.value && detail.items.some(item => item.id === activeItemId.value)
        ? activeItemId.value
        : ''

    if (nextItemId) {
      activeItemId.value = nextItemId
      itemDrawerVisible.value = true
      await loadItemDetail(nextItemId)
    }
    else {
      resetCurrentItemState()
      applyDraftToNewItemForm()
      if (newItemForm.tableId)
        await loadNewItemViews()
      else
        newItemViews.value = []
      if (!syncItems.value.length && (newItemForm.tableId || newItemForm.viewId))
        addItemDrawerVisible.value = true
    }
  }
  catch (error: any) {
    syncDetail.value = null
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
    const query = new URLSearchParams({
      runLimit: '20',
      issueLimit: '50',
    })
    if (props.includeArchived)
      query.set('includeArchived', 'true')
    const data = await requestApi<FeishuBitableSyncItemDetail>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}/items/${encodeURIComponent(itemId)}?${query.toString()}`),
      {},
      '子表同步项详情加载失败。',
    )
    currentItem.value = data
    fillItemForm(data)
    previewResult.value = null
    await loadViews()
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

async function openItemDrawer(itemId: string, emitChange = true) {
  const nextId = String(itemId || '').trim()
  if (!nextId)
    return
  if (activeItemId.value && activeItemId.value !== nextId)
    closeNestedConfigDrawers()
  activeItemId.value = nextId
  itemDrawerVisible.value = true
  if (emitChange)
    emit('itemChange', nextId)
  await loadItemDetail(nextId)
}

function closeItemDrawer() {
  closeNestedConfigDrawers()
  itemDrawerVisible.value = false
  previewResult.value = null
  fieldInspectionError.value = ''
  emit('itemChange', '')
}

async function loadTables() {
  const appToken = toText(syncDetail.value?.source.appToken || itemForm.appToken)
  if (!appToken) {
    availableTables.value = []
    return
  }

  loadingTables.value = true
  try {
    const data = await requestApi<FeishuBitableTableMeta[]>(
      endpoint(`/admin/integrations/feishu/bitable/sources/${encodeURIComponent(appToken)}/tables`),
      {},
      '可用数据表加载失败。',
    )
    availableTables.value = data || []
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
    const data = await requestApi<{ tables: FeishuBitableTableMeta[], views: FeishuBitableViewMeta[] }>(
      endpoint(`/admin/integrations/feishu/bitable/sources/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/views`),
      {},
      '可用视图加载失败。',
    )
    availableViews.value = data.views || []
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
    applyNewItemSuggestions()
    return
  }

  loadingViews.value = true
  try {
    const data = await requestApi<{ tables: FeishuBitableTableMeta[], views: FeishuBitableViewMeta[] }>(
      endpoint(`/admin/integrations/feishu/bitable/sources/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/views`),
      {},
      '新增同步项视图加载失败。',
    )
    newItemViews.value = data.views || []
  }
  catch {
    newItemViews.value = []
  }
  finally {
    loadingViews.value = false
    applyNewItemSuggestions()
  }
}

async function handleNewItemTableChange() {
  newItemForm.viewId = ''
  await loadNewItemViews()
}

function handleNewItemViewChange() {
  applyNewItemSuggestions()
}

function useAutoDetectedNewItemEntityType() {
  if (!newItemSuggestedEntityType.value)
    return
  withNewItemSuggestionSync(() => {
    newItemForm.entityType = newItemSuggestedEntityType.value || newItemForm.entityType
  })
  if (newItemNameAuto.value)
    syncNewItemSuggestedName()
}

function useSuggestedNewItemName() {
  newItemNameAuto.value = true
  applyNewItemSuggestions()
}

function syncSelectedNames() {
  itemForm.tableName = availableTables.value.find(item => item.tableId === itemForm.tableId)?.name || itemForm.tableName
  itemForm.viewName = availableViews.value.find(item => item.viewId === itemForm.viewId)?.name || itemForm.viewName
}

async function handleItemTableChange() {
  itemForm.viewId = ''
  itemForm.viewName = ''
  syncSelectedNames()
  await loadViews()
  await inspectFields()
}

async function handleItemViewChange() {
  syncSelectedNames()
  await inspectFields()
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
  normalizeMappingWizardBindings([...dedup.values()])
}

function buildSupportedMappingTargetKeys(entityType: FeishuBitableSyncItemEntityType) {
  return new Set((MAPPING_OPTIONS[entityType] || []).map(item => item.key))
}

function writeMappingWizardToJson(showNotice = false) {
  const mapping = parseJsonText(itemForm.mappingText, '字段映射')
  const supportedKeys = buildSupportedMappingTargetKeys(itemForm.entityType)
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
    const nextMatch = {
      ...(source.match && typeof source.match === 'object' && !Array.isArray(source.match) ? source.match : {}),
    } as Record<string, unknown>
    if (supportedKeys.has('externalId'))
      nextMatch.externalIdField = externalIdField
    else
      delete nextMatch.externalIdField
    if (supportedKeys.has('contestExternalId'))
      nextMatch.contestExternalIdField = contestExternalIdField
    else
      delete nextMatch.contestExternalIdField
    if (supportedKeys.has('trackExternalId'))
      nextMatch.trackExternalIdField = trackExternalIdField
    else
      delete nextMatch.trackExternalIdField
    source.match = nextMatch
    source.layers = restLayers
    itemForm.mappingText = JSON.stringify(source, null, 2)
  }
  else {
    const nextMapping = {
      ...mapping,
      fieldMap,
      computedMap,
    } as Record<string, unknown>
    if (supportedKeys.has('externalId'))
      nextMapping.externalIdField = externalIdField
    else
      delete nextMapping.externalIdField
    if (supportedKeys.has('contestExternalId'))
      nextMapping.contestExternalIdField = contestExternalIdField
    else
      delete nextMapping.contestExternalIdField
    if (supportedKeys.has('trackExternalId'))
      nextMapping.trackExternalIdField = trackExternalIdField
    else
      delete nextMapping.trackExternalIdField
    itemForm.mappingText = JSON.stringify(nextMapping, null, 2)
  }

  if (showNotice)
    setSuccess('已将映射配置同步到 JSON。')
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
  normalizeMappingWizardBindings(mappingWizardBindings.value.map((binding) => {
    if (binding.sourceField)
      return binding
    const guessedField = guessFieldNameByTarget(binding.targetKey)
    if (!guessedField)
      return binding
    return {
      ...binding,
      sourceField: guessedField,
    }
  }))
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
    const data = await requestApi<FeishuFieldInspectionItem[]>(
      endpoint('/admin/integrations/feishu/bitable/sources/inspect-fields'),
      {
        method: 'POST',
        body: {
          appToken,
          tableId,
          viewId: toText(itemForm.viewId),
          sampleRecords: 120,
        },
      },
      '字段巡检失败。',
    )
    fieldInspection.value = data || []
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

function applySavedItemLocally(savedItem: FeishuBitableSyncItem) {
  if (syncDetail.value) {
    syncDetail.value = {
      ...syncDetail.value,
      items: syncDetail.value.items.map(item => item.id === savedItem.id
        ? { ...item, ...savedItem }
        : item),
    }
  }

  if (!currentItem.value || currentItem.value.id !== savedItem.id)
    return

  const nextCurrentItem = {
    ...currentItem.value,
    ...savedItem,
  }
  currentItem.value = nextCurrentItem
  fillItemForm(nextCurrentItem)
}

async function saveCurrentItem(saveContext: SaveCurrentItemContext = 'main') {
  if (archivedReadonly.value) {
    setError('当前同步信息已归档，只允许查看，不允许修改子表同步项。')
    return
  }
  if (!normalizedSyncId.value || !currentItem.value)
    return

  clearFeedback()
  let mapping: Record<string, unknown>
  let options: Record<string, unknown>
  let writeback: Record<string, unknown>
  try {
    writeMappingWizardToJson(false)
    syncOptionsFormToJson(false)
    syncWritebackFormToJson(false)
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
    const data = await requestApi<FeishuBitableSyncItem>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}/items/${encodeURIComponent(currentItem.value.id)}`),
      {
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
        },
      },
      '子表同步项保存失败。',
    )
    applySavedItemLocally(data)
    previewResult.value = null
    emit('updated')
    if (saveContext === 'mapping') {
      mappingDrawerVisible.value = false
      mappingSaveSuccess.value = '基础映射已保存。'
      setSuccess('基础映射已保存。')
      return
    }
    setSuccess('子表同步项已保存。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || '子表同步项保存失败。'))
  }
  finally {
    savingItem.value = false
  }
}

async function toggleItemEnabled(item: FeishuBitableSyncItem, enabled: boolean) {
  if (archivedReadonly.value) {
    setError('当前同步信息已归档，只允许查看，不允许修改子表同步项。')
    return
  }
  if (!normalizedSyncId.value || !item.id)
    return

  itemToggleMutating[item.id] = true
  clearFeedback()
  try {
    await requestApi(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}/items/${encodeURIComponent(item.id)}`),
      {
        method: 'PATCH',
        body: {
          isEnabled: enabled,
        },
      },
      `子表同步项${enabled ? '启用' : '禁用'}失败。`,
    )
    await loadSyncDetail()
    emit('updated')
    setSuccess(`子表同步项已${enabled ? '启用' : '禁用'}。`)
  }
  catch (error: any) {
    setError(String(error?.data?.message || `子表同步项${enabled ? '启用' : '禁用'}失败。`))
  }
  finally {
    itemToggleMutating[item.id] = false
  }
}

async function saveSyncInfo() {
  if (archivedReadonly.value) {
    setError('当前同步信息已归档，只允许查看，不允许修改同步信息。')
    return
  }
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
    const nextSync = await requestApi<FeishuBitableSync>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}`),
      {
        method: 'PATCH',
        body: {
          name,
          enabled: syncForm.enabled,
          source: syncDetail.value
            ? {
                ...syncDetail.value.source,
                environment: syncForm.environment === 'production' || syncForm.environment === 'test'
                  ? syncForm.environment
                  : undefined,
              }
            : undefined,
          schedule: {
            enabled: syncForm.scheduleEnabled,
            mode: syncForm.scheduleMode,
            intervalMinutes: syncForm.scheduleMode === 'interval' ? Number(syncForm.scheduleIntervalMinutes || 60) : null,
            cronExpr: syncForm.scheduleMode === 'cron' ? syncForm.scheduleCronExpr.trim() : null,
            timezone: syncForm.scheduleTimezone.trim(),
          },
        },
      },
      '同步信息更新失败。',
    )
    const nextName = String(nextSync?.name || name).trim()
    if (syncDetail.value && nextSync) {
      syncDetail.value = {
        ...syncDetail.value,
        ...nextSync,
      }
    }
    syncForm.name = nextName
    syncForm.enabled = Boolean(nextSync?.enabled)
    syncForm.environment = nextSync?.source.environment === 'production' || nextSync?.source.environment === 'test'
      ? nextSync.source.environment
      : ''
    syncForm.scheduleEnabled = Boolean(nextSync?.schedule?.enabled)
    syncForm.scheduleMode = nextSync?.schedule?.mode === 'cron' ? 'cron' : 'interval'
    syncForm.scheduleIntervalMinutes = Number(nextSync?.schedule?.intervalMinutes || 60)
    syncForm.scheduleCronExpr = nextSync?.schedule?.cronExpr || '0 * * * *'
    syncForm.scheduleTimezone = nextSync?.schedule?.timezone || 'Asia/Shanghai'
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
  if (archivedReadonly.value) {
    setError('当前同步信息已归档，只允许查看，不允许执行预检。')
    return
  }
  if (!normalizedSyncId.value || !currentItem.value)
    return
  previewingItem.value = true
  clearFeedback()
  try {
    writeMappingWizardToJson(false)
    syncOptionsFormToJson(false)
    syncWritebackFormToJson(false)
    const mapping = parseJsonText(itemForm.mappingText, '字段映射')
    const options = parseJsonText(itemForm.optionsText, '同步选项')
    const writeback = parseJsonText(itemForm.writebackText, '状态回填配置')
    const draft: FeishuBitableSyncItemPreviewRequest = {
      source: {
        appToken: itemForm.appToken.trim(),
        appName: itemForm.appName.trim(),
        tableId: itemForm.tableId.trim(),
        tableName: itemForm.tableName.trim(),
        viewId: itemForm.viewId.trim(),
        viewName: itemForm.viewName.trim(),
        sourceUrl: itemForm.sourceUrl.trim(),
      },
      entityType: itemForm.entityType,
      mapping,
      options,
      writeback,
    }
    const data = await requestApi<FeishuBitableSyncItemPreviewResult>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}/items/${encodeURIComponent(currentItem.value.id)}/preview`),
      {
        method: 'POST',
        body: draft,
      },
      '预检失败。',
    )
    previewResult.value = data
    setSuccess('预检完成。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || error?.message || '预检失败。'))
  }
  finally {
    previewingItem.value = false
  }
}

async function runCurrentItem() {
  if (archivedReadonly.value) {
    setError('当前同步信息已归档，只允许查看，不允许手动执行。')
    return
  }
  if (!normalizedSyncId.value || !currentItem.value)
    return
  runningItem.value = true
  clearFeedback()
  try {
    await requestApi(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}/items/${encodeURIComponent(currentItem.value.id)}/run`),
      {
        method: 'POST',
      },
      '同步执行失败。',
    )
    await loadSyncDetail()
    if (activeItemId.value)
      await loadItemDetail(activeItemId.value)
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
  if (archivedReadonly.value) {
    setError('当前同步信息已归档，只允许查看，不允许新增子表同步项。')
    return
  }
  newItemForm.name = ''
  newItemForm.entityType = 'contest'
  newItemForm.tableId = ''
  newItemForm.viewId = ''
  newItemNameAuto.value = true
  newItemViews.value = []
  applyDraftToNewItemForm()
  if (newItemForm.tableId)
    await loadNewItemViews()
  else
    applyNewItemSuggestions()
  addItemDrawerVisible.value = true
}

async function createItem() {
  if (archivedReadonly.value) {
    setError('当前同步信息已归档，只允许查看，不允许新增子表同步项。')
    return
  }
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
    const defaults = buildDefaultSyncItemConfig(newItemForm.entityType)
    const data = await requestApi<FeishuBitableSyncItem>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}/items`),
      {
        method: 'POST',
        body: {
          name: newItemForm.name.trim() || buildSuggestedSyncItemName(newItemForm.entityType, tableName, viewName),
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
          mapping: defaults.mapping,
          options: defaults.options,
          writeback: defaults.writeback,
        },
      },
      '子表同步项创建失败。',
    )
    addItemDrawerVisible.value = false
    await loadSyncDetail()
    await openItemDrawer(data.id)
    emit('updated')
    setSuccess('子表同步项已创建，已自动带入推荐模板，默认保持禁用。')
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

watch(mappingWizardBindings, () => {
  if (suppressVisualSync.value)
    return
  writeMappingWizardToJson(false)
}, { deep: true })

watch(optionForm, () => {
  if (suppressVisualSync.value)
    return
  syncOptionsFormToJson(false)
}, { deep: true })

watch(writebackForm, () => {
  if (suppressVisualSync.value)
    return
  syncWritebackFormToJson(false)
}, { deep: true })

watch(() => newItemForm.name, (value) => {
  if (syncingNewItemSuggestion.value)
    return
  if (!toText(value)) {
    newItemNameAuto.value = true
    applyNewItemSuggestions()
    return
  }
  const suggestedName = buildSuggestedSyncItemName(
    newItemForm.entityType,
    newItemTableName.value,
    newItemViewName.value,
  )
  newItemNameAuto.value = toText(value) === toText(suggestedName)
})

watch(() => newItemForm.entityType, () => {
  if (syncingNewItemSuggestion.value)
    return
  if (newItemNameAuto.value)
    syncNewItemSuggestedName()
})

watch(() => itemForm.entityType, (value, previousValue) => {
  if (!value || value === previousValue || suppressVisualSync.value)
    return
  try {
    applyRecommendedTemplateIfNeeded(value)
    loadMappingWizardFromJson()
  }
  catch (error) {
    setError(error instanceof Error ? error.message : '推荐模板更新失败。')
  }
})

watch(() => props.syncId, () => {
  void loadSyncDetail()
}, { immediate: true })

watch(() => props.selectedItemId, (value) => {
  const nextId = String(value || '').trim()
  if (!nextId) {
    closeNestedConfigDrawers()
    if (itemDrawerVisible.value)
      itemDrawerVisible.value = false
    return
  }
  if (!syncItems.value.some(item => item.id === nextId))
    return
  void openItemDrawer(nextId, false)
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
          <a-tag :color="syncEnvironmentTagColor" size="small">
            {{ syncEnvironmentLabel }}
          </a-tag>
          <a-tag v-if="syncDetail && !syncDetail.enabled" color="gold" size="small">
            已禁用
          </a-tag>
          <a-tag v-if="syncDetail?.archivedAt" color="gray" size="small">
            已归档
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
        <a-button size="small" type="primary" :disabled="archivedReadonly" @click="openAddItemDrawer">
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
    <a-alert v-if="archivedReadonly" type="warning" :show-icon="true">
      当前同步信息已归档，仅支持查看历史配置与运行结果；新增、预检、执行和保存操作已禁用。
    </a-alert>
    <a-alert v-else-if="syncExecutionDisabled" type="warning" :show-icon="true">
      当前主同步信息已禁用。你仍然可以编辑配置并执行预检，但事件同步、定时调度和手动执行都会被阻断，适合用于测试库和正式库之间切换。
    </a-alert>

    <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
      <div class="flex flex-wrap gap-3 items-end justify-between">
        <div class="gap-3 grid items-end md:grid-cols-[minmax(220px,320px),160px,140px,auto]">
          <label class="text-[11px] text-slate-600 font-medium block">
            同步信息名称
            <a-input v-model="syncForm.name" class="mt-1" size="small" allow-clear :disabled="archivedReadonly" placeholder="输入主库同步信息名称" />
          </label>
          <label class="text-[11px] text-slate-600 font-medium block">
            运行环境
            <a-select v-model="syncForm.environment" class="mt-1" size="small" :disabled="archivedReadonly">
              <a-option v-for="item in SYNC_ENVIRONMENT_OPTIONS" :key="item.value" :value="item.value">
                {{ item.label }}
              </a-option>
            </a-select>
          </label>
          <label class="text-[11px] text-slate-600 font-medium flex gap-2 items-center">
            <span>启用主同步</span>
            <a-switch v-model="syncForm.enabled" :disabled="archivedReadonly" />
          </label>
          <a-button size="small" type="primary" :loading="savingSync" :disabled="archivedReadonly" @click="saveSyncInfo">
            保存同步信息
          </a-button>
        </div>
        <div class="text-[11px] text-slate-500">
          最近更新时间：{{ syncDetail ? formatDateTime(syncDetail.updatedAt) : '-' }}
          <template v-if="syncDetail?.archivedAt">
            / 归档时间：{{ formatDateTime(syncDetail.archivedAt) }}
          </template>
        </div>
      </div>

      <div class="gap-3 grid md:grid-cols-2 xl:grid-cols-6">
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
            主同步状态
          </p>
          <p class="text-[11px] text-slate-900 font-medium m-0 mt-1">
            {{ syncDetail?.enabled ? '已启用' : '已禁用' }}
          </p>
        </div>
        <div class="p-3 border border-slate-200 rounded bg-slate-50">
          <p class="text-[10px] text-slate-500 m-0">
            运行环境
          </p>
          <p class="text-[11px] text-slate-900 font-medium m-0 mt-1">
            {{ syncEnvironmentLabel }}
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
            {{ syncItems.length }} 个 / 已启用 {{ syncDetail?.enabledItemCount || 0 }} 个
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

      <section class="p-4 border border-slate-200 rounded bg-slate-50 space-y-3">
        <div>
          <h3 class="text-[12px] text-slate-900 font-semibold m-0">
            主同步调度
          </h3>
          <p class="text-[11px] text-slate-500 m-0 mt-1">
            调度统一配置在多维同步信息层级；命中调度后会顺序执行当前主同步下所有已启用的子表同步项。
          </p>
        </div>
        <div class="gap-3 grid md:grid-cols-5">
          <div class="text-[11px] text-slate-600 font-medium block">
            <div>启用定时</div>
            <div class="mt-2">
              <a-switch v-model="syncForm.scheduleEnabled" :disabled="archivedReadonly" />
            </div>
          </div>
          <label class="text-[11px] text-slate-600 font-medium block">
            调度模式
            <a-select v-model="syncForm.scheduleMode" class="mt-1" size="small" :disabled="archivedReadonly">
              <a-option v-for="option in SCHEDULE_MODE_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </a-option>
            </a-select>
          </label>
          <label v-if="syncForm.scheduleMode === 'interval'" class="text-[11px] text-slate-600 font-medium block">
            间隔分钟
            <a-input-number v-model="syncForm.scheduleIntervalMinutes" class="mt-1 w-full" size="small" :min="1" :step="5" :disabled="archivedReadonly" />
          </label>
          <label v-else class="text-[11px] text-slate-600 font-medium block md:col-span-2">
            Cron
            <a-input v-model="syncForm.scheduleCronExpr" class="mt-1" size="small" :disabled="archivedReadonly" />
          </label>
          <label class="text-[11px] text-slate-600 font-medium block">
            时区
            <a-input v-model="syncForm.scheduleTimezone" class="mt-1" size="small" :disabled="archivedReadonly" />
          </label>
        </div>
        <div class="gap-3 grid md:grid-cols-3">
          <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-white">
            <p class="text-slate-500 m-0">
              下次执行
            </p>
            <p class="text-slate-900 font-medium m-0 mt-1">
              {{ syncDetail?.scheduleRuntime?.nextRunAt ? formatDateTime(syncDetail.scheduleRuntime.nextRunAt) : '-' }}
            </p>
          </div>
          <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-white">
            <p class="text-slate-500 m-0">
              上次调度
            </p>
            <p class="text-slate-900 font-medium m-0 mt-1">
              {{ syncDetail?.scheduleRuntime?.lastRunAt ? formatDateTime(syncDetail.scheduleRuntime.lastRunAt) : '-' }}
            </p>
          </div>
          <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-white">
            <p class="text-slate-500 m-0">
              调度错误
            </p>
            <p class="text-slate-900 font-medium m-0 mt-1 break-all">
              {{ syncDetail?.scheduleRuntime?.lastError || '无' }}
            </p>
          </div>
        </div>
      </section>

      <p v-if="syncDetail?.source.sourceUrl" class="text-[11px] text-slate-500 m-0 break-all">
        来源 URL：{{ syncDetail.source.sourceUrl }}
      </p>
    </section>

    <section class="p-4 border border-slate-200 rounded bg-slate-50 space-y-3">
      <div>
        <h2 class="text-[13px] text-slate-900 font-semibold m-0">
          如何配置一个同步项
        </h2>
        <p class="text-[11px] text-slate-500 m-0 mt-1">
          先选同步项，再进详细配置。常用表单会自动带推荐模板，JSON 只放在高级模式里兜底。
        </p>
        <p class="text-[11px] text-slate-500 m-0 mt-1">
          完整教程已整理到仓库文档 `docs/feishu-bitable-sync-guide.md`，适合第一次接手配置的管理员按步骤照着做。
        </p>
      </div>
      <div class="gap-3 grid md:grid-cols-2 xl:grid-cols-3">
        <div v-for="step in QUICK_START_STEPS" :key="step" class="text-[11px] text-slate-600 px-3 py-2 border border-slate-200 rounded bg-white">
          {{ step }}
        </div>
      </div>
    </section>

    <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-[13px] text-slate-900 font-semibold m-0">
            子表同步项列表
          </h2>
          <p class="text-[11px] text-slate-500 m-0 mt-1">
            先从这里选择要配置的同步项，再打开详细配置 Drawer。列表里优先展示实体类型、来源子表、启用状态和最近结果。
          </p>
        </div>
        <a-tag color="arcoblue" size="small">
          {{ syncItems.length }} 个同步项
        </a-tag>
      </div>

      <a-spin :loading="loadingSync">
        <div v-if="syncItems.length" class="space-y-3">
          <button
            v-for="item in syncItems"
            :key="item.id"
            type="button"
            class="px-4 py-3 text-left border rounded w-full transition"
            :class="activeItemId === item.id ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-white hover:border-slate-300'"
            @click="openItemDrawer(item.id)"
          >
            <div class="flex flex-wrap gap-3 items-start justify-between">
              <div class="flex-1 min-w-0">
                <div class="flex flex-wrap gap-2 items-center">
                  <p class="text-[13px] text-slate-900 font-semibold m-0 truncate">
                    {{ item.name }}
                  </p>
                  <a-tag size="small" :color="item.isEnabled ? 'green' : 'gray'">
                    {{ item.isEnabled ? '已启用' : '未启用' }}
                  </a-tag>
                  <a-tag v-if="syncDetail && !syncDetail.enabled" size="small" color="gold">
                    主同步已禁用
                  </a-tag>
                  <a-tag size="small" color="arcoblue">
                    {{ entityTypeLabel(item.entityType) }}
                  </a-tag>
                </div>
                <p class="text-[11px] text-slate-500 m-0 mt-2 break-all">
                  {{ item.source?.tableName || item.tableId || '-' }} / {{ item.source?.viewName || item.viewId || '全部视图' }}
                </p>
                <p class="text-[11px] text-slate-500 m-0 mt-1 break-all">
                  tableId={{ item.tableId || '-' }} / viewId={{ item.viewId || '-' }}
                </p>
              </div>
              <div class="gap-2 grid justify-items-end">
                <label class="text-[11px] text-slate-500 flex gap-2 items-center" @click.stop>
                  <span>启用</span>
                  <a-switch
                    :model-value="item.isEnabled"
                    size="small"
                    :loading="itemToggleMutating[item.id]"
                    :disabled="archivedReadonly"
                    @click.stop
                    @change="(value) => toggleItemEnabled(item, Boolean(value))"
                  />
                </label>
                <div class="text-[11px] text-slate-500 gap-2 grid justify-items-end">
                  <a-tag size="small" :color="runStatusColor(item.latestRunSummary?.status)">
                    {{ item.latestRunSummary ? runStatusLabel(item.latestRunSummary.status) : '未执行' }}
                  </a-tag>
                  <span>最近：{{ latestRunSummaryText(item.latestRunSummary) }}</span>
                  <span v-if="(item.latestRunSummary?.errorCount || 0) > 0">最近错误数：{{ item.latestRunSummary?.errorCount || 0 }}</span>
                </div>
              </div>
            </div>
          </button>
        </div>
        <a-empty v-else description="当前主库还没有子表同步项" />
      </a-spin>
    </section>

    <a-drawer
      v-model:visible="itemDrawerVisible"
      :title="currentItem ? `配置同步项：${currentItem.name}` : '配置同步项'"
      width="1320px"
      :footer="false"
      :mask-closable="!(savingItem || previewingItem || runningItem)"
      :closable="!(savingItem || previewingItem || runningItem)"
      @cancel="closeItemDrawer"
    >
      <div class="space-y-4">
        <section class="p-3 border border-slate-200 rounded bg-slate-50 space-y-2">
          <h2 class="text-[13px] text-slate-900 font-semibold m-0">
            这三块配置分别是什么
          </h2>
          <div class="gap-3 grid md:grid-cols-3">
            <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-white">
              <p class="text-slate-900 font-medium m-0">
                映射配置
              </p>
              <p class="m-0 mt-1">
                决定飞书哪一列映射到平台哪个字段。`externalIdField` 是主键；`contestExternalIdField / trackExternalIdField` 只在需要关联实体时才要填。
              </p>
            </div>
            <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-white">
              <p class="text-slate-900 font-medium m-0">
                同步选项
              </p>
              <p class="m-0 mt-1">
                不是字段映射，而是同步时的默认行为和值。比如资源默认可见性、默认分类、固定 contestId 兜底等。
              </p>
            </div>
            <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-white">
              <p class="text-slate-900 font-medium m-0">
                回填配置
              </p>
              <p class="m-0 mt-1">
                决定同步完成后回写飞书哪些列，比如状态、同步时间、错误摘要、平台实体 ID 和 runId，不是回写平台字段。
              </p>
            </div>
          </div>
        </section>

        <a-spin :loading="loadingItem">
          <template v-if="currentItem">
            <section class="p-4 border border-slate-200 rounded bg-white space-y-4">
              <div class="flex flex-wrap gap-3 items-start justify-between">
                <div>
                  <h2 class="text-[14px] text-slate-900 font-semibold m-0">
                    {{ currentItem.name }}
                  </h2>
                  <p class="text-[11px] text-slate-500 m-0 mt-1">
                    子表同步项 ID：{{ currentItem.id }}
                  </p>
                  <p class="text-[11px] text-emerald-700 m-0 mt-1">
                    预检会直接使用当前 Drawer 里的草稿配置，你可以先改映射和回填，再决定要不要保存。
                  </p>
                </div>
                <div class="flex gap-2">
                  <a-button size="small" :loading="previewingItem" :disabled="archivedReadonly" @click="previewCurrentItem">
                    预检
                  </a-button>
                  <a-button size="small" type="primary" :loading="runningItem" :disabled="currentItemRunDisabled" @click="runCurrentItem">
                    手动执行
                  </a-button>
                  <a-button size="small" type="primary" :loading="savingItem" :disabled="archivedReadonly" @click="saveCurrentItem('main')">
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
              </div>
            </section>

            <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
              <div class="flex flex-wrap gap-3 items-start justify-between">
                <div>
                  <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                    来源
                  </h3>
                  <p class="text-[11px] text-slate-500 m-0 mt-1">
                    先选子表和视图；选择后会自动刷新字段概览并尝试匹配映射。
                  </p>
                </div>
                <a-button
                  size="mini"
                  :loading="loadingFieldInspection"
                  :disabled="!canRefreshFieldInspection"
                  @click="inspectFields"
                >
                  刷新多维表格字段
                </a-button>
              </div>
              <div class="gap-3 grid md:grid-cols-2 xl:grid-cols-3">
                <label class="text-[11px] text-slate-600 font-medium block">
                  子表
                  <a-select v-model="itemForm.tableId" class="mt-1" size="small" allow-search allow-clear @change="handleItemTableChange">
                    <a-option v-for="item in availableTables" :key="item.tableId" :value="item.tableId">
                      {{ item.name }} ({{ item.tableId }})
                    </a-option>
                  </a-select>
                </label>
                <label class="text-[11px] text-slate-600 font-medium block">
                  视图
                  <a-select v-model="itemForm.viewId" class="mt-1" size="small" allow-search allow-clear @change="handleItemViewChange">
                    <a-option v-for="item in availableViews" :key="item.viewId" :value="item.viewId">
                      {{ item.name }} ({{ item.viewId }})
                    </a-option>
                  </a-select>
                </label>
                <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-slate-50">
                  <p class="text-slate-500 m-0">
                    调度时区
                  </p>
                  <p class="m-0 mt-1">
                    {{ syncForm.scheduleTimezone || 'Asia/Shanghai' }}
                  </p>
                </div>
              </div>

              <div class="gap-3 grid md:grid-cols-2 xl:grid-cols-4">
                <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-slate-50">
                  <p class="text-slate-500 m-0">
                    主库
                  </p>
                  <p class="m-0 mt-1 break-all">
                    {{ syncDetail?.source.appName || '-' }} / {{ itemForm.appToken || '-' }}
                  </p>
                </div>
                <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-slate-50">
                  <p class="text-slate-500 m-0">
                    当前子表
                  </p>
                  <p class="m-0 mt-1 break-all">
                    {{ itemForm.tableName || itemForm.tableId || '-' }}
                  </p>
                </div>
                <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-slate-50">
                  <p class="text-slate-500 m-0">
                    当前视图
                  </p>
                  <p class="m-0 mt-1 break-all">
                    {{ itemForm.viewName || itemForm.viewId || '全部视图' }}
                  </p>
                </div>
                <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-slate-50">
                  <p class="text-slate-500 m-0">
                    最近执行
                  </p>
                  <p class="m-0 mt-1 break-all">
                    {{ currentItem.latestRunSummary ? formatDateTime(currentItem.latestRunSummary.startedAt) : '-' }}
                  </p>
                </div>
              </div>
            </section>

            <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
              <div>
                <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                  详细配置入口
                </h3>
                <p class="text-[11px] text-slate-500 m-0 mt-1">
                  基础映射和回填配置已拆到二级 Drawer。主页面只保留摘要，避免当前同步项的编辑信息过长难扫读。
                </p>
              </div>

              <div class="gap-3 grid md:grid-cols-2">
                <section class="p-4 border border-slate-200 rounded bg-slate-50 space-y-3">
                  <div class="flex flex-wrap gap-3 items-start justify-between">
                    <div>
                      <h4 class="text-[12px] text-slate-900 font-semibold m-0">
                        基础映射
                      </h4>
                      <p class="text-[11px] text-slate-500 m-0 mt-1">
                        在二级 Drawer 里集中处理字段概览、来源列映射和映射 JSON。
                      </p>
                    </div>
                    <a-button size="mini" type="primary" @click="mappingDrawerVisible = true">
                      编辑基础映射
                    </a-button>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <a-tag size="small" color="arcoblue">
                      已配置 {{ configuredMappingCount }} / {{ mappingWizardBindings.length || 0 }}
                    </a-tag>
                    <a-tag size="small" :color="missingRequiredMappingLabels.length ? 'gold' : 'green'">
                      重点缺失 {{ missingRequiredMappingLabels.length }}
                    </a-tag>
                    <a-tag v-if="unexpectedConfiguredMappingLabels.length" size="small" color="purple">
                      旧字段残留 {{ unexpectedConfiguredMappingLabels.length }}
                    </a-tag>
                  </div>
                  <p class="text-[11px] text-slate-600 m-0">
                    当前重点字段：{{ mappingFocusFieldLabels.join(' / ') || '-' }}
                  </p>
                  <p v-if="mappingSaveSuccess" class="text-[11px] text-emerald-700 m-0">
                    {{ mappingSaveSuccess }}
                  </p>
                </section>

                <section class="p-4 border border-slate-200 rounded bg-slate-50 space-y-3">
                  <div class="flex flex-wrap gap-3 items-start justify-between">
                    <div>
                      <h4 class="text-[12px] text-slate-900 font-semibold m-0">
                        回填配置
                      </h4>
                      <p class="text-[11px] text-slate-500 m-0 mt-1">
                        在二级 Drawer 里选择飞书回填列、状态值，并维护回填 JSON。
                      </p>
                    </div>
                    <a-button size="mini" type="primary" @click="writebackDrawerVisible = true">
                      编辑回填配置
                    </a-button>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <a-tag size="small" :color="writebackForm.enabled ? 'green' : 'gray'">
                      {{ writebackStatusLabel }}
                    </a-tag>
                    <a-tag size="small" color="arcoblue">
                      已选字段 {{ selectedWritebackFieldCount }} / {{ WRITEBACK_FIELD_CONFIGS.length }}
                    </a-tag>
                    <a-tag size="small" :color="writebackSelectableFieldCount ? 'green' : 'gold'">
                      {{ writebackSelectableFieldCount ? `可选字段 ${writebackSelectableFieldCount}` : '缺少可选字段' }}
                    </a-tag>
                  </div>
                  <p class="text-[11px] text-slate-600 m-0">
                    {{ writebackSelectableFieldCount ? '当前已加载飞书字段，可直接进入回填 Drawer 继续配置。' : '当前还没有可选飞书字段，请先在“来源”里选择子表/视图并刷新多维表格字段。' }}
                  </p>
                </section>
              </div>
            </section>

            <section v-if="activeOptionFieldGroups.length" class="p-4 border border-slate-200 rounded bg-white space-y-3">
              <div>
                <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                  同步选项
                </h3>
                <p class="text-[11px] text-slate-500 m-0 mt-1">
                  这里配置的是同步行为默认值，不是字段映射。如果当前实体类型没有额外默认项，可以直接跳过。
                </p>
              </div>

              <div v-if="activeOptionFieldGroups.length" class="gap-2 grid md:grid-cols-2 xl:grid-cols-3">
                <div
                  v-for="field in activeOptionFieldGroups"
                  :key="field.key"
                  class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-slate-50"
                >
                  <p class="text-slate-900 font-medium m-0">
                    {{ field.label }}
                  </p>
                  <p class="m-0 mt-1">
                    {{ field.description }}
                  </p>
                </div>
              </div>

              <div class="gap-3 grid md:grid-cols-2 xl:grid-cols-3">
                <label v-if="itemForm.entityType === 'track' || itemForm.entityType === 'resource'" class="text-[11px] text-slate-600 font-medium block">
                  默认 contestId
                  <a-input v-model="optionForm.contestId" class="mt-1" size="small" allow-clear />
                  <p class="text-[10px] text-slate-400 m-0 mt-1">
                    飞书记录没有关联竞赛 ID 时，可用这个固定值兜底。
                  </p>
                </label>

                <template v-if="itemForm.entityType === 'resource'">
                  <label class="text-[11px] text-slate-600 font-medium block">
                    默认可见性
                    <a-select v-model="optionForm.defaultVisibility" class="mt-1" size="small">
                      <a-option v-for="option in RESOURCE_VISIBILITY_OPTIONS" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </a-option>
                    </a-select>
                  </label>
                  <label class="text-[11px] text-slate-600 font-medium block">
                    默认状态
                    <a-select v-model="optionForm.defaultStatus" class="mt-1" size="small">
                      <a-option v-for="option in RESOURCE_STATUS_OPTIONS" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </a-option>
                    </a-select>
                  </label>
                  <label class="text-[11px] text-slate-600 font-medium block">
                    默认资料分类
                    <a-select v-model="optionForm.defaultResourceCategory" class="mt-1" size="small">
                      <a-option v-for="option in RESOURCE_CATEGORY_OPTIONS" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </a-option>
                    </a-select>
                  </label>
                  <label class="text-[11px] text-slate-600 font-medium block">
                    默认访问级别
                    <a-select v-model="optionForm.defaultResourceAccessLevel" class="mt-1" size="small">
                      <a-option v-for="option in RESOURCE_ACCESS_LEVEL_OPTIONS" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </a-option>
                    </a-select>
                  </label>
                </template>
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
                <div class="gap-3 grid md:grid-cols-2 xl:grid-cols-4">
                  <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-slate-50">
                    <p class="text-slate-500 m-0">
                      可同步记录
                    </p>
                    <p class="text-[14px] text-slate-900 font-semibold m-0 mt-1">
                      {{ previewResult.createdCount + previewResult.updatedCount }}
                    </p>
                  </div>
                  <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-slate-50">
                    <p class="text-slate-500 m-0">
                      将跳过
                    </p>
                    <p class="text-[14px] text-slate-900 font-semibold m-0 mt-1">
                      {{ previewResult.skippedCount }}
                    </p>
                  </div>
                  <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-slate-50">
                    <p class="text-slate-500 m-0">
                      同步错误
                    </p>
                    <p class="text-[14px] text-slate-900 font-semibold m-0 mt-1">
                      {{ previewResult.errorCount }}
                    </p>
                  </div>
                  <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-slate-50">
                    <p class="text-slate-500 m-0">
                      重点核对字段
                    </p>
                    <p class="m-0 mt-1 break-words">
                      {{ previewFocusFields(itemForm.entityType).map(item => mappingOptionLabel(item)).join(' / ') }}
                    </p>
                  </div>
                </div>
                <div v-if="previewResult.mappedSampleRows.length" class="space-y-2">
                  <div>
                    <p class="text-[11px] text-slate-900 font-medium m-0">
                      模拟同步结果
                    </p>
                    <p class="text-[10px] text-slate-500 m-0 mt-1">
                      下面展示按当前草稿配置解析出的平台字段和值。重点看竞赛库的 `name / officialUrl / registrationWindow / submissionDeadline`，赛道库的 `contestExternalId / name` 是否都落对。
                    </p>
                  </div>
                  <div class="border border-slate-200 rounded overflow-auto">
                    <table class="text-[11px] text-left min-w-full border-collapse">
                      <thead class="bg-slate-50">
                        <tr>
                          <th class="px-3 py-2 border-b border-slate-200 whitespace-nowrap">
                            recordId
                          </th>
                          <th class="px-3 py-2 border-b border-slate-200 whitespace-nowrap">
                            状态
                          </th>
                          <th class="px-3 py-2 border-b border-slate-200 whitespace-nowrap">
                            原因
                          </th>
                          <th
                            v-for="column in previewResult.mappedColumns"
                            :key="`preview-column-${column}`"
                            class="px-3 py-2 border-b border-slate-200 whitespace-nowrap"
                          >
                            {{ mappingOptionLabel(column) }}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="row in previewResult.mappedSampleRows"
                          :key="`preview-row-${row.recordId}`"
                          class="align-top"
                        >
                          <td class="text-slate-500 px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                            {{ row.recordId }}
                          </td>
                          <td class="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                            <a-tag size="small" :color="previewRowStatusColor(row.status)">
                              {{ previewRowStatusLabel(row.status) }}
                            </a-tag>
                          </td>
                          <td class="text-slate-500 px-3 py-2 border-b border-slate-100 min-w-[160px]">
                            <div>{{ row.reasonCode || '-' }}</div>
                            <div v-if="row.message" class="text-[10px] mt-1">
                              {{ row.message }}
                            </div>
                          </td>
                          <td
                            v-for="column in previewResult.mappedColumns"
                            :key="`preview-row-${row.recordId}-${column}`"
                            class="text-slate-700 px-3 py-2 border-b border-slate-100 min-w-[180px]"
                          >
                            {{ row.values[column] || '-' }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
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
                <div class="flex items-center justify-between">
                  <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                    关联问题
                  </h3>
                  <div class="flex gap-2">
                    <a-tag size="small" color="gold">
                      待处理 {{ currentItem.issueStats.open }}
                    </a-tag>
                    <a-tag size="small">
                      总计 {{ currentItem.issueStats.total }}
                    </a-tag>
                  </div>
                </div>
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

            <section class="p-4 border border-slate-200 rounded bg-white">
              <a-collapse :default-active-key="[]" :bordered="false" expand-icon-position="right">
                <a-collapse-item key="advanced" header="高级 JSON 模式（兜底）">
                  <div class="pt-2 space-y-4">
                    <p class="text-[11px] text-slate-500 m-0">
                      主 Drawer 只保留同步选项 JSON；映射 JSON 和回填配置 JSON 已移到各自的二级 Drawer，避免表单和 JSON 分离。
                    </p>

                    <section class="space-y-2">
                      <div class="flex items-center justify-between">
                        <h4 class="text-[12px] text-slate-900 font-semibold m-0">
                          同步选项 JSON
                        </h4>
                        <div class="flex gap-2">
                          <a-button size="mini" @click="loadOptionsFormFromJson()">
                            从 JSON 回读
                          </a-button>
                          <a-button size="mini" @click="syncOptionsFormToJson(true)">
                            同步到 JSON
                          </a-button>
                        </div>
                      </div>
                      <a-textarea v-model="itemForm.optionsText" class="font-mono" :auto-size="{ minRows: 6, maxRows: 14 }" />
                    </section>
                  </div>
                </a-collapse-item>
              </a-collapse>
            </section>
          </template>

          <a-empty v-else description="请先从同步项列表里选择一个条目" />
        </a-spin>
      </div>
    </a-drawer>

    <a-drawer
      v-model:visible="mappingDrawerVisible"
      :title="currentItem ? `基础映射：${currentItem.name}` : '基础映射'"
      width="1040px"
      :footer="false"
      :mask-closable="!(savingItem || previewingItem || runningItem)"
      :closable="!(savingItem || previewingItem || runningItem)"
    >
      <div class="space-y-4">
        <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                字段概览
              </h3>
              <p class="text-[11px] text-slate-500 m-0 mt-1">
                系统会优先按字段名猜测映射关系；你只需要重点确认 externalId 和关联字段是否正确。
              </p>
            </div>
            <a-button size="mini" :loading="loadingFieldInspection" :disabled="!canRefreshFieldInspection" @click="inspectFields">
              刷新字段概览
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
            <div>
              <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                基础映射
              </h3>
              <p class="text-[11px] text-slate-500 m-0 mt-1">
                每个目标字段都可以单独配置来源列和 transform。`externalId` 是平台主键来源；赛道重点看 `contestExternalId`；竞赛库重点看 `name / officialUrl / registrationWindow / submissionDeadline`。
              </p>
            </div>
            <div class="flex gap-2">
              <a-button size="mini" @click="normalizeCurrentEntityTemplate">
                整理为当前实体模板
              </a-button>
              <a-button size="mini" @click="loadMappingWizardFromJson">
                从 JSON 回读
              </a-button>
              <a-button size="mini" @click="writeMappingWizardToJson(true)">
                同步到 JSON
              </a-button>
            </div>
          </div>

          <div v-if="mappingWizardBindings.length" class="space-y-3">
            <a-alert v-if="unexpectedConfiguredMappingLabels.length" type="info" :show-icon="true">
              检测到旧配置里还有当前实体不使用的字段：{{ unexpectedConfiguredMappingLabels.join(' / ') }}。点上面的“整理为当前实体模板”即可只保留当前实体相关配置。
            </a-alert>
            <a-alert v-if="missingRequiredMappingLabels.length" type="warning" :show-icon="true">
              还缺少重点映射：{{ missingRequiredMappingLabels.join(' / ') }}。如果不补齐，预检通常会出现“跳过”或“必要字段缺失”；赛道/资料也可以用同步选项里的固定 contestId 兜底关联。
            </a-alert>
            <div
              v-for="binding in mappingWizardBindings"
              :key="binding.targetKey"
              class="p-3 border rounded space-y-2"
              :class="[
                isRequiredMappingField(itemForm.entityType, binding.targetKey) && !binding.sourceField
                  ? 'border-amber-300 bg-amber-50/50'
                  : 'border-slate-200',
              ]"
            >
              <div class="gap-2 grid md:grid-cols-[220px,minmax(0,1fr),minmax(0,1fr)]">
                <div class="text-[11px] text-slate-900 font-medium p-2 border border-slate-200 rounded bg-slate-50 flex gap-2 items-center justify-between">
                  <span>{{ mappingOptionLabel(binding.targetKey) }}</span>
                  <span
                    v-if="isRequiredMappingField(itemForm.entityType, binding.targetKey)"
                    class="text-[10px] text-amber-700 px-1.5 py-0.5 rounded bg-amber-100 inline-flex items-center"
                  >
                    重点
                  </span>
                </div>
                <a-select v-model="binding.sourceField" size="small" allow-search allow-clear placeholder="来源字段">
                  <a-option v-for="field in fieldInspection" :key="field.fieldName" :value="field.fieldName">
                    {{ field.fieldName }}
                  </a-option>
                </a-select>
                <a-input v-model="binding.transform" size="small" allow-clear placeholder="transform（可选）" />
              </div>
              <p class="text-[10px] text-slate-500 m-0">
                样本：{{ fieldSamplePreview(fieldInspection.find(field => field.fieldName === binding.sourceField)?.sampleValues || []) }}
              </p>
            </div>
          </div>
          <a-empty v-else description="当前实体类型还没有可配置的目标字段" />
        </section>

        <section class="p-4 border border-slate-200 rounded bg-white">
          <a-collapse :default-active-key="[]" :bordered="false" expand-icon-position="right">
            <a-collapse-item key="mapping-json" header="高级 JSON 模式（映射兜底）">
              <div class="pt-2 space-y-4">
                <p class="text-[11px] text-slate-500 m-0">
                  大多数情况请优先使用上面的可视化表单。只有在需要精细编辑或调试时，再直接修改 JSON。手动改 JSON 后，请点“从 JSON 回读”。
                </p>
                <section class="space-y-2">
                  <div class="flex items-center justify-between">
                    <h4 class="text-[12px] text-slate-900 font-semibold m-0">
                      映射 JSON
                    </h4>
                    <div class="flex gap-2">
                      <a-button size="mini" @click="loadMappingWizardFromJson">
                        从 JSON 回读
                      </a-button>
                      <a-button size="mini" @click="writeMappingWizardToJson(true)">
                        同步到 JSON
                      </a-button>
                    </div>
                  </div>
                  <a-textarea v-model="itemForm.mappingText" class="font-mono" :auto-size="{ minRows: 8, maxRows: 18 }" />
                </section>
              </div>
            </a-collapse-item>
          </a-collapse>
        </section>

        <div class="flex gap-2 justify-end">
          <a-button size="small" :disabled="savingItem" @click="mappingDrawerVisible = false">
            关闭
          </a-button>
          <a-button size="small" type="primary" :loading="savingItem" :disabled="archivedReadonly" @click="saveCurrentItem('mapping')">
            保存配置
          </a-button>
        </div>
      </div>
    </a-drawer>

    <a-drawer
      v-model:visible="writebackDrawerVisible"
      :title="currentItem ? `回填配置：${currentItem.name}` : '回填配置'"
      width="860px"
      :footer="false"
      :mask-closable="!(savingItem || previewingItem || runningItem)"
      :closable="!(savingItem || previewingItem || runningItem)"
    >
      <div class="space-y-4">
        <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
          <div>
            <h3 class="text-[12px] text-slate-900 font-semibold m-0">
              回填配置
            </h3>
            <p class="text-[11px] text-slate-500 m-0 mt-1">
              回填的是飞书列名，不是平台字段名。这里直接从当前子表字段里选择，建议至少配置状态、同步时间、错误摘要、平台实体 ID 和 runId。
            </p>
          </div>
          <div class="text-[11px] text-slate-600 font-medium block">
            <div>启用回填</div>
            <div class="mt-2">
              <a-switch v-model="writebackForm.enabled" />
            </div>
          </div>
          <div class="gap-3 grid md:grid-cols-2 xl:grid-cols-3">
            <label
              v-for="field in WRITEBACK_FIELD_CONFIGS"
              :key="field.key"
              class="text-[11px] text-slate-600 font-medium block"
            >
              {{ field.label }}
              <a-select
                v-model="writebackForm[field.key]"
                class="mt-1"
                size="small"
                allow-search
                allow-clear
                placeholder="选择飞书字段"
              >
                <a-option
                  v-for="fieldName in selectableFieldNames(writebackForm[field.key])"
                  :key="`${field.key}-${fieldName}`"
                  :value="fieldName"
                >
                  {{ fieldName }}
                </a-option>
              </a-select>
            </label>
            <label class="text-[11px] text-slate-600 font-medium block">
              成功值
              <a-input v-model="writebackForm.success" class="mt-1" size="small" allow-clear />
            </label>
            <label class="text-[11px] text-slate-600 font-medium block">
              失败值
              <a-input v-model="writebackForm.failed" class="mt-1" size="small" allow-clear />
            </label>
            <label class="text-[11px] text-slate-600 font-medium block">
              跳过值
              <a-input v-model="writebackForm.skipped" class="mt-1" size="small" allow-clear />
            </label>
          </div>
          <p v-if="!fieldInspection.length" class="text-[10px] text-slate-400 m-0">
            还没有可选字段时，请先在主 Drawer 的“来源”里选择子表/视图并刷新多维表格字段。
          </p>
        </section>

        <section class="p-4 border border-slate-200 rounded bg-white">
          <a-collapse :default-active-key="[]" :bordered="false" expand-icon-position="right">
            <a-collapse-item key="writeback-json" header="高级 JSON 模式（回填兜底）">
              <div class="pt-2 space-y-4">
                <p class="text-[11px] text-slate-500 m-0">
                  大多数情况请优先使用上面的可视化表单。只有在需要精细编辑或调试时，再直接修改 JSON。手动改 JSON 后，请点“从 JSON 回读”。
                </p>
                <section class="space-y-2">
                  <div class="flex items-center justify-between">
                    <h4 class="text-[12px] text-slate-900 font-semibold m-0">
                      回填配置 JSON
                    </h4>
                    <div class="flex gap-2">
                      <a-button size="mini" @click="loadWritebackFormFromJson()">
                        从 JSON 回读
                      </a-button>
                      <a-button size="mini" @click="syncWritebackFormToJson(true)">
                        同步到 JSON
                      </a-button>
                    </div>
                  </div>
                  <a-textarea v-model="itemForm.writebackText" class="font-mono" :auto-size="{ minRows: 6, maxRows: 16 }" />
                </section>
              </div>
            </a-collapse-item>
          </a-collapse>
        </section>

        <div class="flex gap-2 justify-end">
          <a-button size="small" :disabled="savingItem" @click="writebackDrawerVisible = false">
            关闭
          </a-button>
          <a-button size="small" type="primary" :loading="savingItem" :disabled="archivedReadonly" @click="saveCurrentItem('main')">
            保存配置
          </a-button>
        </div>
      </div>
    </a-drawer>

    <a-drawer
      v-model:visible="addItemDrawerVisible"
      title="新增子表同步项"
      :mask-closable="!creatingItem"
      :closable="!creatingItem"
      :footer="false"
      width="560px"
    >
      <div class="space-y-3">
        <a-alert type="info" :show-icon="true">
          新建后会自动带入当前实体类型的推荐模板：映射骨架、同步选项和回填配置都会先帮你铺好。
        </a-alert>
        <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-slate-50">
          <p class="text-slate-900 font-medium m-0">
            推荐模板说明
          </p>
          <p class="m-0 mt-1">
            `contest` 默认关注 `externalId + 名称/官网/简介`；`track` 额外带 `contestExternalId`；`resource` 会再补 `trackExternalId` 和资料默认值。
          </p>
        </div>
        <div class="gap-3 grid md:grid-cols-2">
          <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-white">
            <p class="text-slate-900 font-medium m-0">
              当前识别建议
            </p>
            <p class="m-0 mt-1">
              {{ newItemSuggestedEntityType ? `按当前子表名称，更推荐你建成「${entityTypeLabel(newItemSuggestedEntityType)}」同步项。` : '当前子表名称还不足以给出识别建议，可手动选择。' }}
            </p>
            <p class="text-slate-400 m-0 mt-1">
              重点映射：{{ newItemRequiredMappingLabels.join(' / ') }}
            </p>
          </div>
          <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-white">
            <p class="text-slate-900 font-medium m-0">
              创建后会发生什么
            </p>
            <p class="m-0 mt-1">
              会自动打开详细配置 Drawer、按当前实体带入推荐模板、加载字段概览，并默认保持禁用，方便你先预检再启用。
            </p>
          </div>
        </div>
        <div class="text-[11px] text-slate-600 font-medium block">
          <div>同步项名称</div>
          <div class="mt-1 flex gap-2">
            <a-input v-model="newItemForm.name" class="flex-1" size="small" allow-clear placeholder="默认按子表/视图 + 实体类型自动生成" />
            <a-button size="mini" @click="useSuggestedNewItemName">
              用推荐名
            </a-button>
          </div>
        </div>
        <div class="text-[11px] text-slate-600 font-medium block">
          <div>同步到</div>
          <div class="mt-1 flex gap-2">
            <a-select v-model="newItemForm.entityType" class="flex-1" size="small">
              <a-option v-for="option in ENTITY_TYPE_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </a-option>
            </a-select>
            <a-button size="mini" @click="useAutoDetectedNewItemEntityType">
              按子表识别
            </a-button>
          </div>
        </div>
        <div class="text-[10px] text-slate-400 -mt-1">
          当前模板会优先引导你确认：{{ newItemRequiredMappingLabels.join(' / ') }}
        </div>
        <label class="text-[11px] text-slate-600 font-medium block">
          子表 tableId
          <a-select v-model="newItemForm.tableId" class="mt-1" size="small" allow-search allow-clear @change="handleNewItemTableChange">
            <a-option v-for="item in availableTables" :key="item.tableId" :value="item.tableId">
              {{ item.name }} ({{ item.tableId }})
            </a-option>
          </a-select>
        </label>
        <label class="text-[11px] text-slate-600 font-medium block">
          视图 viewId（可选）
          <a-select v-model="newItemForm.viewId" class="mt-1" size="small" allow-search allow-clear @change="handleNewItemViewChange">
            <a-option v-for="item in newItemViews" :key="item.viewId" :value="item.viewId">
              {{ item.name }} ({{ item.viewId }})
            </a-option>
          </a-select>
        </label>
        <div class="flex gap-2 justify-end">
          <a-button size="small" :disabled="creatingItem" @click="addItemDrawerVisible = false">
            取消
          </a-button>
          <a-button size="small" type="primary" :loading="creatingItem" :disabled="archivedReadonly" @click="createItem">
            创建并继续配置
          </a-button>
        </div>
      </div>
    </a-drawer>
  </div>
</template>

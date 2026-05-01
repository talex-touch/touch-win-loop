<script setup lang="ts">
import type {
  ApiResponse,
  FeishuBitableRecordLocatorType,
  FeishuBitableSimulateBusinessStatus,
  FeishuBitableSimulateRecordRequest,
  FeishuBitableSimulateRecordResult,
  FeishuBitableSync,
  FeishuBitableSyncCleanupPreview,
  FeishuBitableSyncCleanupResult,
  FeishuBitableSyncDetail,
  FeishuBitableSyncEnvironment,
  FeishuBitableSyncItem,
  FeishuBitableSyncItemDetail,
  FeishuBitableSyncItemEntityType,
  FeishuBitableSyncItemPreviewRequest,
  FeishuBitableSyncItemPreviewResult,
  FeishuBitableSyncItemRun,
  FeishuBitableTableMeta,
  FeishuBitableViewMeta,
  FeishuFieldDiagnosticItem,
  FeishuFieldInspectionItem,
  FeishuSyncIssue,
  FeishuSyncIssueBatchHandleResult,
  FeishuSyncRunSamplePage,
  FeishuSyncRunSampleRecord,
  FeishuSyncRunSampleType,
  FeishuTaskLatestRunSummary,
  FeishuTaskScheduleMode,
} from '~~/shared/types/domain'
import { guessFeishuBitableFieldName, normalizeFeishuBitableFieldGuessKey } from '~~/shared/utils/feishu-bitable-field-guess'
import {
  buildDefaultSyncItemConfig,
  buildSuggestedSyncItemName,
  isSyncItemConfigEmpty,
  listDefaultSyncItemTargetFieldKeys,
  listRequiredSyncItemFieldGroups,
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

interface MappingSchemaBoundarySupportedField {
  key: string
  label: string
  required: boolean
}

interface MappingSchemaBoundaryConfiguredField {
  key: string
  label: string
  sourceText: string
}

interface MappingSchemaBoundaryLocalField {
  key: string
  label: string
  description: string
  matchedFields: string[]
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

interface SyncAutoSyncFormState {
  enabled: boolean
  recordStatusField: string
  syncStatusField: string
  completedValuesText: string
  pendingValuesText: string
  syncedValuesText: string
  resetRecordStatusValue: string
  resetSyncStatusValue: string
  useMappedFieldsAsWatched: boolean
  watchedFieldNamesText: string
  ignoredFieldNamesText: string
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
type SaveCurrentItemContext = 'main' | 'mapping' | 'writeback' | 'autoSync'
type SyncIssueCategoryKey = 'mapping' | 'relation' | 'writeback' | 'source'
type SyncIssueFilterStatus = '' | 'open' | 'resolved' | 'ignored'
type ItemStageTone = 'green' | 'gold' | 'gray' | 'red' | 'blue'
type AutoSyncFilteredSample = NonNullable<NonNullable<FeishuBitableSyncItemRun['diagnostics']>['autoSync']['filteredSamples']>[number]
type BusinessSkipSample = NonNullable<NonNullable<FeishuBitableSyncItemRun['diagnostics']>['businessSkipSamples']>[number]
interface CurrentItemLogRunSampleState {
  loading: boolean
  errorText: string
  pageData: FeishuSyncRunSamplePage
}

interface SyncManualRunResult {
  status: 'running' | 'success' | 'partial_success' | 'failed'
  itemCount: number
  successCount: number
  partialSuccessCount: number
  failedCount: number
  fetchedCount: number
  createdCount: number
  updatedCount: number
  skippedCount: number
  errorCount: number
  writebackErrorCount: number
}

interface SyncIssueFilterState {
  status: SyncIssueFilterStatus
  reasonCode: string
}

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

function createEmptyRunSamplePage(page = 1, pageSize = RUN_SAMPLE_PAGE_SIZE): FeishuSyncRunSamplePage {
  return {
    items: [],
    total: 0,
    page,
    pageSize,
  }
}

function createEmptyRunSampleState(): CurrentItemLogRunSampleState {
  return {
    loading: false,
    errorText: '',
    pageData: createEmptyRunSamplePage(),
  }
}

const MAPPING_OPTIONS: Record<FeishuBitableSyncItemEntityType, MappingOption[]> = {
  contest: [
    { key: 'externalId', label: 'externalId（主键）' },
    { key: 'name', label: 'name（竞赛名称）' },
    { key: 'level', label: 'level（级别）' },
    { key: 'disciplines', label: 'disciplines（学科门类）' },
    { key: 'officialUrl', label: 'officialUrl（官网地址）' },
    { key: 'summary', label: 'summary（竞赛简介）' },
    { key: 'keywords', label: 'keywords（关键词）' },
    { key: 'timelineText', label: 'timelineText（时间节点）' },
    { key: 'recommendedFor', label: 'recommendedFor（适配人群）' },
  ],
  track: [
    { key: 'externalId', label: 'externalId（主键）' },
    { key: 'contestExternalId', label: 'contestExternalId（对应竞赛）' },
    { key: 'name', label: 'name（赛道名称）' },
    { key: 'coverImageUrl', label: 'coverImageUrl（封面）' },
    { key: 'location', label: 'location（具体位置）' },
    { key: 'organizer', label: 'organizer（主办方）' },
    { key: 'undertaker', label: 'undertaker（承办方）' },
    { key: 'summary', label: 'summary（赛道简介）' },
    { key: 'participantRequirements', label: 'participantRequirements（参赛对象）' },
    { key: 'teamRule', label: 'teamRule（组队规则）' },
    { key: 'timelineText', label: 'timelineText（时间节点）' },
    { key: 'suitableMajors', label: 'suitableMajors（相关专业）' },
    { key: 'awardRatio', label: 'awardRatio（获奖比例）' },
    { key: 'evidenceRequirements', label: 'evidenceRequirements（必备项）' },
    { key: 'scoringPoints', label: 'scoringPoints（加分项）' },
    { key: 'deductionItems', label: 'deductionItems（扣分项）' },
    { key: 'deliverableTypes', label: 'deliverableTypes（提交内容）' },
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
    { key: 'contestExternalId', label: 'contestExternalId（竞赛关联信息）' },
    { key: 'trackExternalId', label: 'trackExternalId（赛道关联信息）' },
    { key: 'title', label: 'title（资料标题）' },
    { key: 'category', label: 'category（资料类别）' },
    { key: 'attachment', label: 'attachment（附件）' },
    { key: 'attachmentSummary', label: 'attachmentSummary（附件摘要）' },
  ],
  policy: [
    { key: 'externalId', label: 'externalId（会议编号）' },
    { key: 'meetingName', label: 'meetingName（会议名称）' },
    { key: 'summary', label: 'summary（大会简介）' },
    { key: 'conferenceDate', label: 'conferenceDate（大会日期）' },
    { key: 'importance', label: 'importance（重要程度）' },
    { key: 'officialMaterial', label: 'officialMaterial（官网资料）' },
    { key: 'officialMaterialLink', label: 'officialMaterialLink（官网资料链接）' },
    { key: 'wechatMaterial', label: 'wechatMaterial（微信公众号资料）' },
    { key: 'wechatMaterialLink', label: 'wechatMaterialLink（微信公众号链接）' },
    { key: 'weiboMaterial', label: 'weiboMaterial（微博资料）' },
    { key: 'weiboMaterialLink', label: 'weiboMaterialLink（微博资料链接）' },
    { key: 'douyinMaterial', label: 'douyinMaterial（抖音资料）' },
    { key: 'douyinMaterialLink', label: 'douyinMaterialLink（抖音资料链接）' },
    { key: 'xiaohongshuMaterial', label: 'xiaohongshuMaterial（小红书资料）' },
    { key: 'xiaohongshuMaterialLink', label: 'xiaohongshuMaterialLink（小红书资料链接）' },
  ],
  persona: [
    { key: 'externalId', label: 'externalId（人设编号）' },
    { key: 'contestExternalId', label: 'contestExternalId（对应竞赛）' },
    { key: 'object', label: 'object（对象）' },
    { key: 'persona1', label: 'persona1（人设1）' },
    { key: 'persona2', label: 'persona2（人设2）' },
    { key: 'persona3', label: 'persona3（人设3）' },
    { key: 'persona4', label: 'persona4（人设4）' },
    { key: 'persona5', label: 'persona5（人设5）' },
  ],
}

const ENTITY_TYPE_OPTIONS: SelectOption<FeishuBitableSyncItemEntityType>[] = [
  { value: 'contest', label: '竞赛' },
  { value: 'track', label: '赛道' },
  { value: 'resource', label: '资料' },
  { value: 'persona', label: '人设' },
  { value: 'policy', label: '政策' },
  { value: 'track_timeline', label: '赛道时间线（兼容）' },
]

const LOCAL_SCHEMA_BOUNDARY_FIELDS: Partial<Record<FeishuBitableSyncItemEntityType, Array<{
  key: string
  label: string
  description: string
  aliases: string[]
}>>> = {
  track: [
    {
      key: 'organizer',
      label: 'organizer（主办方）',
      description: 'track.organizer 是支持字段，会从赛道库写入赛道主办方。',
      aliases: ['organizer', '主办方', '主办单位', '主办'],
    },
    {
      key: 'currentSeason',
      label: 'currentSeason（当前届次）',
      description: 'currentSeason 不作为 Feishu target；赛道库不会写回竞赛届次，发布侧按时间线年份兜底。',
      aliases: ['currentSeason', '当前届次', '届次', '当前赛季', '赛季'],
    },
  ],
  contest: [
    {
      key: 'organizer',
      label: 'organizer（主办方）',
      description: 'contest.organizer 不从 Feishu contest 库写回；本地人工保留，赛道主办方请用 track.organizer。',
      aliases: ['organizer', '主办方', '主办单位', '主办'],
    },
    {
      key: 'coOrganizer',
      label: 'coOrganizer（协办方）',
      description: '竞赛协办方属于本地人工保留字段，当前 Feishu contest 库不会写回。',
      aliases: ['coOrganizer', '协办方', '协办单位', '协办'],
    },
    {
      key: 'teamRule',
      label: 'teamRule（组队规则）',
      description: '竞赛组队规则属于本地人工保留字段，当前 Feishu contest 库不会写回。',
      aliases: ['teamRule', '组队规则', '组队要求'],
    },
    {
      key: 'participantRequirements',
      label: 'participantRequirements（参赛对象）',
      description: '竞赛参赛对象不会从 Feishu contest 库直接写回；发布时会从赛道 participantRequirements 聚合兜底。',
      aliases: ['participantRequirements', '参赛对象', '参赛要求', '适用对象'],
    },
    {
      key: 'currentSeason',
      label: 'currentSeason（当前届次）',
      description: 'currentSeason 不作为 Feishu target；发布侧目前通过时间线年份兜底，不从 Feishu 的 currentSeason 列直接写回。',
      aliases: ['currentSeason', '当前届次', '届次', '当前赛季', '赛季'],
    },
  ],
}

const SCHEDULE_MODE_OPTIONS: SelectOption<FeishuTaskScheduleMode>[] = [
  { value: 'interval', label: '固定间隔' },
  { value: 'cron', label: 'Cron 表达式' },
]

const SIMULATE_LOCATOR_OPTIONS: Array<SelectOption<FeishuBitableRecordLocatorType>> = [
  { value: 'auto', label: '自动识别' },
  { value: 'externalId', label: '业务编号' },
  { value: 'recordId', label: 'recordId' },
  { value: 'rowNumber', label: '行号' },
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

const WRITEBACK_FIELD_CONFIGS: Array<{ key: SyncWritebackFieldKey, label: string, helper?: string }> = [
  { key: 'status', label: '同步状态回填字段', helper: '建议选择“同步信息”。同步成功会把成功值写到这里，不要选择“记录状态”。' },
  { key: 'syncedAt', label: '同步时间字段' },
  { key: 'errorMessage', label: '错误摘要字段' },
  { key: 'reasonCode', label: '原因码字段' },
  { key: 'entityId', label: '平台实体 ID 字段' },
  { key: 'runId', label: 'runId 字段' },
  { key: 'triggerSource', label: 'triggerSource 字段' },
]

const SYNC_ISSUE_CATEGORY_META: Record<SyncIssueCategoryKey, { label: string, color: string }> = {
  mapping: { label: '映射配置', color: 'orange' },
  relation: { label: '关联映射', color: 'arcoblue' },
  writeback: { label: '回填配置', color: 'gold' },
  source: { label: '数据源内容', color: 'gray' },
}

const SYNC_ISSUE_STATUS_FILTER_OPTIONS: Array<SelectOption<SyncIssueFilterStatus>> = [
  { value: 'open', label: '待处理' },
  { value: 'resolved', label: '已解决' },
  { value: 'ignored', label: '已忽略' },
  { value: '', label: '全部状态' },
]

const SYNC_ISSUE_CATEGORY_BY_CODE: Record<string, SyncIssueCategoryKey> = {
  EXTERNAL_ID_MISSING: 'mapping',
  MISSING_REQUIRED_FIELD: 'mapping',
  PERSONA_SLOTS_EMPTY: 'mapping',
  MAPPING_EMPTY: 'mapping',
  MAPPING_MISSING: 'mapping',
  SOURCE_FIELD_MISSING: 'mapping',
  TRANSFORM_ERROR: 'mapping',
  CONTEST_REF_NOT_FOUND: 'relation',
  TRACK_REF_NOT_FOUND: 'relation',
  WRITEBACK_FIELD_MISSING: 'writeback',
  WRITEBACK_FAILED: 'writeback',
}

const SYNC_ISSUE_FIELD_HINT_SET = new Set([
  'externalId',
  'contestExternalId',
  'trackExternalId',
  'name',
  'officialUrl',
  'summary',
  'timelineText',
  'nodeType',
  'title',
  'attachment',
  'meetingName',
  'conferenceDate',
  'object',
  'persona1',
  'persona2',
  'persona3',
  'persona4',
  'persona5',
  'persona1~5',
  'status',
  'syncedAt',
  'errorMessage',
  'reasonCode',
  'entityId',
  'runId',
  'triggerSource',
])

const SIMULATE_SOURCE_FIELD_PAGE_SIZE = 12
const RUN_SAMPLE_PAGE_SIZE = 12
const RUN_SAMPLE_TYPE_LIST: FeishuSyncRunSampleType[] = ['auto_sync_filtered', 'business_skipped']

const savingItem = ref(false)
const savingSync = ref(false)
const runningSync = ref(false)
const runningItem = ref(false)
const previewingItem = ref(false)
const simulatingRecord = ref(false)
const loadingSync = ref(false)
const loadingItem = ref(false)
const loadingTables = ref(false)
const loadingViews = ref(false)
const loadingFieldInspection = ref(false)
const creatingItem = ref(false)
const editorRootRef = ref<HTMLElement | null>(null)
const itemToggleMutating = reactive<Record<string, boolean>>({})
const issueActionMutating = reactive<Record<string, boolean>>({})
const batchIssueActionMutating = reactive<Record<string, boolean>>({})
const addItemDrawerVisible = ref(false)
const itemDrawerVisible = ref(false)
const quickStartGuideVisible = ref(false)
const mappingDrawerVisible = ref(false)
const writebackDrawerVisible = ref(false)
const autoSyncDrawerVisible = ref(false)
const suppressVisualSync = ref(false)
const syncingNewItemSuggestion = ref(false)
const newItemNameAuto = ref(true)

const feedbackError = ref('')
const feedbackSuccess = ref('')
const mappingSaveSuccess = ref('')
const writebackSaveSuccess = ref('')
const autoSyncSaveSuccess = ref('')
const autoSyncDraftText = ref(JSON.stringify(buildDefaultSyncItemConfig('contest').autoSync, null, 2))
const writebackDraftText = ref(JSON.stringify(buildDefaultSyncItemConfig('contest').writeback, null, 2))

const syncDetail = ref<FeishuBitableSyncDetail | null>(null)
const currentItem = ref<FeishuBitableSyncItemDetail | null>(null)
const cleanupPreviewVisible = ref(false)
const cleanupPreviewLoading = ref(false)
const cleaningCurrentItem = ref(false)
const cleanupPreviewResult = ref<FeishuBitableSyncCleanupPreview | null>(null)
const cleanupPreviewErrorText = ref('')
const cleanupConfirmText = ref('')
const previewResult = ref<FeishuBitableSyncItemPreviewResult | null>(null)
const simulateResult = ref<FeishuBitableSimulateRecordResult | null>(null)
const simulateErrorText = ref('')
const fieldInspection = ref<FeishuFieldInspectionItem[]>([])
const fieldInspectionError = ref('')
const currentItemLogVisible = ref(false)
const currentItemLogLoading = ref(false)
const currentItemLogErrorText = ref('')
const currentItemLogItemDetail = ref<FeishuBitableSyncItemDetail | null>(null)
const currentItemLogSelectedRunId = ref('')
const simulateSourceFieldPage = ref(1)
const currentItemIssueFilters = reactive<SyncIssueFilterState>({
  status: 'open',
  reasonCode: '',
})
const currentItemLogIssueFilters = reactive<SyncIssueFilterState>({
  status: 'open',
  reasonCode: '',
})
const currentItemLogRunSamples = reactive<Record<FeishuSyncRunSampleType, CurrentItemLogRunSampleState>>({
  auto_sync_filtered: createEmptyRunSampleState(),
  business_skipped: createEmptyRunSampleState(),
})
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
  autoSyncText: JSON.stringify(buildDefaultSyncItemConfig('contest').autoSync, null, 2),
  writebackText: JSON.stringify(buildDefaultSyncItemConfig('contest').writeback, null, 2),
})

const simulateForm = reactive({
  locatorType: 'auto' as FeishuBitableRecordLocatorType,
  locatorValue: '',
})

const optionForm = reactive<SyncOptionFormState>({
  contestId: '',
  defaultVisibility: 'internal',
  defaultStatus: 'active',
  defaultResourceCategory: 'basic_info',
  defaultResourceAccessLevel: 'public',
})

const autoSyncForm = reactive<SyncAutoSyncFormState>({
  enabled: false,
  recordStatusField: '记录状态',
  syncStatusField: '同步信息',
  completedValuesText: '已完成',
  pendingValuesText: '未同步',
  syncedValuesText: '已同步',
  resetRecordStatusValue: '撰写中',
  resetSyncStatusValue: '未同步',
  useMappedFieldsAsWatched: true,
  watchedFieldNamesText: '',
  ignoredFieldNamesText: '',
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
const syncManualRunDisabled = computed(() => archivedReadonly.value || syncExecutionDisabled.value || !syncDetail.value?.enabledItemCount)
const currentItemRunDisabled = computed(() => archivedReadonly.value || syncExecutionDisabled.value || !currentItem.value?.isEnabled)
const cleanupConfirmMatched = computed(() => cleanupConfirmText.value.trim() === toText(cleanupPreviewResult.value?.confirmationToken))
const activeMappingOptions = computed(() => MAPPING_OPTIONS[itemForm.entityType] || [])
const syncItems = computed(() => syncDetail.value?.items || [])
const activeOptionFieldGroups = computed(() => optionFieldGroups(itemForm.entityType))
const newItemTableName = computed(() => availableTables.value.find(item => item.tableId === newItemForm.tableId)?.name || '')
const newItemViewName = computed(() => newItemViews.value.find(item => item.viewId === newItemForm.viewId)?.name || '')
const currentItemRelationGuardText = computed(() => buildManualRunRelationGuardText(
  currentItem.value?.entityType || itemForm.entityType,
  currentItem.value?.mapping || {},
  currentItem.value?.options || {},
))
const currentItemDraftRelationGuardText = computed(() => buildManualRunRelationGuardText(
  itemForm.entityType,
  parseJsonTextLoose(itemForm.mappingText),
  parseJsonTextLoose(itemForm.optionsText),
))
const currentItemFilteredIssues = computed(() => filterSyncIssues(currentItem.value?.issues || [], currentItemIssueFilters))
const currentItemIssueReasonOptions = computed(() => syncIssueReasonOptions(currentItem.value))
const currentItemBatchOpenIssueCount = computed(() => filteredOpenIssueCount(currentItem.value, currentItemIssueFilters))
const currentItemLogFilteredIssues = computed(() => filterSyncIssues(currentItemLogItemDetail.value?.issues || [], currentItemLogIssueFilters))
const currentItemLogIssueReasonOptions = computed(() => syncIssueReasonOptions(currentItemLogItemDetail.value))
const currentItemLogBatchOpenIssueCount = computed(() => filteredOpenIssueCount(currentItemLogItemDetail.value, currentItemLogIssueFilters))
const missingRequiredMappingLabels = computed(() => {
  return listRequiredSyncItemFieldGroups(itemForm.entityType)
    .filter((group) => {
      const matchedCount = group.keys
        .filter(key => mappingWizardBindings.value.some(binding => binding.targetKey === key && Boolean(toText(binding.sourceField))))
        .length
      return group.mode === 'any'
        ? matchedCount === 0
        : matchedCount < group.keys.length
    })
    .map(group => group.keys.length === 1 ? mappingOptionLabel(group.keys[0] || group.label) : group.label)
})
const newItemRequiredMappingLabels = computed(() => listRequiredSyncItemFieldGroups(newItemForm.entityType).map((group) => {
  return group.keys.length === 1
    ? mappingOptionLabelByEntityType(newItemForm.entityType, group.keys[0] || group.label)
    : group.label
}))
const newItemSuggestedEntityType = computed(() => suggestSyncItemEntityType({
  tableName: newItemTableName.value,
  viewName: newItemViewName.value,
  name: newItemForm.name,
}))
const itemEntityTypeOptions = computed(() => buildEntityTypeChoiceOptions(itemForm.entityType))
const newItemEntityTypeOptions = computed(() => buildEntityTypeChoiceOptions(newItemForm.entityType))
const canRefreshFieldInspection = computed(() => Boolean(toText(itemForm.tableId)) && !loadingItem.value && !loadingViews.value)
const configuredMappingCount = computed(() => mappingWizardBindings.value.filter(binding => Boolean(toText(binding.sourceField))).length)
const mappingFocusFieldLabels = computed(() => previewFocusFields(itemForm.entityType).map(item => mappingOptionLabel(item)))
const selectedWritebackFieldCount = computed(() => WRITEBACK_FIELD_CONFIGS.filter(field => Boolean(toText(writebackForm[field.key]))).length)
const writebackSelectableFieldCount = computed(() => fieldInspection.value.filter(field => Boolean(toText(field.fieldName))).length)
const writebackStatusLabel = computed(() => writebackForm.enabled ? '已启用回填' : '未启用回填')
const savedAutoSyncState = computed(() => buildAutoSyncFormState(parseJsonTextLoose(itemForm.autoSyncText), itemForm.entityType))
const writebackStatusFieldRisk = computed(() => {
  if (!writebackForm.enabled || !savedAutoSyncState.value.enabled)
    return false
  const statusField = toText(writebackForm.status)
  return Boolean(statusField && statusField === toText(savedAutoSyncState.value.recordStatusField) && toText(savedAutoSyncState.value.syncStatusField))
})
const effectiveWritebackStatusField = computed(() => writebackStatusFieldRisk.value
  ? toText(savedAutoSyncState.value.syncStatusField)
  : toText(writebackForm.status))
const autoSyncStatusLabel = computed(() => savedAutoSyncState.value.enabled ? '已启用自动同步' : '未启用自动同步')
const savedAutoSyncCompletedValues = computed(() => splitMultiValueText(savedAutoSyncState.value.completedValuesText))
const savedAutoSyncWatchedFields = computed(() => splitMultiValueText(savedAutoSyncState.value.watchedFieldNamesText))
const autoSyncSummaryText = computed(() => savedAutoSyncState.value.enabled
  ? `预检、手动执行和事件同步都会只处理“${savedAutoSyncState.value.recordStatusField || '记录状态'} ∈ 已完成”且“${savedAutoSyncState.value.syncStatusField || '同步信息'} ∈ 未同步”的记录。`
  : '当前未启用自动同步规则，预检和手动执行仍会按当前视图全量处理。')
const currentItemLatestRunFailed = computed(() => runHealthFailed(currentItem.value?.latestRunSummary))
const currentItemLatestRunWarned = computed(() => runHealthWarned(currentItem.value?.latestRunSummary))

function itemStageToneMeta(tone: ItemStageTone) {
  if (tone === 'green') {
    return {
      panelClass: 'border-emerald-200 bg-emerald-50',
      badgeClass: 'bg-emerald-600 text-white',
    }
  }
  if (tone === 'gold') {
    return {
      panelClass: 'border-amber-200 bg-amber-50',
      badgeClass: 'bg-amber-500 text-white',
    }
  }
  if (tone === 'red') {
    return {
      panelClass: 'border-rose-200 bg-rose-50',
      badgeClass: 'bg-rose-600 text-white',
    }
  }
  if (tone === 'blue') {
    return {
      panelClass: 'border-sky-200 bg-sky-50',
      badgeClass: 'bg-sky-600 text-white',
    }
  }
  return {
    panelClass: 'border-slate-200 bg-slate-50',
    badgeClass: 'bg-slate-500 text-white',
  }
}

const itemStageCards = computed(() => {
  const sourceReady = Boolean(toText(itemForm.tableId))
  const mappingBlockedByLegacyFields = unexpectedConfiguredMappingLabels.value.length > 0
  const mappingReady = sourceReady && !missingRequiredMappingLabels.value.length && configuredMappingCount.value > 0 && !mappingBlockedByLegacyFields
  const writebackReady = writebackForm.enabled
    ? Boolean(writebackSelectableFieldCount.value && selectedWritebackFieldCount.value)
    : false
  const executionReady = !archivedReadonly.value && !syncExecutionDisabled.value && itemForm.isEnabled
  const sourceTone: ItemStageTone = sourceReady ? 'green' : 'gold'
  const mappingTone: ItemStageTone = !sourceReady
    ? 'gray'
    : mappingBlockedByLegacyFields
      ? 'gold'
      : mappingReady
        ? 'green'
        : 'gold'
  const writebackTone: ItemStageTone = !writebackForm.enabled
    ? 'gray'
    : writebackStatusFieldRisk.value || !writebackSelectableFieldCount.value || !selectedWritebackFieldCount.value
      ? 'gold'
      : 'green'
  const autoSyncTone: ItemStageTone = savedAutoSyncState.value.enabled ? 'green' : 'gray'
  let executionTone: ItemStageTone = 'blue'
  let executionStatus = '待首轮验证'
  let executionHint = '先确认主同步和当前同步项都处于启用状态。'

  if (archivedReadonly.value) {
    executionTone = 'gray'
    executionStatus = '归档只读'
    executionHint = '归档同步只保留查看，不可再执行。'
  }
  else if (syncExecutionDisabled.value) {
    executionTone = 'gold'
    executionStatus = '主同步未启用'
    executionHint = '先确认主同步已启用，再回来执行预检和手动同步。'
  }
  else if (!itemForm.isEnabled) {
    executionTone = 'gold'
    executionStatus = '同步项未启用'
    executionHint = '先启用当前同步项，再继续预检和手动执行。'
  }
  else if (currentItemDraftRelationGuardText.value) {
    executionTone = 'gold'
    executionStatus = '关联映射待补齐'
    executionHint = currentItemDraftRelationGuardText.value
  }
  else if (currentItemLatestRunFailed.value) {
    executionTone = 'red'
    executionStatus = '最近执行失败'
    executionHint = '先看最近运行日志与预检结果，修正后再重跑。'
  }
  else if (currentItemLatestRunWarned.value) {
    executionTone = 'gold'
    executionStatus = '最近执行告警'
    executionHint = '先核对错误记录、跳过原因和回填状态，再决定是否继续放量。'
  }
  else if (currentItem.value?.latestRunSummary) {
    executionTone = 'green'
    executionStatus = '可稳定复跑'
    executionHint = '推荐顺序：预检 -> 单行模拟 -> 保存配置 -> 手动执行。'
  }
  else if (executionReady) {
    executionHint = '推荐顺序：预检 -> 单行模拟 -> 保存配置 -> 手动执行。'
  }

  return [
    {
      key: 'source',
      title: '来源',
      status: sourceReady ? '已选子表' : '待选子表',
      summary: sourceReady
        ? `${itemForm.tableName || itemForm.tableId} / ${itemForm.viewName || itemForm.viewId || '全部视图'}`
        : '先选择子表，视图可选。',
      hint: sourceReady
        ? '如需更新字段候选，点“刷新多维表格字段”。'
        : '来源没定之前，映射和回填都不值得继续细化。',
      ...itemStageToneMeta(sourceTone),
    },
    {
      key: 'mapping',
      title: '基础映射',
      status: !sourceReady
        ? '依赖来源'
        : mappingReady
          ? '已具备预检条件'
          : mappingBlockedByLegacyFields
            ? '有旧字段残留'
            : '待补重点字段',
      summary: !sourceReady
        ? '先选来源后再看映射。'
        : `已配置 ${configuredMappingCount.value} 项；重点缺失 ${missingRequiredMappingLabels.value.length} 项。`,
      hint: mappingBlockedByLegacyFields
        ? `建议先整理旧字段：${unexpectedConfiguredMappingLabels.value.join(' / ')}。`
        : missingRequiredMappingLabels.value.length
          ? `优先补齐 ${missingRequiredMappingLabels.value.join(' / ')}。`
          : '可以先预检，再决定是否保存到正式配置。',
      ...itemStageToneMeta(mappingTone),
    },
    {
      key: 'writeback',
      title: '回填配置',
      status: !writebackForm.enabled
        ? '未启用回填'
        : writebackStatusFieldRisk.value
          ? '状态字段需改写'
          : writebackReady
            ? '回填可用'
            : '待补回填列',
      summary: !writebackForm.enabled
        ? '当前不回写飞书列。'
        : `已选 ${selectedWritebackFieldCount.value}/${WRITEBACK_FIELD_CONFIGS.length} 个字段；可选字段 ${writebackSelectableFieldCount.value}。`,
      hint: writebackStatusFieldRisk.value
        ? `保存时会自动把状态列改写到 ${effectiveWritebackStatusField.value || '同步信息'}。`
        : writebackForm.enabled && !writebackSelectableFieldCount.value
          ? '先刷新字段概览，再选择状态、同步时间、runId 等列。'
          : writebackForm.enabled && !selectedWritebackFieldCount.value
            ? '建议至少配置状态、同步时间、错误摘要、实体 ID 和 runId。'
            : '回填的是飞书列，不是平台字段。',
      ...itemStageToneMeta(writebackTone),
    },
    {
      key: 'autoSync',
      title: '自动同步',
      status: savedAutoSyncState.value.enabled ? '规则已启用' : '未启用自动同步',
      summary: savedAutoSyncState.value.enabled
        ? `${savedAutoSyncState.value.recordStatusField || '记录状态'} / ${savedAutoSyncState.value.syncStatusField || '同步信息'} 已接管事件命中。`
        : '当前只有手动执行和预检会主动消费这份配置。',
      hint: savedAutoSyncState.value.enabled
        ? `完成值 ${savedAutoSyncCompletedValues.value.join(' / ') || '已完成'}；额外监听 ${savedAutoSyncWatchedFields.value.length} 个字段。`
        : '建议先手动验证稳定，再决定是否把事件同步接进来。',
      ...itemStageToneMeta(autoSyncTone),
    },
    {
      key: 'execution',
      title: '执行入口',
      status: executionStatus,
      summary: currentItem.value?.latestRunSummary
        ? `最近执行：${formatDateTime(currentItem.value.latestRunSummary.startedAt)} / ${runHealthLabel(currentItem.value.latestRunSummary)}${currentItem.value.latestRunSummary.errorCount ? ` / 错误 ${currentItem.value.latestRunSummary.errorCount}` : ''}。`
        : '建议先预检，再做首轮手动执行。',
      hint: executionHint,
      ...itemStageToneMeta(executionTone),
    },
  ]
})

const itemNextStepHint = computed(() => {
  if (!toText(itemForm.tableId))
    return '先在“来源”里选子表/视图并刷新字段概览。'
  if (missingRequiredMappingLabels.value.length)
    return `先在“基础映射”补齐 ${missingRequiredMappingLabels.value.join(' / ')}。`
  if (unexpectedConfiguredMappingLabels.value.length)
    return `先整理旧字段残留：${unexpectedConfiguredMappingLabels.value.join(' / ')}。`
  if (writebackForm.enabled && !writebackSelectableFieldCount.value)
    return '先刷新字段概览，再进入“回填配置”选择回填列。'
  if (writebackForm.enabled && !selectedWritebackFieldCount.value)
    return '进入“回填配置”，至少补齐状态、同步时间、实体 ID 和 runId。'
  if (currentItemDraftRelationGuardText.value)
    return currentItemDraftRelationGuardText.value
  if (syncExecutionDisabled.value)
    return '保存当前配置后，先启用主同步，再决定是否开放手动执行。'
  if (!itemForm.isEnabled)
    return '保存当前配置后，先启用这个同步项，再做预检和首轮手动执行。'
  if (currentItemLatestRunFailed.value)
    return '先看最近运行日志与预检结果，修正后再重跑。'
  if (currentItemLatestRunWarned.value)
    return '最近一次执行仍有错误或部分成功，先清理异常记录，再决定是否开启自动同步。'
  if (!currentItem.value?.latestRunSummary)
    return '当前已经具备执行条件，建议按“预检 -> 单行模拟 -> 手动执行”的顺序完成首轮验证。'
  if (!savedAutoSyncState.value.enabled)
    return '首轮验证已经完成，接下来可以评估是否开启自动同步规则。'
  return '当前链路已经跑通，继续关注执行日志、问题单和调度状态。'
})

const autoSyncCompletedValues = computed<string[]>({
  get: () => splitMultiValueText(autoSyncForm.completedValuesText),
  set: values => autoSyncForm.completedValuesText = joinMultiValueText(values),
})
const autoSyncPendingValues = computed<string[]>({
  get: () => splitMultiValueText(autoSyncForm.pendingValuesText),
  set: values => autoSyncForm.pendingValuesText = joinMultiValueText(values),
})
const autoSyncSyncedValues = computed<string[]>({
  get: () => splitMultiValueText(autoSyncForm.syncedValuesText),
  set: values => autoSyncForm.syncedValuesText = joinMultiValueText(values),
})
const autoSyncWatchedFields = computed<string[]>({
  get: () => splitMultiValueText(autoSyncForm.watchedFieldNamesText),
  set: values => autoSyncForm.watchedFieldNamesText = joinMultiValueText(values),
})
const autoSyncIgnoredFields = computed<string[]>({
  get: () => splitMultiValueText(autoSyncForm.ignoredFieldNamesText),
  set: values => autoSyncForm.ignoredFieldNamesText = joinMultiValueText(values),
})
const currentItemLogSelectedRun = computed(() => {
  const detail = currentItemLogItemDetail.value
  if (!detail?.recentRuns.length)
    return null
  return detail.recentRuns.find(run => run.id === currentItemLogSelectedRunId.value) || detail.recentRuns[0] || null
})
const simulateSourceFieldsPageData = computed(() => {
  const fields = simulateResult.value?.sourceFields || []
  const start = (simulateSourceFieldPage.value - 1) * SIMULATE_SOURCE_FIELD_PAGE_SIZE
  return fields.slice(start, start + SIMULATE_SOURCE_FIELD_PAGE_SIZE)
})
const simulateSourceFieldsTotal = computed(() => simulateResult.value?.sourceFields.length || 0)
const syncDetailLatestRunSummary = computed(() => syncDetail.value?.latestRunSummary || null)
const syncDetailLatestRunText = computed(() => {
  if (!syncDetailLatestRunSummary.value)
    return '暂无执行记录'
  return `${formatDateTime(syncDetailLatestRunSummary.value.startedAt)} / ${runHealthLabel(syncDetailLatestRunSummary.value)}${syncDetailLatestRunSummary.value.errorCount ? ` / 错误 ${syncDetailLatestRunSummary.value.errorCount}` : ''} / ${triggerSourceLabel(syncDetailLatestRunSummary.value.triggerSource)}`
})
const syncEnvironmentLabel = computed(() => SYNC_ENVIRONMENT_OPTIONS.find(item => item.value === syncForm.environment)?.label || '未标记')
const syncEnvironmentTagColor = computed(() => SYNC_ENVIRONMENT_OPTIONS.find(item => item.value === syncForm.environment)?.tagColor || 'gray')
const selectPopupContainer = computed(() => editorRootRef.value)
const mappingSelectPopupContainer = computed(() => 'body')
const writebackSelectPopupContainer = computed(() => 'body')
const autoSyncSelectPopupContainer = computed(() => 'body')
const schemaBoundarySupportedFields = computed<MappingSchemaBoundarySupportedField[]>(() => {
  return listDefaultSyncItemTargetFieldKeys(itemForm.entityType).map(key => ({
    key,
    label: mappingOptionLabelByEntityType(itemForm.entityType, key),
    required: isRequiredMappingField(itemForm.entityType, key),
  }))
})
const configuredMappingTargetFields = computed(() => buildConfiguredMappingTargetFields(parseJsonTextLoose(itemForm.mappingText)))
const unsupportedConfiguredMappingFields = computed(() => {
  const supportedKeys = new Set(schemaBoundarySupportedFields.value.map(item => item.key))
  return configuredMappingTargetFields.value.filter(item => !supportedKeys.has(item.key))
})
const localSchemaBoundaryFields = computed<MappingSchemaBoundaryLocalField[]>(() => {
  return (LOCAL_SCHEMA_BOUNDARY_FIELDS[itemForm.entityType] || []).map(item => ({
    key: item.key,
    label: item.label,
    description: item.description,
    matchedFields: findInspectionFieldsByAliases(item.aliases),
  }))
})
const unexpectedConfiguredMappingLabels = computed(() => {
  return unsupportedConfiguredMappingFields.value.map(item => item.label)
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
  writebackSaveSuccess.value = ''
  autoSyncSaveSuccess.value = ''
}

function toText(raw: unknown): string {
  return String(raw || '').trim()
}

function splitMultiValueText(raw: string): string[] {
  return [...new Set(String(raw || '')
    .split(/\r?\n|,|，/)
    .map(item => item.trim())
    .filter(Boolean))]
}

function joinMultiValueText(raw: unknown): string {
  if (!Array.isArray(raw))
    return ''
  return [...new Set(raw.map(item => toText(item)).filter(Boolean))].join('\n')
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

function selectableFieldNames(currentValue?: string | string[]) {
  const values = new Set<string>()
  for (const field of fieldInspection.value) {
    const fieldName = toText(field.fieldName)
    if (fieldName)
      values.add(fieldName)
  }
  const currentValues = Array.isArray(currentValue)
    ? currentValue
    : [currentValue]
  for (const item of currentValues) {
    const current = toText(item)
    if (current)
      values.add(current)
  }
  return [...values]
}

function selectableFieldSampleValues(fieldName?: string, currentValue?: string | string[]) {
  const values = new Set<string>()
  const targetFieldName = toText(fieldName)
  if (targetFieldName) {
    const matchedField = fieldInspection.value.find(field => toText(field.fieldName) === targetFieldName)
    for (const item of matchedField?.sampleValues || []) {
      const value = toText(item)
      if (value)
        values.add(value)
    }
  }
  const currentValues = Array.isArray(currentValue)
    ? currentValue
    : [currentValue]
  for (const item of currentValues) {
    const value = toText(item)
    if (value)
      values.add(value)
  }
  return [...values]
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

function buildEntityTypeChoiceOptions(currentValue?: string | null) {
  const current = toText(currentValue)
  return ENTITY_TYPE_OPTIONS.filter(option => option.value !== 'track_timeline' || option.value === current)
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

interface RunHealthSummaryLike {
  status?: string | null
  errorCount?: number | null
}

function runHealthFailed(summary?: RunHealthSummaryLike | null): boolean {
  return summary?.status === 'failed'
}

function runHealthWarned(summary?: RunHealthSummaryLike | null): boolean {
  return summary?.status === 'partial_success' || Boolean(summary?.errorCount)
}

function runHealthLabel(summary?: RunHealthSummaryLike | null): string {
  if (!summary)
    return '未执行'
  if (summary.status === 'success' && Number(summary.errorCount || 0) > 0)
    return '成功但有告警'
  return runStatusLabel(summary.status || '')
}

function runHealthColor(summary?: RunHealthSummaryLike | null): string {
  if (!summary)
    return 'gray'
  if (runHealthFailed(summary))
    return 'red'
  if (runHealthWarned(summary))
    return 'gold'
  return runStatusColor(summary.status)
}

function triggerSourceLabel(source?: string | null): string {
  if (source === 'manual')
    return '手动'
  if (source === 'event')
    return '事件'
  if (source === 'scheduled')
    return '定时'
  return source || '未知'
}

function syncRunModeLabel(mode?: string | null): string {
  if (mode === 'full')
    return '全量'
  if (mode === 'delta')
    return '增量'
  return mode || '未标记'
}

function syncIssueStatusLabel(status?: string | null): string {
  if (status === 'open')
    return '待处理'
  if (status === 'resolved')
    return '已解决'
  if (status === 'ignored')
    return '已忽略'
  return status || '未知'
}

function syncIssueStatusColor(status?: string | null): string {
  if (status === 'open')
    return 'red'
  if (status === 'resolved')
    return 'green'
  if (status === 'ignored')
    return 'gray'
  return 'gray'
}

function sortedSyncIssues(issues: FeishuSyncIssue[] = []): FeishuSyncIssue[] {
  const statusOrder: Record<string, number> = {
    open: 0,
    resolved: 1,
    ignored: 2,
  }
  return [...issues].sort((left, right) => {
    const statusDiff = (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9)
    if (statusDiff !== 0)
      return statusDiff
    return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))
  })
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
  return `${formatDateTime(summary.startedAt)} / ${runHealthLabel(summary)} / ${triggerSourceLabel(summary.triggerSource)}`
}

function shouldShowPersonaZeroOutputHint(summary?: {
  fetchedCount?: number | null
  createdCount?: number | null
  updatedCount?: number | null
  errorCount?: number | null
} | null): boolean {
  if (!summary)
    return false
  const fetchedCount = Math.max(0, Number(summary.fetchedCount) || 0)
  const createdCount = Math.max(0, Number(summary.createdCount) || 0)
  const updatedCount = Math.max(0, Number(summary.updatedCount) || 0)
  const errorCount = Math.max(0, Number(summary.errorCount) || 0)
  return fetchedCount > 0 && createdCount + updatedCount === 0 && errorCount === 0
}

const PERSONA_ZERO_OUTPUT_HINT = '已抓取到飞书源行，但本次没有生成任何人设。优先检查 object、contestExternalId、persona1~5 映射与问题单里的 PERSONA_SLOTS_EMPTY / MISSING_REQUIRED_FIELD。'
const SYNC_RUN_ZERO_FETCH_HINT = '本次没有进入任何记录处理。优先检查当前子表/视图是否真的有记录；如果启用了自动同步规则，也检查“记录状态 / 同步信息”是否命中了“已完成 / 未同步”。'
const SYNC_RUN_ALL_SKIPPED_HINT = '本次记录全部被跳过。常见原因是自动同步规则没有命中，或关键映射字段仍然缺失。'

function formatCountMap(counts?: Record<string, number> | null): string {
  const entries = Object.entries(counts || {})
    .filter(([, count]) => Number(count) > 0)
    .sort((left, right) => Number(right[1]) - Number(left[1]))
  if (!entries.length)
    return ''
  return entries.map(([key, count]) => `${key} ${count}`).join(' / ')
}

function syncRunRuleFilterText(run?: FeishuBitableSyncItemRun | null): string {
  const diagnostics = run?.diagnostics
  if (!diagnostics?.autoSync?.enabled)
    return ''
  const filteredCount = Math.max(0, Number(diagnostics.autoSyncFilteredCount) || 0)
  const sourceFetchedCount = Math.max(0, Number(diagnostics.sourceFetchedCount) || 0)
  const processedCount = Math.max(0, Number(diagnostics.processedCount) || 0)
  if (filteredCount <= 0 && processedCount > 0)
    return ''
  const recordStatusText = formatCountMap(diagnostics.autoSync.recordStatusValueCounts)
  const syncStatusText = formatCountMap(diagnostics.autoSync.syncStatusValueCounts)
  return `规则过滤 ${filteredCount}/${sourceFetchedCount}；${diagnostics.autoSync.recordStatusField || '记录状态'}：${recordStatusText || '-'}；${diagnostics.autoSync.syncStatusField || '同步信息'}：${syncStatusText || '-'}。`
}

function isForceSyncRun(run?: FeishuBitableSyncItemRun | null): boolean {
  return run?.diagnostics?.force?.ignoreAutoSyncStatus === true
}

function syncRunForceText(run?: FeishuBitableSyncItemRun | null): string {
  if (!isForceSyncRun(run))
    return ''
  return '本次为强制同步，已处理当前视图全部源行，并忽略自动同步状态筛选。'
}

function syncRunBusinessSkipText(run?: FeishuBitableSyncItemRun | null): string {
  const diagnostics = run?.diagnostics
  if (!diagnostics)
    return ''
  const businessSkippedCount = Math.max(0, Number(diagnostics.businessSkippedCount) || 0)
  if (businessSkippedCount <= 0)
    return ''
  const reasonText = formatCountMap(diagnostics.skipReasonCounts)
  const missingText = formatCountMap(diagnostics.missingRequiredFieldCounts)
  return `业务跳过 ${businessSkippedCount}；原因：${reasonText || '-'}${missingText ? `；缺失字段：${missingText}` : ''}。`
}

function syncRunDuplicateExternalIdText(run?: FeishuBitableSyncItemRun | null): string {
  const diagnostics = run?.diagnostics
  if (!diagnostics)
    return ''
  const duplicateCount = Math.max(0, Number(diagnostics.sourceDuplicateExternalIdCount) || 0)
  if (duplicateCount <= 0)
    return ''
  const processedCount = Math.max(0, Number(diagnostics.processedCount) || 0)
  const uniqueCount = Math.max(0, Number(diagnostics.processedUniqueExternalIdCount) || 0)
  return `业务去重/覆盖 ${duplicateCount}；处理记录 ${processedCount}，唯一 externalId ${uniqueCount}。重复 externalId 会合并为同一个业务实体，不按错误处理。`
}

function syncRunDuplicateExternalIdSamples(run?: FeishuBitableSyncItemRun | null): Array<{ externalId: string, count: number, recordIds: string[] }> {
  const samples = run?.diagnostics?.sourceDuplicateExternalIdSamples
  return Array.isArray(samples) ? samples : []
}

function syncRunAutoSyncMatchText(run?: FeishuBitableSyncItemRun | null): string {
  const autoSync = run?.diagnostics?.autoSync
  if (!autoSync?.enabled)
    return ''
  return `命中统计：${autoSync.recordStatusField || '记录状态'} 命中 ${autoSync.completedCount || 0}；${autoSync.syncStatusField || '同步信息'} 命中 ${autoSync.pendingCount || 0}；同时命中 ${autoSync.matchedCount || 0}。`
}

function syncRunAutoSyncFilteredSamples(run?: FeishuBitableSyncItemRun | null): AutoSyncFilteredSample[] {
  const samples = run?.diagnostics?.autoSync?.filteredSamples
  return Array.isArray(samples) ? samples : []
}

function syncRunBusinessSkipSamples(run?: FeishuBitableSyncItemRun | null): BusinessSkipSample[] {
  const samples = run?.diagnostics?.businessSkipSamples
  return Array.isArray(samples) ? samples : []
}

function currentItemLogRunSampleState(type: FeishuSyncRunSampleType): CurrentItemLogRunSampleState {
  return currentItemLogRunSamples[type]
}

function currentItemLogRunSampleRecords(type: FeishuSyncRunSampleType): FeishuSyncRunSampleRecord[] {
  return currentItemLogRunSamples[type].pageData.items
}

function currentItemLogRunSampleHasFallback(type: FeishuSyncRunSampleType, run?: FeishuBitableSyncItemRun | null): boolean {
  if (currentItemLogRunSamples[type].pageData.total > 0)
    return false
  return type === 'auto_sync_filtered'
    ? syncRunAutoSyncFilteredSamples(run).length > 0
    : syncRunBusinessSkipSamples(run).length > 0
}

function currentItemLogRunSamplePayload(sample?: FeishuSyncRunSampleRecord | null): Record<string, unknown> {
  return sample?.payload && typeof sample.payload === 'object' && !Array.isArray(sample.payload)
    ? sample.payload
    : {}
}

function currentItemLogRunSamplePayloadText(sample: FeishuSyncRunSampleRecord, key: string, fallback = '-'): string {
  return toText(currentItemLogRunSamplePayload(sample)[key]) || fallback
}

function currentItemLogRunSamplePayloadBoolean(sample: FeishuSyncRunSampleRecord, key: string): boolean {
  return currentItemLogRunSamplePayload(sample)[key] === true
}

function currentItemLogRunSampleMissingFieldsText(sample: FeishuSyncRunSampleRecord): string {
  const missingFields = currentItemLogRunSamplePayload(sample).missingFields
  return Array.isArray(missingFields)
    ? missingFields.map(item => toText(item)).filter(Boolean).join(' / ') || '-'
    : '-'
}

function currentItemLogRunSampleResultPayloadText(sample: FeishuSyncRunSampleRecord): string {
  return JSON.stringify(currentItemLogRunSamplePayload(sample).resultPayload || {}, null, 2)
}

function syncRunAutoSyncReasonLabel(reason: AutoSyncFilteredSample['reason']): string {
  if (reason === 'record_status')
    return '记录状态未命中'
  if (reason === 'sync_status')
    return '同步信息未命中'
  return '记录状态与同步信息均未命中'
}

function syncRunMissingFieldsText(sample: BusinessSkipSample): string {
  return Array.isArray(sample.missingFields) && sample.missingFields.length
    ? sample.missingFields.join(' / ')
    : '-'
}

function syncRunDiagnosticsJsonText(run?: FeishuBitableSyncItemRun | null): string {
  return JSON.stringify(run?.diagnostics || {}, null, 2)
}

function syncRunHintText(entityType: FeishuBitableSyncItemEntityType | string | undefined, summary?: {
  fetchedCount?: number | null
  createdCount?: number | null
  updatedCount?: number | null
  skippedCount?: number | null
  errorCount?: number | null
  diagnostics?: FeishuBitableSyncItemRun['diagnostics']
} | null): string {
  if (!summary)
    return ''
  const diagnostics = summary.diagnostics
  if (diagnostics?.autoSync?.enabled && diagnostics.sourceFetchedCount > 0 && diagnostics.processedCount === 0) {
    const recordStatusText = formatCountMap(diagnostics.autoSync.recordStatusValueCounts)
    const syncStatusText = formatCountMap(diagnostics.autoSync.syncStatusValueCounts)
    return `自动同步规则未命中任何记录。请检查 ${diagnostics.autoSync.recordStatusField || '记录状态'} 是否为 ${diagnostics.autoSync.completedValues.join(' / ')}，${diagnostics.autoSync.syncStatusField || '同步信息'} 是否为 ${diagnostics.autoSync.pendingValues.join(' / ')}。当前分布：${recordStatusText || '-'}；${syncStatusText || '-'}。`
  }
  if (diagnostics?.skipReasonCounts?.PERSONA_SLOTS_EMPTY)
    return '本次人设记录已进入处理，但 persona1~5 未解析到有效文案。请检查槽位来源列是否映射正确且内容非空。'
  if (diagnostics?.skipReasonCounts?.MISSING_REQUIRED_FIELD) {
    const missingText = formatCountMap(diagnostics.missingRequiredFieldCounts)
    return `本次记录因关键字段缺失被跳过。请打开基础映射检查 ${missingText || 'externalId / contestExternalId / object / persona1~5'}。`
  }
  if (shouldShowPersonaZeroOutputHint(summary) && entityType === 'persona')
    return PERSONA_ZERO_OUTPUT_HINT

  const fetchedCount = Math.max(0, Number(summary.fetchedCount) || 0)
  const createdCount = Math.max(0, Number(summary.createdCount) || 0)
  const updatedCount = Math.max(0, Number(summary.updatedCount) || 0)
  const skippedCount = Math.max(0, Number(summary.skippedCount) || 0)
  const errorCount = Math.max(0, Number(summary.errorCount) || 0)
  if (errorCount > 0)
    return ''
  if (fetchedCount === 0)
    return SYNC_RUN_ZERO_FETCH_HINT
  if (createdCount + updatedCount === 0 && skippedCount >= fetchedCount)
    return SYNC_RUN_ALL_SKIPPED_HINT
  return ''
}

function normalizeItemConfigText(entityType: FeishuBitableSyncItemEntityType, raw: {
  mapping?: Record<string, unknown> | null
  options?: Record<string, unknown> | null
  autoSync?: Record<string, unknown> | null
  writeback?: Record<string, unknown> | null
}) {
  const defaults = buildDefaultSyncItemConfig(entityType)
  return {
    mappingText: formatJson(isSyncItemConfigEmpty(raw.mapping) ? defaults.mapping : raw.mapping || {}),
    optionsText: formatJson(isSyncItemConfigEmpty(raw.options) ? defaults.options : raw.options || {}),
    autoSyncText: formatJson(isSyncItemConfigEmpty(raw.autoSync) ? defaults.autoSync : raw.autoSync || {}),
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

function buildAutoSyncFormState(raw: Record<string, unknown>, entityType: FeishuBitableSyncItemEntityType): SyncAutoSyncFormState {
  const defaults = buildDefaultSyncItemConfig(entityType).autoSync as Record<string, unknown>
  return {
    enabled: raw.enabled === undefined ? Boolean(defaults.enabled) : Boolean(raw.enabled),
    recordStatusField: toText(raw.recordStatusField || defaults.recordStatusField || '记录状态') || '记录状态',
    syncStatusField: toText(raw.syncStatusField || defaults.syncStatusField || '同步信息') || '同步信息',
    completedValuesText: joinMultiValueText(raw.completedValues || defaults.completedValues || ['已完成']) || '已完成',
    pendingValuesText: joinMultiValueText(raw.pendingValues || defaults.pendingValues || ['未同步']) || '未同步',
    syncedValuesText: joinMultiValueText(raw.syncedValues || defaults.syncedValues || ['已同步']) || '已同步',
    resetRecordStatusValue: toText(raw.resetRecordStatusValue || defaults.resetRecordStatusValue || '撰写中') || '撰写中',
    resetSyncStatusValue: toText(raw.resetSyncStatusValue || defaults.resetSyncStatusValue || '未同步') || '未同步',
    useMappedFieldsAsWatched: raw.useMappedFieldsAsWatched === undefined
      ? Boolean(defaults.useMappedFieldsAsWatched ?? true)
      : Boolean(raw.useMappedFieldsAsWatched),
    watchedFieldNamesText: joinMultiValueText(raw.watchedFieldNames || defaults.watchedFieldNames),
    ignoredFieldNamesText: joinMultiValueText(raw.ignoredFieldNames || defaults.ignoredFieldNames),
  }
}

function fillAutoSyncForm(raw: Record<string, unknown>) {
  Object.assign(autoSyncForm, buildAutoSyncFormState(raw, itemForm.entityType))
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

function buildAutoSyncPayload(): Record<string, unknown> {
  return {
    enabled: Boolean(autoSyncForm.enabled),
    recordStatusField: toText(autoSyncForm.recordStatusField) || '记录状态',
    syncStatusField: toText(autoSyncForm.syncStatusField) || '同步信息',
    completedValues: splitMultiValueText(autoSyncForm.completedValuesText),
    pendingValues: splitMultiValueText(autoSyncForm.pendingValuesText),
    syncedValues: splitMultiValueText(autoSyncForm.syncedValuesText),
    resetRecordStatusValue: toText(autoSyncForm.resetRecordStatusValue),
    resetSyncStatusValue: toText(autoSyncForm.resetSyncStatusValue),
    useMappedFieldsAsWatched: Boolean(autoSyncForm.useMappedFieldsAsWatched),
    watchedFieldNames: splitMultiValueText(autoSyncForm.watchedFieldNamesText),
    ignoredFieldNames: splitMultiValueText(autoSyncForm.ignoredFieldNamesText),
  }
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

function normalizeSyncIssueCode(code?: string | null): string {
  return toText(code).trim().replace(/-/g, '_').toUpperCase()
}

function resolveSyncIssueCategory(code?: string | null, message?: string | null): SyncIssueCategoryKey {
  const normalizedCode = normalizeSyncIssueCode(code)
  if (normalizedCode && SYNC_ISSUE_CATEGORY_BY_CODE[normalizedCode])
    return SYNC_ISSUE_CATEGORY_BY_CODE[normalizedCode]

  if (normalizedCode.includes('WRITEBACK'))
    return 'writeback'

  const normalizedMessage = toText(message).toLowerCase()
  if (normalizedMessage.includes('writeback') || normalizedMessage.includes('回填'))
    return 'writeback'
  if (
    normalizedMessage.includes('contestexternalid')
    || normalizedMessage.includes('trackexternalid')
    || normalizedMessage.includes('关联竞赛编号')
    || normalizedMessage.includes('关联赛道编号')
  ) {
    return 'relation'
  }
  if (
    normalizedMessage.includes('必要字段')
    || normalizedMessage.includes('externalid')
    || normalizedMessage.includes('persona')
  ) {
    return 'mapping'
  }
  return 'source'
}

function collectSyncIssueFieldHints(target: Set<string>, raw: string): void {
  const normalized = toText(raw)
  if (!normalized)
    return

  for (const part of normalized.split(/\s*[/、,，或和]\s*/)) {
    const cleaned = part.replace(/[`"'“”‘’。.;；:：]/g, '').trim()
    if (cleaned && SYNC_ISSUE_FIELD_HINT_SET.has(cleaned))
      target.add(cleaned)
  }
}

function extractSyncIssueFieldHints(code?: string | null, message?: string | null): string[] {
  const hints = new Set<string>()
  const normalizedCode = normalizeSyncIssueCode(code)
  if (normalizedCode === 'EXTERNAL_ID_MISSING')
    hints.add('externalId')
  if (normalizedCode === 'CONTEST_REF_NOT_FOUND')
    hints.add('contestExternalId')
  if (normalizedCode === 'TRACK_REF_NOT_FOUND')
    hints.add('trackExternalId')
  if (normalizedCode === 'PERSONA_SLOTS_EMPTY')
    hints.add('persona1~5')

  const normalizedMessage = toText(message)
  for (const match of normalizedMessage.matchAll(/[（(]([^）)]+)[）)]/g))
    collectSyncIssueFieldHints(hints, match[1] || '')

  const requiredFieldMatch = normalizedMessage.match(/必要字段[:：]?\s*([\w~\s,，/、或和]+)/)
  if (requiredFieldMatch)
    collectSyncIssueFieldHints(hints, requiredFieldMatch[1] || '')

  for (const match of normalizedMessage.matchAll(/\b[a-z]\w*(?:~\w+)?\b/gi)) {
    const token = match[0]
    if (SYNC_ISSUE_FIELD_HINT_SET.has(token))
      hints.add(token)
  }

  return [...hints]
}

function syncIssueCategoryLabel(code?: string | null, message?: string | null): string {
  return SYNC_ISSUE_CATEGORY_META[resolveSyncIssueCategory(code, message)].label
}

function syncIssueCategoryColor(code?: string | null, message?: string | null): string {
  return SYNC_ISSUE_CATEGORY_META[resolveSyncIssueCategory(code, message)].color
}

function syncIssueSuggestion(code?: string | null, message?: string | null): string {
  const category = resolveSyncIssueCategory(code, message)
  const fieldHints = extractSyncIssueFieldHints(code, message)
  if (category === 'mapping') {
    const hintText = fieldHints.length ? fieldHints.join(' / ') : 'externalId、必填字段'
    return `去“映射配置”检查 ${hintText} 对应的飞书字段映射。`
  }
  if (category === 'relation') {
    const hintText = fieldHints.length ? fieldHints.join(' / ') : 'contestExternalId / trackExternalId'
    return `去“映射配置”检查 ${hintText} 的关联字段映射与源记录取值。`
  }
  if (category === 'writeback')
    return '去“回填配置”检查状态、原因码、runId 等回填列是否存在且字段名正确。'
  return '优先核对飞书源记录内容，再结合当前映射配置确认字段是否缺值。'
}

function filterSyncIssues(
  issues: FeishuSyncIssue[] = [],
  filters: SyncIssueFilterState,
): FeishuSyncIssue[] {
  return sortedSyncIssues(issues).filter((issue) => {
    if (filters.status && issue.status !== filters.status)
      return false
    if (filters.reasonCode && normalizeSyncIssueCode(issue.reasonCode) !== normalizeSyncIssueCode(filters.reasonCode))
      return false
    return true
  })
}

function syncIssueReasonOptions(detail?: FeishuBitableSyncItemDetail | null): Array<SelectOption<string> & { helper: string }> {
  const options = (detail?.issueReasonStats || [])
    .filter(item => toText(item.reasonCode))
    .map(item => ({
      value: item.reasonCode,
      label: item.reasonCode,
      helper: `待处理 ${item.openCount} / 总计 ${item.totalCount}`,
    }))

  if (!options.some(item => item.value === ''))
    options.unshift({ value: '', label: '全部原因码', helper: '不过滤原因码' })

  return options
}

function filteredOpenIssueCount(detail: FeishuBitableSyncItemDetail | null | undefined, filters: SyncIssueFilterState): number {
  if (!detail)
    return 0
  if (filters.status && filters.status !== 'open')
    return 0
  if (!filters.reasonCode)
    return Math.max(0, Number(detail.issueStats.open || 0) || 0)
  return Math.max(
    0,
    Number(detail.issueReasonStats.find(item => normalizeSyncIssueCode(item.reasonCode) === normalizeSyncIssueCode(filters.reasonCode))?.openCount || 0) || 0,
  )
}

function quickStartStepText(step: string): string {
  return String(step || '').replace(/^\d+\.\s*/, '')
}

function previewFocusFields(entityType: FeishuBitableSyncItemEntityType): string[] {
  if (entityType === 'track')
    return ['externalId', 'contestExternalId', 'name', 'timelineText']
  if (entityType === 'track_timeline')
    return ['externalId', 'contestExternalId', 'trackExternalId', 'nodeType', 'year']
  if (entityType === 'resource')
    return ['externalId', 'contestExternalId', 'trackExternalId', 'title', 'attachment']
  if (entityType === 'policy')
    return ['externalId', 'meetingName', 'conferenceDate', 'importance']
  if (entityType === 'persona')
    return ['externalId', 'contestExternalId', 'object', 'persona1', 'persona2']
  return ['externalId', 'name', 'officialUrl', 'timelineText', 'recommendedFor']
}

function isRequiredMappingField(entityType: FeishuBitableSyncItemEntityType, targetKey: string): boolean {
  return listRequiredSyncItemFieldGroups(entityType).some(group => group.keys.includes(targetKey))
}

function resolveWritebackStatusFieldForPayload(): string {
  return effectiveWritebackStatusField.value
}

function buildWritebackPayload(): Record<string, unknown> {
  return {
    enabled: Boolean(writebackForm.enabled),
    fields: {
      status: resolveWritebackStatusFieldForPayload(),
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
    autoSync: item.autoSync as Record<string, unknown> | undefined,
    writeback: item.writeback as Record<string, unknown> | undefined,
  })
  mappingSaveSuccess.value = ''
  writebackSaveSuccess.value = ''
  autoSyncSaveSuccess.value = ''

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
    itemForm.autoSyncText = normalized.autoSyncText
    itemForm.writebackText = normalized.writebackText
    loadMappingWizardFromJson()
    loadOptionsFormFromJson(false)
    resetAutoSyncDraft(false)
    resetWritebackDraft(false)
  })
}

function closeNestedConfigDrawers() {
  mappingDrawerVisible.value = false
  writebackDrawerVisible.value = false
  autoSyncDrawerVisible.value = false
}

function resetAutoSyncDraft(showNotice = false) {
  const savedText = String(itemForm.autoSyncText || '').trim() || formatJson(buildDefaultSyncItemConfig(itemForm.entityType).autoSync)
  autoSyncDraftText.value = savedText
  withVisualSyncPaused(() => {
    fillAutoSyncForm(parseJsonTextLoose(savedText))
  })
  if (showNotice)
    setSuccess('已恢复到当前已保存的自动同步配置。')
}

function resetWritebackDraft(showNotice = false) {
  const savedText = String(itemForm.writebackText || '').trim() || formatJson(buildDefaultSyncItemConfig(itemForm.entityType).writeback)
  writebackDraftText.value = savedText
  withVisualSyncPaused(() => {
    fillWritebackForm(parseJsonTextLoose(savedText))
  })
  if (showNotice)
    setSuccess('已恢复到当前已保存的回填配置。')
}

function openAutoSyncDrawer() {
  clearFeedback()
  resetAutoSyncDraft(false)
  autoSyncDrawerVisible.value = true
}

function openWritebackDrawer() {
  clearFeedback()
  resetWritebackDraft(false)
  writebackDrawerVisible.value = true
}

function closeWritebackDrawer() {
  resetWritebackDraft(false)
  writebackDrawerVisible.value = false
}

function resetCurrentItemLogRunSamples() {
  for (const type of RUN_SAMPLE_TYPE_LIST) {
    currentItemLogRunSamples[type].loading = false
    currentItemLogRunSamples[type].errorText = ''
    currentItemLogRunSamples[type].pageData = createEmptyRunSamplePage()
  }
}

function resetCurrentItemLogState() {
  currentItemLogVisible.value = false
  currentItemLogLoading.value = false
  currentItemLogErrorText.value = ''
  currentItemLogItemDetail.value = null
  currentItemLogSelectedRunId.value = ''
  resetCurrentItemLogRunSamples()
}

function resetCurrentItemState() {
  closeNestedConfigDrawers()
  resetCurrentItemLogState()
  currentItem.value = null
  previewResult.value = null
  simulateResult.value = null
  simulateSourceFieldPage.value = 1
  simulateErrorText.value = ''
  simulateForm.locatorType = 'auto'
  simulateForm.locatorValue = ''
  fieldInspection.value = []
  fieldInspectionError.value = ''
  mappingWizardBindings.value = []
}

async function loadCurrentItemLogDetail(itemId: string, preferredRunId = '') {
  if (!normalizedSyncId.value || !itemId)
    return
  currentItemLogLoading.value = true
  currentItemLogErrorText.value = ''
  resetCurrentItemLogRunSamples()
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
      '子表同步项执行日志加载失败。',
    )
    currentItemLogItemDetail.value = data
    currentItemLogSelectedRunId.value = preferredRunId || data.recentRuns[0]?.id || ''
    await loadCurrentItemLogRunSamples()
  }
  catch (error: any) {
    currentItemLogErrorText.value = String(error?.data?.message || '子表同步项执行日志加载失败。')
  }
  finally {
    currentItemLogLoading.value = false
  }
}

async function loadCurrentItemLogRunSamplePage(type: FeishuSyncRunSampleType, page = 1) {
  const runId = toText(currentItemLogSelectedRun.value?.id)
  const itemId = toText(currentItemLogItemDetail.value?.id || currentItem.value?.id)
  if (!normalizedSyncId.value || !itemId || !runId) {
    currentItemLogRunSamples[type].pageData = createEmptyRunSamplePage(page)
    currentItemLogRunSamples[type].errorText = ''
    currentItemLogRunSamples[type].loading = false
    return
  }

  currentItemLogRunSamples[type].loading = true
  currentItemLogRunSamples[type].errorText = ''
  try {
    const query = new URLSearchParams({
      type,
      page: String(page),
      pageSize: String(currentItemLogRunSamples[type].pageData.pageSize || RUN_SAMPLE_PAGE_SIZE),
    })
    if (props.includeArchived)
      query.set('includeArchived', 'true')
    const data = await requestApi<FeishuSyncRunSamplePage>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}/items/${encodeURIComponent(itemId)}/runs/${encodeURIComponent(runId)}/samples?${query.toString()}`),
      {},
      '同步运行样本加载失败。',
    )
    if (toText(currentItemLogSelectedRun.value?.id) !== runId)
      return
    currentItemLogRunSamples[type].pageData = data
  }
  catch (error: any) {
    currentItemLogRunSamples[type].pageData = createEmptyRunSamplePage(page)
    currentItemLogRunSamples[type].errorText = String(error?.data?.message || '同步运行样本加载失败。')
  }
  finally {
    if (toText(currentItemLogSelectedRun.value?.id) === runId)
      currentItemLogRunSamples[type].loading = false
  }
}

async function loadCurrentItemLogRunSamples() {
  resetCurrentItemLogRunSamples()
  const runId = toText(currentItemLogSelectedRun.value?.id)
  if (!runId)
    return
  await Promise.all(RUN_SAMPLE_TYPE_LIST.map(type => loadCurrentItemLogRunSamplePage(type, 1)))
}

async function openCurrentItemLogDrawer(preferredRunId = '') {
  const itemId = toText(currentItem.value?.id)
  if (!itemId)
    return
  currentItemLogVisible.value = true
  await loadCurrentItemLogDetail(itemId, preferredRunId)
}

async function refreshCurrentItemLogDrawer() {
  const itemId = toText(currentItemLogItemDetail.value?.id || currentItem.value?.id)
  if (!itemId)
    return
  await loadCurrentItemLogDetail(itemId, currentItemLogSelectedRunId.value)
}

async function handleSyncIssueAction(issue: FeishuSyncIssue, action: 'resolve' | 'ignore') {
  const issueId = toText(issue.id)
  if (!issueId || issue.status !== 'open')
    return

  issueActionMutating[issueId] = true
  clearFeedback()
  try {
    const path = action === 'resolve'
      ? `/admin/integrations/feishu/link-issues/${encodeURIComponent(issueId)}/resolve`
      : `/admin/integrations/feishu/link-issues/${encodeURIComponent(issueId)}/ignore`
    await requestApi<FeishuSyncIssue>(
      endpoint(path),
      {
        method: 'POST',
        body: action === 'resolve'
          ? { resolutionPayload: { source: 'sync_item_editor' } }
          : { reason: '管理员手动忽略' },
      },
      action === 'resolve' ? '关联问题标记失败。' : '关联问题忽略失败。',
    )

    await loadSyncDetail()
    if (activeItemId.value)
      await loadItemDetail(activeItemId.value)
    if (currentItemLogVisible.value)
      await refreshCurrentItemLogDrawer()
    emit('updated')
    setSuccess(action === 'resolve' ? '关联问题已标记为已解决。' : '关联问题已忽略。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || (action === 'resolve' ? '关联问题标记失败。' : '关联问题忽略失败。')))
  }
  finally {
    issueActionMutating[issueId] = false
  }
}

function batchIssueActionKey(target: 'current' | 'log', action: 'resolve' | 'ignore'): string {
  return `${target}:${action}`
}

async function handleBatchSyncIssueAction(target: 'current' | 'log', action: 'resolve' | 'ignore') {
  const detail = target === 'log' ? currentItemLogItemDetail.value : currentItem.value
  const filters = target === 'log' ? currentItemLogIssueFilters : currentItemIssueFilters
  const itemId = toText(detail?.id || currentItem.value?.id)
  const pendingCount = filteredOpenIssueCount(detail, filters)

  if (!normalizedSyncId.value || !itemId)
    return
  if (!pendingCount) {
    setError('当前筛选下没有可批量处理的待处理问题。')
    return
  }

  const actionKey = batchIssueActionKey(target, action)
  batchIssueActionMutating[actionKey] = true
  clearFeedback()
  try {
    const result = await requestApi<FeishuSyncIssueBatchHandleResult>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}/items/${encodeURIComponent(itemId)}/issues/batch-handle`),
      {
        method: 'POST',
        body: {
          action,
          status: 'open',
          reasonCode: toText(filters.reasonCode) || undefined,
        },
      },
      action === 'resolve' ? '关联问题批量标记失败。' : '关联问题批量忽略失败。',
    )

    await loadSyncDetail()
    if (activeItemId.value)
      await loadItemDetail(activeItemId.value)
    if (currentItemLogVisible.value)
      await refreshCurrentItemLogDrawer()
    emit('updated')
    setSuccess(action === 'resolve'
      ? `已批量标记 ${result.affectedCount} 条关联问题为已解决。`
      : `已批量忽略 ${result.affectedCount} 条关联问题。`)
  }
  catch (error: any) {
    setError(String(error?.data?.message || (action === 'resolve' ? '关联问题批量标记失败。' : '关联问题批量忽略失败。')))
  }
  finally {
    batchIssueActionMutating[actionKey] = false
  }
}

function selectCurrentItemLogRun(runId: string) {
  currentItemLogSelectedRunId.value = toText(runId)
  void loadCurrentItemLogRunSamples()
}

async function handleCurrentItemLogRunSamplePageChange(type: FeishuSyncRunSampleType, page: number) {
  await loadCurrentItemLogRunSamplePage(type, page)
}

function applyContestAutoSyncPreset() {
  withVisualSyncPaused(() => {
    autoSyncForm.enabled = true
    autoSyncForm.recordStatusField = '记录状态'
    autoSyncForm.syncStatusField = '同步信息'
    autoSyncForm.completedValuesText = '已完成'
    autoSyncForm.pendingValuesText = '未同步'
    autoSyncForm.syncedValuesText = '已同步'
    autoSyncForm.resetRecordStatusValue = '撰写中'
    autoSyncForm.resetSyncStatusValue = '未同步'
    autoSyncForm.useMappedFieldsAsWatched = true
  })
  syncAutoSyncFormToJson(false)
  setSuccess('已套用竞赛库自动同步预设，点“保存配置”后才会生效。')
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

function loadAutoSyncFormFromJson(showNotice = true) {
  const autoSync = parseJsonText(autoSyncDraftText.value, '自动同步配置')
  withVisualSyncPaused(() => {
    fillAutoSyncForm(autoSync)
  })
  if (showNotice)
    setSuccess('已从 JSON 回读自动同步配置。')
}

function syncAutoSyncFormToJson(showNotice = false) {
  autoSyncDraftText.value = formatJson(buildAutoSyncPayload())
  if (showNotice)
    setSuccess('已将自动同步配置同步到 JSON。')
}

function loadWritebackFormFromJson(showNotice = true) {
  const writeback = parseJsonText(writebackDraftText.value, '回填配置')
  withVisualSyncPaused(() => {
    fillWritebackForm(writeback)
  })
  if (showNotice)
    setSuccess('已从 JSON 回读回填配置。')
}

function syncWritebackFormToJson(showNotice = false) {
  writebackDraftText.value = formatJson(buildWritebackPayload())
  if (showNotice)
    setSuccess('已将回填配置同步到 JSON。')
}

function normalizeCurrentEntityTemplate() {
  try {
    normalizeMappingWizardBindings(mappingWizardBindings.value)
    autoFillMappingWizardBindings()
    writeMappingWizardToJson(false)
    syncOptionsFormToJson(false)
    syncAutoSyncFormToJson(false)
    syncWritebackFormToJson(false)
    loadMappingWizardFromJson()
    loadOptionsFormFromJson(false)
    loadAutoSyncFormFromJson(false)
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
  const autoSync = parseJsonText(itemForm.autoSyncText, '自动同步配置')
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
    if (isSyncItemConfigEmpty(autoSync)) {
      itemForm.autoSyncText = formatJson(defaults.autoSync)
      autoSyncDraftText.value = itemForm.autoSyncText
      fillAutoSyncForm(defaults.autoSync as Record<string, unknown>)
    }
    if (isSyncItemConfigEmpty(writeback)) {
      itemForm.writebackText = formatJson(defaults.writeback)
      writebackDraftText.value = itemForm.writebackText
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
    simulateResult.value = null
    simulateErrorText.value = ''
    simulateForm.locatorType = 'auto'
    simulateForm.locatorValue = ''
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
  if (activeItemId.value && activeItemId.value !== nextId) {
    closeNestedConfigDrawers()
    currentItemIssueFilters.status = 'open'
    currentItemIssueFilters.reasonCode = ''
    currentItemLogIssueFilters.status = 'open'
    currentItemLogIssueFilters.reasonCode = ''
  }
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
  simulateResult.value = null
  simulateErrorText.value = ''
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

function buildConfiguredMappingTargetFields(raw: Record<string, unknown>): MappingSchemaBoundaryConfiguredField[] {
  const parsed = pickMappingFromRaw(raw)
  const sourceByKey = new Map<string, string>()
  if (parsed.externalIdField)
    sourceByKey.set('externalId', parsed.externalIdField)
  if (parsed.contestExternalIdField)
    sourceByKey.set('contestExternalId', parsed.contestExternalIdField)
  if (parsed.trackExternalIdField)
    sourceByKey.set('trackExternalId', parsed.trackExternalIdField)
  for (const [key, sourceField] of Object.entries(parsed.fieldMap)) {
    if (sourceField)
      sourceByKey.set(key, sourceField)
  }

  const keys = new Set([...sourceByKey.keys(), ...Object.keys(parsed.computedMap)])
  return [...keys].map((key) => {
    const sourceField = sourceByKey.get(key) || ''
    const transform = parsed.computedMap[key] || ''
    const sourceText = sourceField && transform
      ? `${sourceField} / transform`
      : sourceField || (transform ? 'transform' : '-')
    return {
      key,
      label: mappingOptionLabelByEntityType(itemForm.entityType, key),
      sourceText,
    }
  })
}

function findInspectionFieldsByAliases(aliases: string[]): string[] {
  const aliasSet = new Set(aliases.map(alias => normalizeFeishuBitableFieldGuessKey(alias)).filter(Boolean))
  if (!aliasSet.size)
    return []
  return fieldInspection.value
    .map(field => toText(field.fieldName))
    .filter(fieldName => fieldName && aliasSet.has(normalizeFeishuBitableFieldGuessKey(fieldName)))
}

function buildManualRunRelationGuardText(
  entityType: FeishuBitableSyncItemEntityType,
  mappingRaw: Record<string, unknown>,
  optionsRaw: Record<string, unknown>,
): string {
  const mapping = pickMappingFromRaw(mappingRaw)
  const defaultContestId = toText(optionsRaw.contestId)
  const hasContestLink = Boolean(mapping.contestExternalIdField || mapping.computedMap.contestExternalId || defaultContestId)
  const hasTrackLink = Boolean(mapping.trackExternalIdField || mapping.computedMap.trackExternalId)

  if ((entityType === 'track' || entityType === 'track_timeline' || entityType === 'resource') && !hasContestLink)
    return '当前同步项缺少 contestExternalId 映射，也没有默认 contestId 兜底。请先在“映射配置”补齐 contestExternalId，或在“同步选项”里设置默认 contestId 后再手动执行。'

  if (entityType === 'track_timeline' && !hasTrackLink)
    return '当前同步项缺少 trackExternalId 映射。请先在“映射配置”补齐对应赛道字段后再手动执行。'

  return ''
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
  return guessFeishuBitableFieldName({
    entityType: itemForm.entityType,
    targetKey,
    fields: fieldInspection.value,
  })
}

function autoFillMappingWizardBindings(): number {
  let matchedCount = 0
  normalizeMappingWizardBindings(mappingWizardBindings.value.map((binding) => {
    if (binding.sourceField)
      return binding
    const guessedField = guessFieldNameByTarget(binding.targetKey)
    if (!guessedField)
      return binding
    matchedCount += 1
    return {
      ...binding,
      sourceField: guessedField,
    }
  }))
  return matchedCount
}

function rematchMissingMappingFields() {
  const matchedCount = autoFillMappingWizardBindings()
  writeMappingWizardToJson(false)
  setSuccess(matchedCount > 0
    ? `已重新匹配 ${matchedCount} 个缺失字段，保存配置后生效。`
    : '当前没有可自动匹配的缺失字段。')
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
  let autoSync: Record<string, unknown>
  let writeback: Record<string, unknown>
  try {
    writeMappingWizardToJson(false)
    syncOptionsFormToJson(false)
    syncAutoSyncFormToJson(false)
    syncWritebackFormToJson(false)
    mapping = parseJsonText(itemForm.mappingText, '字段映射')
    options = parseJsonText(itemForm.optionsText, '同步选项')
    autoSync = parseJsonText(autoSyncDraftText.value, '自动同步配置')
    writeback = parseJsonText(saveContext === 'writeback' ? writebackDraftText.value : itemForm.writebackText, '状态回填配置')
    if (saveContext === 'writeback')
      itemForm.writebackText = formatJson(writeback)
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
          autoSync,
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
    if (saveContext === 'writeback') {
      writebackDrawerVisible.value = false
      writebackSaveSuccess.value = '回填配置已保存。'
      setSuccess('回填配置已保存。')
      return
    }
    if (saveContext === 'autoSync') {
      autoSyncDrawerVisible.value = false
      autoSyncSaveSuccess.value = '自动同步规则已保存。'
      setSuccess('自动同步规则已保存。')
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

function buildCurrentItemDraft(): FeishuBitableSyncItemPreviewRequest {
  writeMappingWizardToJson(false)
  syncOptionsFormToJson(false)
  syncAutoSyncFormToJson(false)
  syncWritebackFormToJson(false)
  const mapping = parseJsonText(itemForm.mappingText, '字段映射')
  const options = parseJsonText(itemForm.optionsText, '同步选项')
  const autoSync = parseJsonText(autoSyncDraftText.value, '自动同步配置')
  const writeback = parseJsonText(writebackDraftText.value, '状态回填配置')
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
    autoSync,
    writeback,
  }
  return draft
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
    const draft = buildCurrentItemDraft()
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

async function simulateCurrentItemRecord() {
  if (!normalizedSyncId.value || !currentItem.value)
    return
  const locatorValue = toText(simulateForm.locatorValue)
  if (!locatorValue) {
    simulateErrorText.value = '请先输入业务编号、recordId 或行号。'
    simulateResult.value = null
    return
  }

  simulatingRecord.value = true
  simulateErrorText.value = ''
  simulateResult.value = null
  clearFeedback()
  try {
    const draft: FeishuBitableSimulateRecordRequest = {
      ...buildCurrentItemDraft(),
      locatorType: simulateForm.locatorType,
      locatorValue: String(locatorValue),
    }
    const data = await requestApi<FeishuBitableSimulateRecordResult>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}/items/${encodeURIComponent(currentItem.value.id)}/simulate-record`),
      {
        method: 'POST',
        body: draft,
      },
      '模拟执行失败。',
    )
    simulateSourceFieldPage.value = 1
    simulateResult.value = data
    setSuccess('单行模拟完成。')
  }
  catch (error: any) {
    simulateErrorText.value = String(error?.data?.message || error?.message || '模拟执行失败。')
  }
  finally {
    simulatingRecord.value = false
  }
}

async function runCurrentSync() {
  if (archivedReadonly.value) {
    setError('当前同步信息已归档，只允许查看，不允许手动执行。')
    return
  }
  if (!normalizedSyncId.value)
    return
  if (!syncDetail.value?.enabled) {
    setError('当前主同步信息已禁用，请先启用后再执行同步。')
    return
  }
  if (!syncDetail.value.enabledItemCount) {
    setError('当前无已启用的子表同步项。')
    return
  }

  runningSync.value = true
  clearFeedback()
  try {
    const result = await requestApi<SyncManualRunResult>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}/run`),
      {
        method: 'POST',
      },
      '同步执行失败。',
    )
    await loadSyncDetail()
    emit('updated')
    const runText = `状态 ${runStatusLabel(result.status)} / 子项 ${result.itemCount} / 成功 ${result.successCount} / 部分成功 ${result.partialSuccessCount} / 失败 ${result.failedCount}`
    const dataText = `抓取 ${result.fetchedCount} / 新增 ${result.createdCount} / 更新 ${result.updatedCount} / 跳过 ${result.skippedCount} / 错误 ${result.errorCount + result.writebackErrorCount}`
    if (result.status === 'failed')
      setError(`手动同步执行失败，${runText}。${dataText}。`)
    else
      setSuccess(`手动同步执行完成，${runText}。${dataText}。`)
  }
  catch (error: any) {
    setError(String(error?.data?.message || '同步执行失败。'))
  }
  finally {
    runningSync.value = false
  }
}

async function runCurrentItem(force = false) {
  if (archivedReadonly.value) {
    setError('当前同步信息已归档，只允许查看，不允许手动执行。')
    return
  }
  if (!normalizedSyncId.value || !currentItem.value)
    return
  if (currentItemRelationGuardText.value) {
    setError(currentItemRelationGuardText.value)
    return
  }
  const itemId = currentItem.value.id
  runningItem.value = true
  clearFeedback()
  try {
    const result = await requestApi<{
      runId: string
      status: 'success' | 'partial_success' | 'failed'
      fetchedCount: number
      createdCount: number
      updatedCount: number
      skippedCount: number
      errorCount: number
      writebackSuccessCount: number
      writebackErrorCount: number
    }>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}/items/${encodeURIComponent(itemId)}/run`),
      {
        method: 'POST',
        body: force ? { force: true } : undefined,
      },
      '同步执行失败。',
    )
    await loadSyncDetail()
    activeItemId.value = itemId
    await loadItemDetail(itemId)
    currentItemLogVisible.value = true
    await loadCurrentItemLogDetail(itemId, result.runId)
    emit('updated')
    setSuccess(`${force ? '强制同步' : '同步执行'}完成，已刷新最近运行结果。抓取 ${result.fetchedCount} / 新增 ${result.createdCount} / 更新 ${result.updatedCount} / 跳过 ${result.skippedCount} / 错误 ${result.errorCount}。`)
  }
  catch (error: any) {
    setError(String(error?.data?.message || '同步执行失败。'))
  }
  finally {
    runningItem.value = false
  }
}

async function loadCleanupPreview() {
  if (!normalizedSyncId.value || !currentItem.value)
    return
  cleanupPreviewLoading.value = true
  cleanupPreviewErrorText.value = ''
  try {
    cleanupPreviewResult.value = await requestApi<FeishuBitableSyncCleanupPreview>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}/items/${encodeURIComponent(currentItem.value.id)}/cleanup-preview`),
      {
        method: 'POST',
      },
      '清理预览加载失败。',
    )
  }
  catch (error: any) {
    cleanupPreviewPreviewResultReset()
    cleanupPreviewErrorText.value = String(error?.data?.message || error?.message || '清理预览加载失败。')
  }
  finally {
    cleanupPreviewLoading.value = false
  }
}

function cleanupPreviewPreviewResultReset() {
  cleanupPreviewResult.value = null
}

async function openCleanupDialog() {
  if (archivedReadonly.value) {
    setError('当前同步信息已归档，只允许查看，不允许执行同步清理。')
    return
  }
  if (!normalizedSyncId.value || !currentItem.value)
    return
  cleanupPreviewVisible.value = true
  cleanupPreviewErrorText.value = ''
  cleanupConfirmText.value = ''
  cleanupPreviewPreviewResultReset()
  await loadCleanupPreview()
}

async function confirmCleanupCurrentItem() {
  if (!normalizedSyncId.value || !currentItem.value || !cleanupConfirmMatched.value) {
    cleanupPreviewErrorText.value = `请输入确认词“${toText(cleanupPreviewResult.value?.confirmationToken) || '清理同步数据'}”后再执行。`
    return
  }
  cleaningCurrentItem.value = true
  cleanupPreviewErrorText.value = ''
  clearFeedback()
  try {
    await requestApi<FeishuBitableSyncCleanupResult>(
      endpoint(`/admin/integrations/feishu/bitable-syncs/${encodeURIComponent(normalizedSyncId.value)}/items/${encodeURIComponent(currentItem.value.id)}/cleanup`),
      {
        method: 'POST',
        body: {
          confirmationToken: cleanupConfirmText.value.trim(),
        },
      },
      '同步清理失败。',
    )
    await loadSyncDetail()
    if (activeItemId.value)
      await loadItemDetail(activeItemId.value)
    if (currentItemLogVisible.value)
      await refreshCurrentItemLogDrawer()
    emit('updated')
    cleanupPreviewVisible.value = false
    cleanupConfirmText.value = ''
    setSuccess('同步清理完成。')
  }
  catch (error: any) {
    cleanupPreviewErrorText.value = String(error?.data?.message || error?.message || '同步清理失败。')
  }
  finally {
    cleaningCurrentItem.value = false
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
          autoSync: defaults.autoSync,
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

function previewResultTone(result: FeishuBitableSyncItemPreviewResult | null): ItemStageTone {
  if (!result)
    return 'gray'
  if (result.errorCount > 0 || result.issueCounts.transformError > 0)
    return 'red'
  if (result.fetchedCount <= 0)
    return 'gold'
  if (result.issueCounts.total > 0 || result.skippedCount > 0 || result.writebackErrorCount > 0)
    return 'gold'
  if (result.createdCount + result.updatedCount > 0)
    return 'green'
  return 'blue'
}

function previewResultStatusLabel(result: FeishuBitableSyncItemPreviewResult | null): string {
  if (!result)
    return '尚未执行预检'
  const tone = previewResultTone(result)
  if (tone === 'red')
    return '预检已阻断'
  if (result.fetchedCount <= 0)
    return '当前没有可执行记录'
  if (tone === 'gold')
    return '预检有待处理项'
  if (tone === 'green')
    return '可以进入手动验证'
  return '预检结果待确认'
}

function previewResultSummary(result: FeishuBitableSyncItemPreviewResult | null): string {
  if (!result)
    return '先执行一次预检，确认当前草稿映射、回填和自动同步规则是否具备执行条件。'
  if (result.errorCount > 0 || result.issueCounts.transformError > 0)
    return `预检阶段已经出现 ${result.errorCount} 条执行错误和 ${result.issueCounts.transformError} 条 transform 异常，当前不适合继续手动执行。`
  if (result.fetchedCount <= 0)
    return '当前视图没有抓到任何记录，这次执行不会产生真实写入。'
  if (result.issueCounts.externalIdMissing > 0 || result.issueCounts.missingRequiredField > 0 || result.issueCounts.sourceFieldMissing > 0 || result.issueCounts.mappingEmpty > 0)
    return '映射仍有硬缺口，继续执行通常只会得到跳过记录或必要字段缺失。'
  if (result.issueCounts.contestRefNotFound > 0 || result.issueCounts.trackRefNotFound > 0)
    return '关联实体还没有对齐，部分记录即使命中也无法稳定落到目标实体。'
  if (result.issueCounts.writebackFieldMissing > 0 || result.writebackErrorCount > 0)
    return '业务侧可能能落库，但飞书回填列仍不完整，执行后很难在源表判断写入结果。'
  if (result.issueCounts.personaSlotsEmpty > 0 || result.skippedCount > 0 || result.issueCounts.other > 0)
    return '预检已经暴露出跳过或弱告警，建议先核对原因，不要直接把这次结果当成可稳定执行。'
  if (result.createdCount + result.updatedCount > 0)
    return `当前预检显示可处理 ${result.createdCount + result.updatedCount} 条记录，未发现阻断项。`
  return '预检已完成，但还需要结合下方样例和诊断确认是否真的符合预期。'
}

function previewResultNextActionText(result: FeishuBitableSyncItemPreviewResult | null): string {
  if (!result)
    return '先执行一次预检，确认当前草稿配置是否能跑通。'
  if (result.errorCount > 0 || result.issueCounts.transformError > 0)
    return '先处理 transform 或预检错误，再重新预检。'
  if (result.fetchedCount <= 0)
    return '先检查当前子表/视图里是否真的有记录，再考虑执行。'
  if (result.issueCounts.externalIdMissing > 0 || result.issueCounts.missingRequiredField > 0 || result.issueCounts.sourceFieldMissing > 0 || result.issueCounts.mappingEmpty > 0)
    return '先回到“基础映射”补齐 externalId、必填字段和来源列。'
  if (result.issueCounts.contestRefNotFound > 0 || result.issueCounts.trackRefNotFound > 0)
    return '先补 contestExternalId / trackExternalId，或在“同步选项”里提供固定兜底 ID。'
  if (result.issueCounts.writebackFieldMissing > 0 || result.writebackErrorCount > 0)
    return '先刷新字段概览，再进入“回填配置”补齐状态、同步时间和 runId 等字段。'
  if (result.issueCounts.personaSlotsEmpty > 0 || result.skippedCount > 0 || result.issueCounts.other > 0)
    return '先用“单行模拟”核对被跳过记录和弱告警来源，再决定是否执行。'
  if (result.createdCount + result.updatedCount > 0)
    return '当前可以保存配置，并执行一次手动同步验证真实写入。'
  return '先查看下方诊断和样例行，确认没有遗漏后再执行。'
}

function simulateBusinessStatusLabel(status?: FeishuBitableSimulateBusinessStatus): string {
  if (status === 'created')
    return '预计新增'
  if (status === 'updated')
    return '预计更新'
  if (status === 'skipped')
    return '业务跳过'
  if (status === 'filtered')
    return '规则过滤'
  if (status === 'error')
    return '模拟错误'
  return '-'
}

function simulateBusinessStatusColor(status?: FeishuBitableSimulateBusinessStatus): string {
  if (status === 'created' || status === 'updated')
    return 'green'
  if (status === 'filtered')
    return 'gold'
  if (status === 'skipped')
    return 'orange'
  if (status === 'error')
    return 'red'
  return 'gray'
}

function simulateRuleHitText(result: FeishuBitableSimulateRecordResult | null): string {
  if (!result)
    return '尚未模拟。'
  if (!result.autoSync.enabled)
    return '未启用自动同步规则，真实手动执行会直接进入业务校验。'
  return result.autoSync.matched
    ? '规则命中，真实执行会进入业务校验。'
    : '规则未命中，真实执行会在自动同步过滤阶段停止。'
}

function simulateWritebackJsonText(result: FeishuBitableSimulateRecordResult | null): string {
  return JSON.stringify(result?.writebackPreview?.fields || {}, null, 2)
}

function simulateMissingFieldsText(result: FeishuBitableSimulateRecordResult | null): string {
  return result?.business.missingFields?.length ? result.business.missingFields.join(' / ') : '-'
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

watch(autoSyncForm, () => {
  if (suppressVisualSync.value)
    return
  syncAutoSyncFormToJson(false)
}, { deep: true })

watch(autoSyncDrawerVisible, (visible, previousVisible) => {
  if (visible || !previousVisible)
    return
  resetAutoSyncDraft(false)
})

watch(writebackDrawerVisible, (visible, previousVisible) => {
  if (visible || !previousVisible)
    return
  resetWritebackDraft(false)
})

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

watch(() => simulateResult.value?.locator.recordId || '', () => {
  simulateSourceFieldPage.value = 1
})

watch(currentItemIssueReasonOptions, (options) => {
  const currentReasonCode = toText(currentItemIssueFilters.reasonCode)
  if (!currentReasonCode)
    return
  if (!options.some(item => normalizeSyncIssueCode(item.value) === normalizeSyncIssueCode(currentReasonCode)))
    currentItemIssueFilters.reasonCode = ''
})

watch(currentItemLogIssueReasonOptions, (options) => {
  const currentReasonCode = toText(currentItemLogIssueFilters.reasonCode)
  if (!currentReasonCode)
    return
  if (!options.some(item => normalizeSyncIssueCode(item.value) === normalizeSyncIssueCode(currentReasonCode)))
    currentItemLogIssueFilters.reasonCode = ''
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
  <div ref="editorRootRef" class="space-y-4" :class="embedded ? 'pb-4' : ''">
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
          <a-tag size="small" :color="runHealthColor(syncDetailLatestRunSummary)">
            {{ runHealthLabel(syncDetailLatestRunSummary) }}
          </a-tag>
        </div>
        <h1 class="text-[16px] text-slate-900 font-semibold m-0">
          {{ syncDetail?.name || '多维同步信息' }}
        </h1>
        <p class="text-[12px] text-slate-500 m-0">
          主库 appToken：{{ syncDetail?.source.appToken || '-' }} / 最近执行：{{ syncDetailLatestRunText }}
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

    <section class="p-4 border border-slate-200 rounded bg-white space-y-4">
      <div class="flex flex-wrap gap-3 items-end justify-between xl:flex-nowrap">
        <div class="flex-1 gap-3 grid min-w-0 items-end md:grid-cols-[minmax(220px,1.6fr),180px,140px]">
          <label class="text-[11px] text-slate-600 font-medium block">
            同步信息名称
            <a-input v-model="syncForm.name" class="mt-1" size="small" allow-clear :disabled="archivedReadonly" placeholder="输入主库同步信息名称" />
          </label>
          <div class="text-[11px] text-slate-600 font-medium block">
            运行环境
            <a-select
              v-model="syncForm.environment"
              class="mt-1"
              size="small"
              :popup-container="selectPopupContainer"
              :disabled="archivedReadonly"
            >
              <a-option v-for="item in SYNC_ENVIRONMENT_OPTIONS" :key="item.value" :value="item.value">
                {{ item.label }}
              </a-option>
            </a-select>
          </div>
          <label class="text-[11px] text-slate-600 font-medium flex gap-2 items-center">
            <span>启用主同步</span>
            <a-switch v-model="syncForm.enabled" :disabled="archivedReadonly" />
          </label>
        </div>
        <div class="flex flex-wrap gap-3 items-end xl:justify-end">
          <div class="text-[11px] text-slate-500 xl:text-right">
            最近更新时间：{{ syncDetail ? formatDateTime(syncDetail.updatedAt) : '-' }}
            <template v-if="syncDetail?.archivedAt">
              / 归档时间：{{ formatDateTime(syncDetail.archivedAt) }}
            </template>
          </div>
          <a-button size="small" type="primary" :loading="savingSync" :disabled="archivedReadonly" @click="saveSyncInfo">
            保存同步信息
          </a-button>
        </div>
      </div>

      <div class="gap-3 grid md:grid-cols-2 xl:grid-cols-3">
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
        <div class="p-3 border border-slate-200 rounded bg-slate-50 md:col-span-2 xl:col-span-3">
          <p class="text-[10px] text-slate-500 m-0">
            来源 URL
          </p>
          <p class="text-[11px] text-slate-900 font-medium m-0 mt-1 break-all">
            {{ syncDetail?.source.sourceUrl || '-' }}
          </p>
        </div>
      </div>
    </section>

    <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
      <div class="flex flex-wrap gap-2 items-start justify-between">
        <div>
          <h3 class="text-[12px] text-slate-900 font-semibold m-0">
            主同步调度
          </h3>
          <p class="text-[11px] text-slate-500 m-0 mt-1">
            调度统一配置在多维同步信息层级；命中调度后会顺序执行当前主同步下所有已启用的子表同步项。
          </p>
        </div>
        <a-button
          size="small"
          type="primary"
          :loading="runningSync"
          :disabled="syncManualRunDisabled"
          @click="runCurrentSync"
        >
          手动执行同步
        </a-button>
      </div>
      <div class="gap-3 grid md:grid-cols-5">
        <div class="text-[11px] text-slate-600 font-medium block">
          <div>启用定时</div>
          <div class="mt-2">
            <a-switch v-model="syncForm.scheduleEnabled" :disabled="archivedReadonly" />
          </div>
        </div>
        <div class="text-[11px] text-slate-600 font-medium block">
          <div>调度模式</div>
          <a-select v-model="syncForm.scheduleMode" class="mt-1" size="small" :popup-container="selectPopupContainer" :disabled="archivedReadonly">
            <a-option v-for="option in SCHEDULE_MODE_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </a-option>
          </a-select>
        </div>
        <div v-if="syncForm.scheduleMode === 'interval'" class="text-[11px] text-slate-600 font-medium block">
          <div>间隔分钟</div>
          <a-input-number v-model="syncForm.scheduleIntervalMinutes" class="mt-1 w-full" size="small" :min="1" :step="5" :disabled="archivedReadonly" />
        </div>
        <div v-else class="text-[11px] text-slate-600 font-medium block md:col-span-2">
          <div>Cron</div>
          <a-input v-model="syncForm.scheduleCronExpr" class="mt-1" size="small" :disabled="archivedReadonly" />
        </div>
        <div class="text-[11px] text-slate-600 font-medium block">
          <div>时区</div>
          <a-input v-model="syncForm.scheduleTimezone" class="mt-1" size="small" :disabled="archivedReadonly" />
        </div>
      </div>
      <div class="gap-3 grid md:grid-cols-3">
        <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-slate-50">
          <p class="text-slate-500 m-0">
            下次执行
          </p>
          <p class="text-slate-900 font-medium m-0 mt-1">
            {{ syncDetail?.scheduleRuntime?.nextRunAt ? formatDateTime(syncDetail.scheduleRuntime.nextRunAt) : '-' }}
          </p>
        </div>
        <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-slate-50">
          <p class="text-slate-500 m-0">
            上次调度
          </p>
          <p class="text-slate-900 font-medium m-0 mt-1">
            {{ syncDetail?.scheduleRuntime?.lastRunAt ? formatDateTime(syncDetail.scheduleRuntime.lastRunAt) : '-' }}
          </p>
        </div>
        <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-slate-50">
          <p class="text-slate-500 m-0">
            调度错误
          </p>
          <p class="text-slate-900 font-medium m-0 mt-1 break-all">
            {{ syncDetail?.scheduleRuntime?.lastError || '无' }}
          </p>
        </div>
      </div>
    </section>

    <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
      <div class="flex gap-3 items-center justify-between">
        <div>
          <h2 class="text-[13px] text-slate-900 font-semibold m-0">
            子表同步项列表
          </h2>
          <p class="text-[11px] text-slate-500 m-0 mt-1">
            先从这里选择要配置的同步项，再打开详细配置 Drawer。列表里优先展示实体类型、来源子表、启用状态和最近结果，预检与执行日志仍在详情 Drawer 内查看。
          </p>
        </div>
        <div class="flex gap-2 items-center">
          <a-button size="mini" type="text" title="查看同步项配置说明" @click="quickStartGuideVisible = true">
            <span class="text-[12px] text-slate-600 leading-none font-semibold">?</span>
          </a-button>
          <a-tag color="arcoblue" size="small">
            {{ syncItems.length }} 个同步项
          </a-tag>
        </div>
      </div>

      <a-spin :loading="loadingSync">
        <a-table
          v-if="syncItems.length"
          :data="syncItems"
          :pagination="false"
          row-key="id"
          size="small"
          :bordered="{ cell: true }"
          :scroll="{ x: 980 }"
        >
          <template #columns>
            <a-table-column title="同步项" :width="320">
              <template #cell="{ record }">
                <div class="min-w-0">
                  <div class="flex flex-wrap gap-2 items-center">
                    <p class="text-[12px] text-slate-900 font-semibold m-0 truncate">
                      {{ record.name }}
                    </p>
                    <a-tag size="small" color="arcoblue">
                      {{ entityTypeLabel(record.entityType) }}
                    </a-tag>
                    <a-tag size="small" :color="record.isEnabled ? 'green' : 'gray'">
                      {{ record.isEnabled ? '已启用' : '未启用' }}
                    </a-tag>
                    <a-tag v-if="itemDrawerVisible && activeItemId === record.id" size="small" color="purple">
                      当前编辑
                    </a-tag>
                  </div>
                  <p class="text-[10px] text-slate-500 font-mono m-0 mt-1 break-all">
                    {{ record.id }}
                  </p>
                </div>
              </template>
            </a-table-column>

            <a-table-column title="来源子表" :width="300">
              <template #cell="{ record }">
                <div class="min-w-0">
                  <p class="text-[11px] text-slate-700 m-0 break-all">
                    {{ record.source?.tableName || record.tableId || '-' }} / {{ record.source?.viewName || record.viewId || '全部视图' }}
                  </p>
                  <p class="text-[10px] text-slate-500 m-0 mt-1 break-all">
                    tableId={{ record.tableId || '-' }} / viewId={{ record.viewId || '-' }}
                  </p>
                </div>
              </template>
            </a-table-column>

            <a-table-column title="状态" :width="180">
              <template #cell="{ record }">
                <div class="flex flex-col gap-2 items-start">
                  <label class="text-[11px] text-slate-500 flex gap-2 items-center">
                    <span>启用</span>
                    <a-switch
                      :model-value="record.isEnabled"
                      size="small"
                      :loading="itemToggleMutating[record.id]"
                      :disabled="archivedReadonly"
                      @change="(value) => toggleItemEnabled(record, Boolean(value))"
                    />
                  </label>
                  <a-tag v-if="syncDetail && !syncDetail.enabled" size="small" color="gold">
                    主同步已禁用
                  </a-tag>
                </div>
              </template>
            </a-table-column>

            <a-table-column title="最近结果" :width="220">
              <template #cell="{ record }">
                <div class="space-y-1">
                  <a-tag size="small" :color="runHealthColor(record.latestRunSummary)">
                    {{ runHealthLabel(record.latestRunSummary) }}
                  </a-tag>
                  <p class="text-[10px] text-slate-500 m-0">
                    最近：{{ latestRunSummaryText(record.latestRunSummary) }}
                  </p>
                  <p v-if="(record.latestRunSummary?.errorCount || 0) > 0" class="text-[10px] text-rose-500 m-0">
                    错误数：{{ record.latestRunSummary?.errorCount || 0 }}
                  </p>
                </div>
              </template>
            </a-table-column>

            <a-table-column title="操作" :width="120" align="center">
              <template #cell="{ record }">
                <a-button size="mini" type="primary" @click="openItemDrawer(record.id)">
                  查看配置
                </a-button>
              </template>
            </a-table-column>
          </template>
        </a-table>
        <a-empty v-else description="当前主库还没有子表同步项" />
      </a-spin>
    </section>

    <a-modal
      v-model:visible="quickStartGuideVisible"
      title="如何配置一个同步项"
      width="720px"
      :footer="false"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <p class="text-[12px] text-slate-600 leading-6 m-0">
            先选同步项，再进详细配置。常用表单会自动带推荐模板，JSON 只放在高级模式里兜底。
          </p>
          <p class="text-[12px] text-slate-600 leading-6 m-0">
            完整教程已经放到后台 <NuxtLink to="/admin/docs" class="text-blue-600 hover:underline">
              文档中心
            </NuxtLink>，适合第一次接手配置和审批发布的管理员按步骤照着做。
          </p>
        </div>
        <ol class="pl-5 list-decimal space-y-2">
          <li v-for="step in QUICK_START_STEPS" :key="step" class="text-[12px] text-slate-700 leading-6">
            {{ quickStartStepText(step) }}
          </li>
        </ol>
        <div class="flex justify-end">
          <a-button size="small" @click="quickStartGuideVisible = false">
            关闭
          </a-button>
        </div>
      </div>
    </a-modal>

    <a-modal
      v-model:visible="cleanupPreviewVisible"
      title="清理同步数据"
      width="720px"
      :ok-button-props="{ status: 'danger', disabled: !cleanupConfirmMatched }"
      :confirm-loading="cleaningCurrentItem"
      ok-text="确认清理"
      cancel-text="取消"
      @ok="confirmCleanupCurrentItem"
    >
      <div class="space-y-4">
        <div class="p-3 border border-rose-200 rounded bg-rose-50 space-y-2">
          <p class="text-[12px] text-rose-700 font-semibold m-0">
            该操作只清理当前同步项托管的数据，不会删除已发布的赛事/政策正式数据。
          </p>
          <p class="text-[11px] text-rose-700 m-0">
            会删除 external refs、搜索索引、分析结果、向量、运行样本、问题单、人设预设，以及当前同步项在未发布 release 草稿中的内容；已发布的赛事/政策正式数据会保留。
          </p>
        </div>

        <a-skeleton v-if="cleanupPreviewLoading" :animation="true">
          <a-skeleton-line :rows="6" />
        </a-skeleton>

        <template v-else-if="cleanupPreviewResult">
          <section class="p-3 border border-slate-200 rounded bg-slate-50 space-y-2">
            <p class="text-[12px] text-slate-900 font-semibold m-0">
              即将清理的同步托管数据
            </p>
            <div class="gap-2 grid md:grid-cols-2">
              <p class="text-[11px] text-slate-600 m-0">
                external refs：{{ cleanupPreviewResult.managedDataCounts.externalRefs }}
              </p>
              <p class="text-[11px] text-slate-600 m-0">
                搜索索引：{{ cleanupPreviewResult.managedDataCounts.searchIndex }}
              </p>
              <p class="text-[11px] text-slate-600 m-0">
                分析结果：{{ cleanupPreviewResult.managedDataCounts.entityAnalysis }}
              </p>
              <p class="text-[11px] text-slate-600 m-0">
                向量：{{ cleanupPreviewResult.managedDataCounts.vectors }}
              </p>
              <p class="text-[11px] text-slate-600 m-0">
                后处理任务：{{ cleanupPreviewResult.managedDataCounts.postSyncTasks }}
              </p>
              <p class="text-[11px] text-slate-600 m-0">
                运行样本：{{ cleanupPreviewResult.managedDataCounts.runSamples }}
              </p>
              <p class="text-[11px] text-slate-600 m-0">
                问题单：{{ cleanupPreviewResult.managedDataCounts.issues }}
              </p>
              <p class="text-[11px] text-slate-600 m-0">
                人设预设：{{ cleanupPreviewResult.managedDataCounts.personaPresets }}
              </p>
              <p class="text-[11px] text-slate-600 m-0">
                未发布 release 草稿：{{ cleanupPreviewResult.managedDataCounts.unpublishedReleaseDrafts }}
              </p>
              <p class="text-[11px] text-slate-600 m-0">
                冲突/重复被拦截：{{ cleanupPreviewResult.blockedConflictCount }}
              </p>
            </div>
          </section>

          <section class="p-3 border border-slate-200 rounded bg-white space-y-2">
            <p class="text-[12px] text-slate-900 font-semibold m-0">
              Legacy 快照强制清空
            </p>
            <div class="gap-2 grid md:grid-cols-2">
              <p class="text-[11px] text-slate-600 m-0">
                contest：{{ cleanupPreviewResult.legacyReleaseCleanup.contest }}
              </p>
              <p class="text-[11px] text-slate-600 m-0">
                track：{{ cleanupPreviewResult.legacyReleaseCleanup.track }}
              </p>
              <p class="text-[11px] text-slate-600 m-0">
                trackTimeline：{{ cleanupPreviewResult.legacyReleaseCleanup.trackTimeline }}
              </p>
              <p class="text-[11px] text-slate-600 m-0">
                resource：{{ cleanupPreviewResult.legacyReleaseCleanup.resource }}
              </p>
              <p class="text-[11px] text-slate-600 m-0">
                policy：{{ cleanupPreviewResult.legacyReleaseCleanup.policy }}
              </p>
              <p class="text-[11px] text-slate-600 m-0">
                合计：{{ cleanupPreviewResult.legacyReleaseCleanup.total }}
              </p>
            </div>
            <p class="text-[11px] text-slate-500 m-0">
              已发布 contest / policy 正式数据会保留：赛事 {{ cleanupPreviewResult.publishedContestDataCount }} 条，政策 {{ cleanupPreviewResult.publishedPolicyDataCount }} 条。
            </p>
          </section>

          <section class="space-y-2">
            <p class="text-[11px] text-slate-600 m-0">
              请输入确认词 <span class="text-rose-700 font-mono">{{ cleanupPreviewResult.confirmationToken }}</span> 后再执行危险清理。
            </p>
            <a-input v-model="cleanupConfirmText" size="small" placeholder="请输入确认词" />
          </section>
        </template>

        <p v-if="cleanupPreviewErrorText" class="text-[11px] text-rose-600 m-0">
          {{ cleanupPreviewErrorText }}
        </p>
      </div>
    </a-modal>

    <a-drawer
      v-model:visible="itemDrawerVisible"
      :title="currentItem ? `配置同步项：${currentItem.name}` : '配置同步项'"
      width="1320px"
      :footer="false"
      :mask-closable="!(savingItem || previewingItem || runningItem || simulatingRecord)"
      :closable="!(savingItem || previewingItem || runningItem || simulatingRecord)"
      @cancel="closeItemDrawer"
    >
      <div class="space-y-4">
        <section class="p-3 border border-slate-200 rounded bg-slate-50 space-y-2">
          <h2 class="text-[13px] text-slate-900 font-semibold m-0">
            这四块配置分别是什么
          </h2>
          <div class="gap-3 grid md:grid-cols-2 xl:grid-cols-4">
            <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-white">
              <p class="text-slate-900 font-medium m-0">
                映射配置
              </p>
              <p class="m-0 mt-1">
                决定飞书哪一列映射到平台哪个字段。`externalIdField` 是主键；`contestExternalIdField / trackExternalIdField` 只在需要关联实体时才要填。政策库这里的 `externalId` 应映射会议编号，不再用会议名称顶主键。
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
                自动同步规则
              </p>
              <p class="m-0 mt-1">
                用来定义事件触发时的状态机：`已完成 + 未同步` 自动同步，`已完成 + 已同步` 且业务字段变化时重置为 `撰写中 + 未同步`。
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
                    预检会直接使用当前 Drawer 里的草稿配置，你可以先改映射、自动同步规则和回填，再决定要不要保存。
                  </p>
                  <p class="text-[11px] text-slate-500 m-0 mt-1">
                    当前预检只会检查结构性缺失，比如 contestExternalId / trackExternalId 映射或默认 contestId 是否存在；如果编号本身选错了，请结合执行日志里的“业务去重/覆盖”和重复 externalId 样本排查。
                  </p>
                </div>
                <div class="flex gap-2">
                  <a-button size="small" :loading="previewingItem" :disabled="archivedReadonly" @click="previewCurrentItem">
                    预检
                  </a-button>
                  <a-button size="small" status="danger" :disabled="archivedReadonly" @click="openCleanupDialog">
                    清理同步数据
                  </a-button>
                  <a-button size="small" type="primary" :loading="runningItem" :disabled="currentItemRunDisabled" @click="runCurrentItem(false)">
                    手动执行
                  </a-button>
                  <a-popconfirm
                    content="强制同步会处理当前视图里的全部源行，并忽略自动同步状态筛选；但仍会尊重主同步启用状态、子表启用状态和关联映射阻断。确认继续？"
                    type="warning"
                    @ok="runCurrentItem(true)"
                  >
                    <a-button size="small" status="warning" :loading="runningItem" :disabled="currentItemRunDisabled">
                      强制同步
                    </a-button>
                  </a-popconfirm>
                  <a-button size="small" type="primary" :loading="savingItem" :disabled="archivedReadonly" @click="saveCurrentItem('main')">
                    保存配置
                  </a-button>
                </div>
              </div>

              <a-alert v-if="currentItemRelationGuardText" type="warning" :show-icon="true">
                {{ currentItemRelationGuardText }}
              </a-alert>

              <div class="p-3 border border-slate-200 rounded bg-slate-50 space-y-3">
                <div class="flex flex-wrap gap-2 items-center justify-between">
                  <div>
                    <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                      当前导入阶段
                    </h3>
                    <p class="text-[11px] text-slate-500 m-0 mt-1">
                      用一屏状态卡判断这条同步项现在卡在哪一步，不必逐个打开二级 Drawer 才能确认。
                    </p>
                  </div>
                  <p class="text-[11px] text-slate-700 m-0">
                    下一步建议：{{ itemNextStepHint }}
                  </p>
                </div>

                <div class="gap-3 grid md:grid-cols-2 xl:grid-cols-5">
                  <section
                    v-for="card in itemStageCards"
                    :key="card.key"
                    class="p-3 border rounded space-y-2"
                    :class="card.panelClass"
                  >
                    <div class="flex gap-2 items-center justify-between">
                      <p class="text-[11px] text-slate-900 font-semibold m-0">
                        {{ card.title }}
                      </p>
                      <span class="text-[10px] px-2 py-1 rounded-full" :class="card.badgeClass">
                        {{ card.status }}
                      </span>
                    </div>
                    <p class="text-[11px] text-slate-700 leading-5 m-0">
                      {{ card.summary }}
                    </p>
                    <p class="text-[10px] text-slate-500 leading-5 m-0">
                      {{ card.hint }}
                    </p>
                  </section>
                </div>
              </div>

              <div class="gap-3 grid md:grid-cols-2 xl:grid-cols-3">
                <label class="text-[11px] text-slate-600 font-medium block">
                  同步项名称
                  <a-input v-model="itemForm.name" class="mt-1" size="small" allow-clear />
                </label>
                <label class="text-[11px] text-slate-600 font-medium block">
                  同步到
                  <div class="mt-1 flex flex-wrap gap-2">
                    <button
                      v-for="option in itemEntityTypeOptions"
                      :key="`item-entity-${option.value}`"
                      type="button"
                      class="text-[11px] px-3 py-1.5 border transition-colors"
                      :class="itemForm.entityType === option.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                      :aria-pressed="itemForm.entityType === option.value"
                      @click="itemForm.entityType = option.value"
                    >
                      {{ option.label }}
                    </button>
                  </div>
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
                  <a-select
                    v-model="itemForm.tableId"
                    class="mt-1"
                    size="small"
                    allow-search
                    :popup-container="selectPopupContainer"
                    placeholder="选择子表"
                    @change="handleItemTableChange"
                  >
                    <a-option v-for="item in availableTables" :key="item.tableId" :value="item.tableId">
                      {{ item.name }} ({{ item.tableId }})
                    </a-option>
                  </a-select>
                </label>
                <label class="text-[11px] text-slate-600 font-medium block">
                  视图
                  <a-select
                    v-model="itemForm.viewId"
                    class="mt-1"
                    size="small"
                    allow-search
                    :popup-container="selectPopupContainer"
                    placeholder="选择视图（可选）"
                    @change="handleItemViewChange"
                  >
                    <a-option value="">
                      全部视图（不限制）
                    </a-option>
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
                    {{ latestRunSummaryText(currentItem.latestRunSummary) }}
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
                  基础映射、自动同步规则和回填配置已拆到二级 Drawer。主页面只保留摘要，避免当前同步项的编辑信息过长难扫读。
                </p>
              </div>

              <div class="gap-3 grid md:grid-cols-2 xl:grid-cols-3">
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
                        自动同步规则
                      </h4>
                      <p class="text-[11px] text-slate-500 m-0 mt-1">
                        事件同步时先按这里判断是否自动执行，或是否先把记录状态重置回 `撰写中 / 未同步`。
                      </p>
                    </div>
                    <a-button size="mini" type="primary" @click="openAutoSyncDrawer">
                      编辑自动同步规则
                    </a-button>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <a-tag size="small" :color="savedAutoSyncState.enabled ? 'green' : 'gray'">
                      {{ autoSyncStatusLabel }}
                    </a-tag>
                    <a-tag size="small" color="arcoblue">
                      完成值 {{ savedAutoSyncCompletedValues.length || 0 }}
                    </a-tag>
                    <a-tag size="small" color="purple">
                      额外监听 {{ savedAutoSyncWatchedFields.length || 0 }}
                    </a-tag>
                  </div>
                  <p class="text-[11px] text-slate-600 m-0">
                    {{ autoSyncSummaryText }}
                  </p>
                  <p v-if="autoSyncSaveSuccess" class="text-[11px] text-emerald-700 m-0">
                    {{ autoSyncSaveSuccess }}
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
                    <a-button size="mini" type="primary" @click="openWritebackDrawer">
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
                  <p v-if="writebackSaveSuccess" class="text-[11px] text-emerald-700 m-0">
                    {{ writebackSaveSuccess }}
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
                    <a-select v-model="optionForm.defaultVisibility" class="mt-1" size="small" :popup-container="selectPopupContainer">
                      <a-option v-for="option in RESOURCE_VISIBILITY_OPTIONS" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </a-option>
                    </a-select>
                  </label>
                  <label class="text-[11px] text-slate-600 font-medium block">
                    默认状态
                    <a-select v-model="optionForm.defaultStatus" class="mt-1" size="small" :popup-container="selectPopupContainer">
                      <a-option v-for="option in RESOURCE_STATUS_OPTIONS" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </a-option>
                    </a-select>
                  </label>
                  <label class="text-[11px] text-slate-600 font-medium block">
                    默认资料分类
                    <a-select v-model="optionForm.defaultResourceCategory" class="mt-1" size="small" :popup-container="selectPopupContainer">
                      <a-option v-for="option in RESOURCE_CATEGORY_OPTIONS" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </a-option>
                    </a-select>
                  </label>
                  <label class="text-[11px] text-slate-600 font-medium block">
                    默认访问级别
                    <a-select v-model="optionForm.defaultResourceAccessLevel" class="mt-1" size="small" :popup-container="selectPopupContainer">
                      <a-option v-for="option in RESOURCE_ACCESS_LEVEL_OPTIONS" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </a-option>
                    </a-select>
                  </label>
                </template>
              </div>
            </section>

            <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
              <div class="flex flex-wrap gap-3 items-start justify-between">
                <div>
                  <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                    单行模拟
                  </h3>
                  <p class="text-[11px] text-slate-500 m-0 mt-1">
                    只读读取当前视图中的一行，按当前 Drawer 草稿输出规则命中 / 字段映射 / 业务结果 / 回填预览，不创建 run，不写回飞书。
                  </p>
                </div>
                <a-tag v-if="simulateResult" size="small" :color="simulateResult.autoSync.matched ? 'green' : 'gold'">
                  {{ simulateRuleHitText(simulateResult) }}
                </a-tag>
              </div>

              <div class="gap-2 grid md:grid-cols-[160px_1fr_auto]">
                <a-select
                  v-model="simulateForm.locatorType"
                  size="small"
                  :popup-container="selectPopupContainer"
                >
                  <a-option v-for="option in SIMULATE_LOCATOR_OPTIONS" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </a-option>
                </a-select>
                <a-input
                  v-model="simulateForm.locatorValue"
                  size="small"
                  allow-clear
                  placeholder="输入业务编号、recordId 或当前视图 1-based 行号"
                  @keyup.enter="simulateCurrentItemRecord"
                />
                <a-button size="small" type="primary" :loading="simulatingRecord" @click="simulateCurrentItemRecord">
                  模拟执行
                </a-button>
              </div>
              <p class="text-[10px] text-slate-500 m-0">
                业务编号按当前映射解析出的 externalId 匹配；行号按飞书当前视图接口返回顺序解释。
              </p>
              <p v-if="simulateErrorText" class="text-[11px] text-rose-600 m-0">
                {{ simulateErrorText }}
              </p>

              <template v-if="simulateResult">
                <div class="flex flex-wrap gap-2">
                  <a-tag size="small" color="arcoblue">
                    recordId: {{ simulateResult.locator.recordId }}
                  </a-tag>
                  <a-tag size="small">
                    行号: {{ simulateResult.locator.rowNumber }}
                  </a-tag>
                  <a-tag size="small" color="purple">
                    命中方式: {{ simulateResult.locator.matchedBy }}
                  </a-tag>
                </div>

                <div class="gap-3 grid xl:grid-cols-3">
                  <div class="text-[11px] p-3 border border-slate-200 rounded bg-slate-50 space-y-2">
                    <div class="flex items-center justify-between">
                      <p class="text-slate-900 font-medium m-0">
                        规则命中
                      </p>
                      <a-tag size="small" :color="simulateResult.autoSync.matched ? 'green' : 'gold'">
                        {{ simulateResult.autoSync.matched ? '命中' : '未命中' }}
                      </a-tag>
                    </div>
                    <p class="text-slate-600 m-0">
                      {{ simulateRuleHitText(simulateResult) }}
                    </p>
                    <p class="m-0">
                      {{ simulateResult.autoSync.recordStatusField || '记录状态' }}：{{ simulateResult.autoSync.recordStatusValue || '-' }}
                      <span :class="simulateResult.autoSync.recordStatusMatched ? 'text-emerald-700' : 'text-amber-700'">
                        {{ simulateResult.autoSync.recordStatusMatched ? '命中' : '未命中' }}
                      </span>
                    </p>
                    <p class="m-0">
                      {{ simulateResult.autoSync.syncStatusField || '同步信息' }}：{{ simulateResult.autoSync.syncStatusValue || '-' }}
                      <span :class="simulateResult.autoSync.syncStatusMatched ? 'text-emerald-700' : 'text-amber-700'">
                        {{ simulateResult.autoSync.syncStatusMatched ? '命中' : '未命中' }}
                      </span>
                    </p>
                    <p class="text-slate-500 m-0">
                      期望：{{ simulateResult.autoSync.completedValues.join(' / ') || '-' }} + {{ simulateResult.autoSync.pendingValues.join(' / ') || '-' }}
                    </p>
                  </div>

                  <div class="text-[11px] p-3 border border-slate-200 rounded bg-slate-50 space-y-2">
                    <div class="flex items-center justify-between">
                      <p class="text-slate-900 font-medium m-0">
                        业务结果
                      </p>
                      <a-tag size="small" :color="simulateBusinessStatusColor(simulateResult.business.status)">
                        {{ simulateBusinessStatusLabel(simulateResult.business.status) }}
                      </a-tag>
                    </div>
                    <p class="m-0">
                      externalId：{{ simulateResult.business.externalId || '-' }}
                    </p>
                    <p class="m-0">
                      原因码：{{ simulateResult.business.reasonCode || '-' }}
                    </p>
                    <p class="m-0">
                      缺失字段：{{ simulateMissingFieldsText(simulateResult) }}
                    </p>
                    <p v-if="simulateResult.business.message" class="text-slate-600 m-0">
                      {{ simulateResult.business.message }}
                    </p>
                  </div>

                  <div class="text-[11px] p-3 border border-slate-200 rounded bg-slate-50 space-y-2">
                    <p class="text-slate-900 font-medium m-0">
                      回填预览
                    </p>
                    <p class="text-slate-500 m-0">
                      {{ simulateResult.writebackPreview.enabled ? '如果真实执行到业务阶段，会按下面字段回填。' : '当前未启用回填。' }}
                    </p>
                    <pre class="text-[10px] text-slate-700 m-0 p-2 border border-slate-200 rounded bg-white overflow-x-auto">{{ simulateWritebackJsonText(simulateResult) }}</pre>
                  </div>
                </div>

                <div class="space-y-2">
                  <p class="text-[11px] text-slate-900 font-medium m-0">
                    字段映射
                  </p>
                  <div class="border border-slate-200 rounded overflow-auto">
                    <table class="text-[11px] text-left min-w-full border-collapse">
                      <thead class="bg-slate-50">
                        <tr>
                          <th class="px-3 py-2 border-b border-slate-200 whitespace-nowrap">
                            平台字段
                          </th>
                          <th class="px-3 py-2 border-b border-slate-200 whitespace-nowrap">
                            来源列 / transform
                          </th>
                          <th class="px-3 py-2 border-b border-slate-200 whitespace-nowrap">
                            解析值
                          </th>
                          <th class="px-3 py-2 border-b border-slate-200 whitespace-nowrap">
                            状态
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="field in simulateResult.mappedFields" :key="`simulate-field-${field.targetKey}`" class="align-top">
                          <td class="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                            <span class="text-slate-900">{{ mappingOptionLabel(field.targetKey) }}</span>
                            <a-tag v-if="field.personaSlot" size="small" color="purple" class="ml-1">
                              人设槽位
                            </a-tag>
                          </td>
                          <td class="text-slate-500 px-3 py-2 border-b border-slate-100 min-w-[180px]">
                            <div>{{ field.sourceField || '-' }}</div>
                            <div v-if="field.computed" class="text-[10px] mt-1 break-all">
                              {{ field.computed }}
                            </div>
                          </td>
                          <td class="text-slate-700 px-3 py-2 border-b border-slate-100 min-w-[220px] break-words">
                            {{ field.value || '空值' }}
                            <p v-if="field.error" class="text-[10px] text-rose-600 m-0 mt-1">
                              {{ field.error }}
                            </p>
                          </td>
                          <td class="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                            <a-tag size="small" :color="field.missing ? 'gold' : 'green'">
                              {{ field.missing ? '为空' : '有值' }}
                            </a-tag>
                            <a-tag v-if="field.required" size="small" color="red" class="ml-1">
                              必填
                            </a-tag>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div class="space-y-2">
                  <p class="text-[11px] text-slate-900 font-medium m-0">
                    源字段原值
                  </p>
                  <p class="text-[10px] text-slate-500 m-0">
                    共 {{ simulateSourceFieldsTotal }} 个源字段，按页查看当前记录原值。
                  </p>
                  <div class="gap-2 grid md:grid-cols-2 xl:grid-cols-3">
                    <div
                      v-for="field in simulateSourceFieldsPageData"
                      :key="`simulate-source-${field.fieldName}`"
                      class="text-[10px] p-2 border border-slate-200 rounded bg-slate-50"
                    >
                      <p class="text-slate-500 m-0 break-all">
                        {{ field.fieldName }}
                      </p>
                      <p class="text-slate-800 m-0 mt-1 break-words">
                        {{ field.textValue || '空值' }}
                      </p>
                    </div>
                  </div>
                  <div v-if="simulateSourceFieldsTotal > SIMULATE_SOURCE_FIELD_PAGE_SIZE" class="flex justify-end">
                    <a-pagination
                      :current="simulateSourceFieldPage"
                      :page-size="SIMULATE_SOURCE_FIELD_PAGE_SIZE"
                      :show-total="true"
                      :total="simulateSourceFieldsTotal"
                      size="small"
                      @change="(value: number) => simulateSourceFieldPage = value"
                    />
                  </div>
                </div>
              </template>
            </section>

            <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                  预检结果
                </h3>
                <span class="text-[10px] text-slate-500">{{ previewActionSummary(previewResult) }}</span>
              </div>
              <template v-if="previewResult">
                <div
                  class="p-3 border rounded space-y-2"
                  :class="itemStageToneMeta(previewResultTone(previewResult)).panelClass"
                >
                  <div class="flex flex-wrap gap-2 items-center justify-between">
                    <div>
                      <p class="text-[11px] text-slate-900 font-semibold m-0">
                        预检结论
                      </p>
                      <p class="text-[11px] text-slate-700 leading-5 m-0 mt-1">
                        {{ previewResultSummary(previewResult) }}
                      </p>
                    </div>
                    <span
                      class="text-[10px] px-2 py-1 rounded-full"
                      :class="itemStageToneMeta(previewResultTone(previewResult)).badgeClass"
                    >
                      {{ previewResultStatusLabel(previewResult) }}
                    </span>
                  </div>
                  <p class="text-[10px] text-slate-500 leading-5 m-0">
                    下一步：{{ previewResultNextActionText(previewResult) }}
                  </p>
                </div>

                <div class="flex flex-wrap gap-2">
                  <a-tag v-if="previewResult.issueCounts.externalIdMissing" color="red">
                    externalId 缺失 {{ previewResult.issueCounts.externalIdMissing }}
                  </a-tag>
                  <a-tag v-if="previewResult.issueCounts.missingRequiredField" color="orange">
                    必填缺失 {{ previewResult.issueCounts.missingRequiredField }}
                  </a-tag>
                  <a-tag v-if="previewResult.issueCounts.personaSlotsEmpty" color="gold">
                    人设槽位为空 {{ previewResult.issueCounts.personaSlotsEmpty }}
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
                  <div
                    v-for="(item, index) in previewResult.fieldDiagnostics.slice(0, 8)"
                    :key="`diag-${index}`"
                    class="text-[10px] px-2 py-2 border border-slate-200 rounded bg-slate-50"
                  >
                    <div class="flex flex-wrap gap-2 items-center">
                      <a-tag size="small" :color="syncIssueCategoryColor(item.kind, item.message)">
                        归因：{{ syncIssueCategoryLabel(item.kind, item.message) }}
                      </a-tag>
                      <span :class="diagnosticClass(item.level)">
                        {{ item.message }}<span v-if="item.detail">：{{ item.detail }}</span>
                      </span>
                    </div>
                    <p class="text-slate-500 m-0 mt-1">
                      排查建议：{{ syncIssueSuggestion(item.kind, item.message) }}
                    </p>
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
                      下面展示按当前草稿配置解析出的平台字段和值。重点看竞赛库的 `name / officialUrl / timelineText`、赛道库的 `contestExternalId / name / timelineText`、资料库的 `title / attachment`、政策库的 `externalId / meetingName / conferenceDate`、人设库的 `contestExternalId / object / persona1~5` 是否都落对。
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
                <div class="flex gap-3 items-center justify-between">
                  <div>
                    <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                      最近执行
                    </h3>
                    <p class="text-[10px] text-slate-500 m-0 mt-1">
                      点击任意一条执行记录，可查看详细执行日志。
                    </p>
                  </div>
                  <a-button size="mini" :disabled="!currentItem.recentRuns.length" @click="openCurrentItemLogDrawer()">
                    查看日志
                  </a-button>
                </div>
                <div v-if="currentItem.recentRuns.length" class="space-y-2">
                  <button
                    v-for="run in currentItem.recentRuns"
                    :key="run.id"
                    type="button"
                    class="px-3 py-2 text-left border border-slate-200 rounded bg-white w-full transition hover:border-slate-300 hover:bg-slate-50"
                    @click="openCurrentItemLogDrawer(run.id)"
                  >
                    <div class="flex flex-wrap gap-2 items-center">
                      <a-tag size="small" :color="runHealthColor(run)">
                        {{ runHealthLabel(run) }}
                      </a-tag>
                      <a-tag size="small">
                        {{ triggerSourceLabel(run.triggerSource) }}
                      </a-tag>
                      <a-tag size="small" color="arcoblue">
                        {{ syncRunModeLabel(run.mode) }}
                      </a-tag>
                      <a-tag v-if="isForceSyncRun(run)" size="small" color="gold">
                        强制同步
                      </a-tag>
                      <span class="text-[10px] text-slate-500 font-mono">{{ run.id }}</span>
                    </div>
                    <p class="text-[11px] text-slate-900 m-0 mt-2">
                      {{ formatDateTime(run.startedAt) }} / {{ formatDateTime(run.finishedAt) }}
                    </p>
                    <p class="text-[10px] text-slate-500 m-0 mt-1">
                      抓取 {{ run.fetchedCount }} / 新增 {{ run.createdCount }} / 更新 {{ run.updatedCount }} / 跳过 {{ run.skippedCount }} / 错误 {{ run.errorCount }}
                    </p>
                    <p
                      v-if="syncRunHintText(currentItem.entityType, run)"
                      class="text-[10px] text-amber-600 m-0 mt-1"
                    >
                      {{ syncRunHintText(currentItem.entityType, run) }}
                    </p>
                    <p v-if="syncRunForceText(run)" class="text-[10px] text-amber-600 m-0 mt-1">
                      {{ syncRunForceText(run) }}
                    </p>
                    <p v-if="run.deltaRecordCount !== undefined" class="text-[10px] text-slate-500 m-0 mt-1">
                      Delta 记录数：{{ run.deltaRecordCount }}
                    </p>
                  </button>
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
                <div class="flex flex-wrap gap-2 items-center justify-between">
                  <div class="flex flex-wrap gap-2 items-center">
                    <a-select v-model="currentItemIssueFilters.status" size="small" :popup-container="selectPopupContainer" class="w-[124px]">
                      <a-option v-for="option in SYNC_ISSUE_STATUS_FILTER_OPTIONS" :key="`current-issue-status-${option.value || 'all'}`" :value="option.value">
                        {{ option.label }}
                      </a-option>
                    </a-select>
                    <a-select v-model="currentItemIssueFilters.reasonCode" size="small" allow-clear :popup-container="selectPopupContainer" class="max-w-[320px] min-w-[220px]">
                      <a-option v-for="option in currentItemIssueReasonOptions" :key="`current-issue-reason-${option.value || 'all'}`" :value="option.value">
                        <div class="flex flex-col">
                          <span>{{ option.label }}</span>
                          <span class="text-[10px] text-slate-400">{{ option.helper }}</span>
                        </div>
                      </a-option>
                    </a-select>
                  </div>
                  <div class="flex flex-wrap gap-2 items-center justify-end">
                    <a-button
                      size="mini"
                      :disabled="currentItemBatchOpenIssueCount <= 0"
                      :loading="batchIssueActionMutating[batchIssueActionKey('current', 'resolve')]"
                      @click="handleBatchSyncIssueAction('current', 'resolve')"
                    >
                      全部标记已解决
                    </a-button>
                    <a-button
                      size="mini"
                      status="warning"
                      :disabled="currentItemBatchOpenIssueCount <= 0"
                      :loading="batchIssueActionMutating[batchIssueActionKey('current', 'ignore')]"
                      @click="handleBatchSyncIssueAction('current', 'ignore')"
                    >
                      全部忽略
                    </a-button>
                  </div>
                </div>
                <p class="text-[10px] text-slate-500 m-0">
                  当前范围：仅处理这个同步项下符合筛选条件的待处理问题；本次可批量处理 {{ currentItemBatchOpenIssueCount }} 条。
                </p>
                <div v-if="currentItemFilteredIssues.length" class="space-y-2">
                  <div v-for="issue in currentItemFilteredIssues" :key="issue.id" class="px-3 py-2 border border-slate-200 rounded">
                    <div class="flex flex-wrap gap-2 items-center">
                      <a-tag size="small" :color="syncIssueStatusColor(issue.status)">
                        {{ syncIssueStatusLabel(issue.status) }}
                      </a-tag>
                      <a-tag size="small">
                        {{ issue.reasonCode || '未标记原因' }}
                      </a-tag>
                      <a-tag size="small" :color="syncIssueCategoryColor(issue.reasonCode, issue.message)">
                        归因：{{ syncIssueCategoryLabel(issue.reasonCode, issue.message) }}
                      </a-tag>
                      <div v-if="issue.status === 'open'" class="ml-auto flex gap-1">
                        <a-button size="mini" :loading="issueActionMutating[issue.id]" @click="handleSyncIssueAction(issue, 'resolve')">
                          标记已解决
                        </a-button>
                        <a-button size="mini" status="warning" :loading="issueActionMutating[issue.id]" @click="handleSyncIssueAction(issue, 'ignore')">
                          忽略
                        </a-button>
                      </div>
                    </div>
                    <p class="text-[10px] text-slate-500 m-0 mt-1">
                      {{ issue.message }}
                    </p>
                    <p class="text-[10px] text-slate-600 m-0 mt-1">
                      排查建议：{{ syncIssueSuggestion(issue.reasonCode, issue.message) }}
                    </p>
                  </div>
                </div>
                <a-empty v-else :description="currentItem.issues.length ? '当前筛选下暂无问题单' : '暂无问题单'" />
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
      v-model:visible="currentItemLogVisible"
      title="子表同步项执行日志"
      width="960px"
      :footer="false"
    >
      <div class="space-y-4">
        <section class="p-3 border border-slate-200 bg-slate-50 space-y-2">
          <div class="flex flex-wrap gap-2 items-center justify-between">
            <div class="space-y-1">
              <p class="text-[12px] text-slate-900 font-semibold m-0">
                {{ currentItemLogItemDetail?.name || currentItem?.name || '当前子表同步项' }}
              </p>
              <p class="text-[10px] text-slate-500 m-0">
                主同步：{{ syncDetail?.name || normalizedSyncId || '-' }}
              </p>
              <p v-if="currentItemLogItemDetail" class="text-[10px] text-slate-500 m-0 break-all">
                子表：{{ currentItemLogItemDetail.source?.tableName || currentItemLogItemDetail.tableId || '-' }}
                /
                视图：{{ currentItemLogItemDetail.source?.viewName || currentItemLogItemDetail.viewId || '全部视图' }}
              </p>
            </div>
            <div class="flex gap-2">
              <a-button size="small" :loading="currentItemLogLoading" @click="refreshCurrentItemLogDrawer">
                刷新
              </a-button>
            </div>
          </div>
        </section>

        <section v-if="currentItemLogLoading" class="p-3 border border-slate-200 bg-white">
          <a-skeleton :animation="true">
            <a-skeleton-line :rows="8" />
          </a-skeleton>
        </section>

        <section v-else-if="currentItemLogErrorText" class="p-3 border border-rose-200 bg-rose-50 space-y-2">
          <p class="text-[10px] text-rose-600 m-0">
            {{ currentItemLogErrorText }}
          </p>
          <a-button size="small" status="danger" @click="refreshCurrentItemLogDrawer">
            重新加载
          </a-button>
        </section>

        <template v-else-if="currentItemLogItemDetail">
          <section class="gap-4 grid xl:grid-cols-[minmax(0,360px),minmax(0,1fr)]">
            <div class="p-4 border border-slate-200 bg-white space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                  本次选中执行
                </h3>
                <a-tag size="small" :color="runHealthColor(currentItemLogSelectedRun)">
                  {{ currentItemLogSelectedRun ? runHealthLabel(currentItemLogSelectedRun) : '未选择' }}
                </a-tag>
              </div>
              <template v-if="currentItemLogSelectedRun">
                <div class="flex flex-wrap gap-2">
                  <a-tag size="small">
                    {{ triggerSourceLabel(currentItemLogSelectedRun.triggerSource) }}
                  </a-tag>
                  <a-tag size="small" color="arcoblue">
                    {{ syncRunModeLabel(currentItemLogSelectedRun.mode) }}
                  </a-tag>
                </div>
                <p class="text-[10px] text-slate-500 font-mono m-0 break-all">
                  {{ currentItemLogSelectedRun.id }}
                </p>
                <p class="text-[10px] text-slate-700 m-0">
                  开始：{{ formatDateTime(currentItemLogSelectedRun.startedAt) }} / 结束：{{ formatDateTime(currentItemLogSelectedRun.finishedAt) }}
                </p>
                <p class="text-[10px] text-slate-500 m-0">
                  抓取 {{ currentItemLogSelectedRun.fetchedCount }} / 新增 {{ currentItemLogSelectedRun.createdCount }} / 更新 {{ currentItemLogSelectedRun.updatedCount }} / 跳过 {{ currentItemLogSelectedRun.skippedCount }} / 错误 {{ currentItemLogSelectedRun.errorCount }}
                </p>
                <div v-if="currentItemLogSelectedRun.diagnostics?.sourceFetchedCount !== undefined" class="flex flex-wrap gap-2">
                  <a-tag size="small" color="gold">
                    规则过滤 {{ currentItemLogSelectedRun.diagnostics.autoSyncFilteredCount || 0 }}
                  </a-tag>
                  <a-tag size="small" color="orange">
                    业务跳过 {{ currentItemLogSelectedRun.diagnostics.businessSkippedCount || 0 }}
                  </a-tag>
                  <a-tag size="small" color="cyan">
                    业务去重/覆盖 {{ currentItemLogSelectedRun.diagnostics.sourceDuplicateExternalIdCount || 0 }}
                  </a-tag>
                  <a-tag v-if="isForceSyncRun(currentItemLogSelectedRun)" size="small" color="gold">
                    强制同步
                  </a-tag>
                </div>
                <p v-if="syncRunForceText(currentItemLogSelectedRun)" class="text-[10px] text-amber-600 m-0">
                  {{ syncRunForceText(currentItemLogSelectedRun) }}
                </p>
                <p v-if="syncRunRuleFilterText(currentItemLogSelectedRun)" class="text-[10px] text-amber-600 m-0">
                  {{ syncRunRuleFilterText(currentItemLogSelectedRun) }}
                </p>
                <p v-if="syncRunBusinessSkipText(currentItemLogSelectedRun)" class="text-[10px] text-orange-600 m-0">
                  {{ syncRunBusinessSkipText(currentItemLogSelectedRun) }}
                </p>
                <p v-if="syncRunDuplicateExternalIdText(currentItemLogSelectedRun)" class="text-[10px] text-cyan-700 m-0">
                  {{ syncRunDuplicateExternalIdText(currentItemLogSelectedRun) }}
                </p>
                <p
                  v-if="syncRunHintText(currentItemLogItemDetail.entityType, currentItemLogSelectedRun)"
                  class="text-[10px] text-amber-600 m-0"
                >
                  {{ syncRunHintText(currentItemLogItemDetail.entityType, currentItemLogSelectedRun) }}
                </p>
                <div
                  v-if="currentItemLogSelectedRun.diagnostics?.sourceFetchedCount !== undefined"
                  class="p-3 border border-slate-200 bg-slate-50 space-y-3"
                >
                  <div class="flex gap-2 items-center justify-between">
                    <p class="text-[11px] text-slate-800 font-semibold m-0">
                      详细诊断
                    </p>
                    <a-tag size="small" color="arcoblue">
                      新运行支持完整分页样本
                    </a-tag>
                  </div>
                  <p v-if="syncRunAutoSyncMatchText(currentItemLogSelectedRun)" class="text-[10px] text-slate-600 m-0">
                    {{ syncRunAutoSyncMatchText(currentItemLogSelectedRun) }}
                  </p>
                  <div v-if="syncRunDuplicateExternalIdSamples(currentItemLogSelectedRun).length" class="space-y-2">
                    <p class="text-[10px] text-slate-700 font-medium m-0">
                      重复 externalId / 业务折叠样本
                    </p>
                    <div
                      v-for="sample in syncRunDuplicateExternalIdSamples(currentItemLogSelectedRun)"
                      :key="`duplicate-external-id-${sample.externalId}`"
                      class="p-2 border border-cyan-100 bg-white space-y-1"
                    >
                      <p class="text-[10px] text-slate-700 m-0">
                        externalId：{{ sample.externalId }}；源行 {{ sample.count }} 条；合并后只保留 1 个当前业务实体。
                      </p>
                      <p class="text-[10px] text-slate-500 font-mono m-0 break-all">
                        recordIds：{{ sample.recordIds.join(' / ') }}
                      </p>
                    </div>
                  </div>
                  <div
                    v-if="(currentItemLogSelectedRun.diagnostics.autoSyncFilteredCount || 0) > 0 || currentItemLogRunSampleState('auto_sync_filtered').loading || currentItemLogRunSampleState('auto_sync_filtered').errorText || currentItemLogRunSampleHasFallback('auto_sync_filtered', currentItemLogSelectedRun)"
                    class="space-y-2"
                  >
                    <div class="flex gap-2 items-center justify-between">
                      <p class="text-[10px] text-slate-700 font-medium m-0">
                        规则过滤样本
                      </p>
                      <a-tag v-if="currentItemLogRunSampleHasFallback('auto_sync_filtered', currentItemLogSelectedRun)" size="small" color="gold">
                        旧运行仅保留预览
                      </a-tag>
                    </div>
                    <a-skeleton v-if="currentItemLogRunSampleState('auto_sync_filtered').loading" :animation="true">
                      <a-skeleton-line :rows="3" />
                    </a-skeleton>
                    <p v-else-if="currentItemLogRunSampleState('auto_sync_filtered').errorText" class="text-[10px] text-rose-600 m-0">
                      {{ currentItemLogRunSampleState('auto_sync_filtered').errorText }}
                    </p>
                    <template v-else-if="currentItemLogRunSampleRecords('auto_sync_filtered').length">
                      <div
                        v-for="sample in currentItemLogRunSampleRecords('auto_sync_filtered')"
                        :key="sample.id"
                        class="p-2 border border-amber-100 bg-white space-y-1"
                      >
                        <p class="text-[10px] text-slate-500 font-mono m-0 break-all">
                          {{ sample.recordId }}
                        </p>
                        <p class="text-[10px] text-slate-700 m-0">
                          {{ currentItemLogRunSamplePayloadText(sample, 'recordStatusField', currentItemLogSelectedRun.diagnostics.autoSync.recordStatusField || '记录状态') }}：{{ currentItemLogRunSamplePayloadText(sample, 'recordStatus', '空值') }}
                          <span :class="currentItemLogRunSamplePayloadBoolean(sample, 'recordStatusMatched') ? 'text-emerald-600' : 'text-amber-600'">
                            {{ currentItemLogRunSamplePayloadBoolean(sample, 'recordStatusMatched') ? '命中' : '未命中' }}
                          </span>
                        </p>
                        <p class="text-[10px] text-slate-700 m-0">
                          {{ currentItemLogRunSamplePayloadText(sample, 'syncStatusField', currentItemLogSelectedRun.diagnostics.autoSync.syncStatusField || '同步信息') }}：{{ currentItemLogRunSamplePayloadText(sample, 'syncStatus', '空值') }}
                          <span :class="currentItemLogRunSamplePayloadBoolean(sample, 'syncStatusMatched') ? 'text-emerald-600' : 'text-amber-600'">
                            {{ currentItemLogRunSamplePayloadBoolean(sample, 'syncStatusMatched') ? '命中' : '未命中' }}
                          </span>
                        </p>
                        <p class="text-[10px] text-amber-600 m-0">
                          {{ syncRunAutoSyncReasonLabel(currentItemLogRunSamplePayloadText(sample, 'reason') as AutoSyncFilteredSample['reason']) }}
                        </p>
                      </div>
                      <div v-if="currentItemLogRunSampleState('auto_sync_filtered').pageData.total > currentItemLogRunSampleState('auto_sync_filtered').pageData.pageSize" class="flex justify-end">
                        <a-pagination
                          :current="currentItemLogRunSampleState('auto_sync_filtered').pageData.page"
                          :page-size="currentItemLogRunSampleState('auto_sync_filtered').pageData.pageSize"
                          :show-total="true"
                          :total="currentItemLogRunSampleState('auto_sync_filtered').pageData.total"
                          size="small"
                          @change="(value: number) => handleCurrentItemLogRunSamplePageChange('auto_sync_filtered', value)"
                        />
                      </div>
                    </template>
                    <template v-else-if="currentItemLogRunSampleHasFallback('auto_sync_filtered', currentItemLogSelectedRun)">
                      <p class="text-[10px] text-amber-700 m-0">
                        旧运行仅保留最多 12 条预览样本，新运行才支持完整分页查看。
                      </p>
                      <div
                        v-for="sample in syncRunAutoSyncFilteredSamples(currentItemLogSelectedRun)"
                        :key="`auto-sync-filtered-${sample.recordId}`"
                        class="p-2 border border-amber-100 bg-white space-y-1"
                      >
                        <p class="text-[10px] text-slate-500 font-mono m-0 break-all">
                          {{ sample.recordId }}
                        </p>
                        <p class="text-[10px] text-slate-700 m-0">
                          {{ currentItemLogSelectedRun.diagnostics.autoSync.recordStatusField || '记录状态' }}：{{ sample.recordStatus || '空值' }}
                          <span :class="sample.recordStatusMatched ? 'text-emerald-600' : 'text-amber-600'">
                            {{ sample.recordStatusMatched ? '命中' : '未命中' }}
                          </span>
                        </p>
                        <p class="text-[10px] text-slate-700 m-0">
                          {{ currentItemLogSelectedRun.diagnostics.autoSync.syncStatusField || '同步信息' }}：{{ sample.syncStatus || '空值' }}
                          <span :class="sample.syncStatusMatched ? 'text-emerald-600' : 'text-amber-600'">
                            {{ sample.syncStatusMatched ? '命中' : '未命中' }}
                          </span>
                        </p>
                        <p class="text-[10px] text-amber-600 m-0">
                          {{ syncRunAutoSyncReasonLabel(sample.reason) }}
                        </p>
                      </div>
                    </template>
                    <p v-else class="text-[10px] text-slate-500 m-0">
                      当前没有可展示的规则过滤样本。
                    </p>
                  </div>
                  <div
                    v-if="(currentItemLogSelectedRun.diagnostics.businessSkippedCount || 0) > 0 || currentItemLogRunSampleState('business_skipped').loading || currentItemLogRunSampleState('business_skipped').errorText || currentItemLogRunSampleHasFallback('business_skipped', currentItemLogSelectedRun)"
                    class="space-y-2"
                  >
                    <div class="flex gap-2 items-center justify-between">
                      <p class="text-[10px] text-slate-700 font-medium m-0">
                        业务跳过样本
                      </p>
                      <a-tag v-if="currentItemLogRunSampleHasFallback('business_skipped', currentItemLogSelectedRun)" size="small" color="gold">
                        旧运行仅保留预览
                      </a-tag>
                    </div>
                    <a-skeleton v-if="currentItemLogRunSampleState('business_skipped').loading" :animation="true">
                      <a-skeleton-line :rows="3" />
                    </a-skeleton>
                    <p v-else-if="currentItemLogRunSampleState('business_skipped').errorText" class="text-[10px] text-rose-600 m-0">
                      {{ currentItemLogRunSampleState('business_skipped').errorText }}
                    </p>
                    <template v-else-if="currentItemLogRunSampleRecords('business_skipped').length">
                      <div
                        v-for="sample in currentItemLogRunSampleRecords('business_skipped')"
                        :key="sample.id"
                        class="p-2 border border-orange-100 bg-white space-y-1"
                      >
                        <p class="text-[10px] text-slate-500 font-mono m-0 break-all">
                          {{ sample.recordId }}
                        </p>
                        <p class="text-[10px] text-slate-700 m-0">
                          原因：{{ sample.reasonCode || '-' }}；外部 ID：{{ sample.externalId || '-' }}；跳过 {{ currentItemLogRunSamplePayloadText(sample, 'skippedCount', '1') }}
                        </p>
                        <p class="text-[10px] text-slate-700 m-0">
                          缺失字段：{{ currentItemLogRunSampleMissingFieldsText(sample) }}
                        </p>
                        <p class="text-[10px] text-orange-600 m-0">
                          {{ currentItemLogRunSamplePayloadText(sample, 'message', '记录未通过同步校验。') }}
                        </p>
                        <details class="text-[10px] text-slate-600">
                          <summary class="text-slate-700 cursor-pointer">
                            查看业务 payload
                          </summary>
                          <pre class="mt-2 p-2 border border-slate-200 bg-slate-50 max-h-48 whitespace-pre-wrap break-all overflow-auto">{{ currentItemLogRunSampleResultPayloadText(sample) }}</pre>
                        </details>
                      </div>
                      <div v-if="currentItemLogRunSampleState('business_skipped').pageData.total > currentItemLogRunSampleState('business_skipped').pageData.pageSize" class="flex justify-end">
                        <a-pagination
                          :current="currentItemLogRunSampleState('business_skipped').pageData.page"
                          :page-size="currentItemLogRunSampleState('business_skipped').pageData.pageSize"
                          :show-total="true"
                          :total="currentItemLogRunSampleState('business_skipped').pageData.total"
                          size="small"
                          @change="(value: number) => handleCurrentItemLogRunSamplePageChange('business_skipped', value)"
                        />
                      </div>
                    </template>
                    <template v-else-if="currentItemLogRunSampleHasFallback('business_skipped', currentItemLogSelectedRun)">
                      <p class="text-[10px] text-amber-700 m-0">
                        旧运行仅保留最多 12 条预览样本，新运行才支持完整分页查看。
                      </p>
                      <div
                        v-for="sample in syncRunBusinessSkipSamples(currentItemLogSelectedRun)"
                        :key="`business-skip-${sample.recordId}-${sample.reasonCode}`"
                        class="p-2 border border-orange-100 bg-white space-y-1"
                      >
                        <p class="text-[10px] text-slate-500 font-mono m-0 break-all">
                          {{ sample.recordId }}
                        </p>
                        <p class="text-[10px] text-slate-700 m-0">
                          原因：{{ sample.reasonCode || '-' }}；外部 ID：{{ sample.externalId || '-' }}；跳过 {{ sample.skippedCount || 1 }}
                        </p>
                        <p class="text-[10px] text-slate-700 m-0">
                          缺失字段：{{ syncRunMissingFieldsText(sample) }}
                        </p>
                        <p class="text-[10px] text-orange-600 m-0">
                          {{ sample.message || '记录未通过同步校验。' }}
                        </p>
                      </div>
                    </template>
                    <p v-else class="text-[10px] text-slate-500 m-0">
                      当前没有可展示的业务跳过样本。
                    </p>
                  </div>
                  <details class="text-[10px] text-slate-600">
                    <summary class="text-slate-700 cursor-pointer">
                      查看诊断 JSON
                    </summary>
                    <pre class="mt-2 p-2 border border-slate-200 bg-white max-h-72 whitespace-pre-wrap break-all overflow-auto">{{ syncRunDiagnosticsJsonText(currentItemLogSelectedRun) }}</pre>
                  </details>
                </div>
                <p v-if="currentItemLogSelectedRun.deltaRecordCount !== undefined" class="text-[10px] text-slate-500 m-0">
                  Delta 记录数：{{ currentItemLogSelectedRun.deltaRecordCount }}
                </p>
                <p v-if="currentItemLogSelectedRun.errorMessage" class="text-[10px] text-rose-600 m-0 break-all">
                  错误摘要：{{ currentItemLogSelectedRun.errorMessage }}
                </p>
              </template>
              <a-empty v-else description="暂无执行记录" />
            </div>

            <div class="p-4 border border-slate-200 bg-white space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                  最近执行历史
                </h3>
                <a-tag size="small">
                  共 {{ currentItemLogItemDetail.recentRuns.length }} 条
                </a-tag>
              </div>
              <div v-if="currentItemLogItemDetail.recentRuns.length" class="space-y-2">
                <button
                  v-for="run in currentItemLogItemDetail.recentRuns"
                  :key="run.id"
                  type="button"
                  class="p-3 text-left border rounded w-full transition"
                  :class="currentItemLogSelectedRun?.id === run.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'"
                  @click="selectCurrentItemLogRun(run.id)"
                >
                  <div class="flex flex-wrap gap-2 items-center">
                    <a-tag size="small" :color="runHealthColor(run)">
                      {{ runHealthLabel(run) }}
                    </a-tag>
                    <a-tag size="small">
                      {{ triggerSourceLabel(run.triggerSource) }}
                    </a-tag>
                    <a-tag size="small" color="arcoblue">
                      {{ syncRunModeLabel(run.mode) }}
                    </a-tag>
                    <span class="text-[10px] text-slate-500 font-mono">{{ run.id }}</span>
                  </div>
                  <p class="text-[10px] text-slate-700 m-0 mt-2">
                    {{ formatDateTime(run.startedAt) }} / {{ formatDateTime(run.finishedAt) }}
                  </p>
                  <p class="text-[10px] text-slate-500 m-0 mt-1">
                    抓取 {{ run.fetchedCount }} / 新增 {{ run.createdCount }} / 更新 {{ run.updatedCount }} / 跳过 {{ run.skippedCount }} / 错误 {{ run.errorCount }}
                  </p>
                </button>
              </div>
              <a-empty v-else description="暂无执行记录" />
            </div>
          </section>

          <section class="p-4 border border-slate-200 bg-white space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                关联问题
              </h3>
              <div class="flex gap-2">
                <a-tag size="small" color="gold">
                  待处理 {{ currentItemLogItemDetail.issueStats.open }}
                </a-tag>
                <a-tag size="small">
                  总计 {{ currentItemLogItemDetail.issueStats.total }}
                </a-tag>
              </div>
            </div>
            <div class="flex flex-wrap gap-2 items-center justify-between">
              <div class="flex flex-wrap gap-2 items-center">
                <a-select v-model="currentItemLogIssueFilters.status" size="small" :popup-container="selectPopupContainer" class="w-[124px]">
                  <a-option v-for="option in SYNC_ISSUE_STATUS_FILTER_OPTIONS" :key="`log-issue-status-${option.value || 'all'}`" :value="option.value">
                    {{ option.label }}
                  </a-option>
                </a-select>
                <a-select v-model="currentItemLogIssueFilters.reasonCode" size="small" allow-clear :popup-container="selectPopupContainer" class="max-w-[320px] min-w-[220px]">
                  <a-option v-for="option in currentItemLogIssueReasonOptions" :key="`log-issue-reason-${option.value || 'all'}`" :value="option.value">
                    <div class="flex flex-col">
                      <span>{{ option.label }}</span>
                      <span class="text-[10px] text-slate-400">{{ option.helper }}</span>
                    </div>
                  </a-option>
                </a-select>
              </div>
              <div class="flex flex-wrap gap-2 items-center justify-end">
                <a-button
                  size="mini"
                  :disabled="currentItemLogBatchOpenIssueCount <= 0"
                  :loading="batchIssueActionMutating[batchIssueActionKey('log', 'resolve')]"
                  @click="handleBatchSyncIssueAction('log', 'resolve')"
                >
                  全部标记已解决
                </a-button>
                <a-button
                  size="mini"
                  status="warning"
                  :disabled="currentItemLogBatchOpenIssueCount <= 0"
                  :loading="batchIssueActionMutating[batchIssueActionKey('log', 'ignore')]"
                  @click="handleBatchSyncIssueAction('log', 'ignore')"
                >
                  全部忽略
                </a-button>
              </div>
            </div>
            <p class="text-[10px] text-slate-500 m-0">
              当前范围：仅处理这个同步项下符合筛选条件的待处理问题；本次可批量处理 {{ currentItemLogBatchOpenIssueCount }} 条。
            </p>
            <div v-if="currentItemLogFilteredIssues.length" class="space-y-2">
              <div v-for="issue in currentItemLogFilteredIssues" :key="issue.id" class="p-3 border border-slate-200 rounded bg-slate-50 space-y-2">
                <div class="flex flex-wrap gap-2 items-center">
                  <a-tag size="small" :color="syncIssueStatusColor(issue.status)">
                    {{ syncIssueStatusLabel(issue.status) }}
                  </a-tag>
                  <a-tag size="small">
                    {{ issue.reasonCode || '未标记原因' }}
                  </a-tag>
                  <a-tag size="small" :color="syncIssueCategoryColor(issue.reasonCode, issue.message)">
                    归因：{{ syncIssueCategoryLabel(issue.reasonCode, issue.message) }}
                  </a-tag>
                  <span class="text-[10px] text-slate-500 font-mono">{{ issue.id }}</span>
                  <div v-if="issue.status === 'open'" class="ml-auto flex gap-1">
                    <a-button size="mini" :loading="issueActionMutating[issue.id]" @click="handleSyncIssueAction(issue, 'resolve')">
                      标记已解决
                    </a-button>
                    <a-button size="mini" status="warning" :loading="issueActionMutating[issue.id]" @click="handleSyncIssueAction(issue, 'ignore')">
                      忽略
                    </a-button>
                  </div>
                </div>
                <p class="text-[10px] text-slate-700 m-0 break-all">
                  {{ issue.message }}
                </p>
                <p class="text-[10px] text-slate-600 m-0">
                  排查建议：{{ syncIssueSuggestion(issue.reasonCode, issue.message) }}
                </p>
                <p class="text-[10px] text-slate-500 m-0 break-all">
                  externalId={{ issue.externalId || '-' }} / recordId={{ issue.recordId || '-' }}
                </p>
              </div>
            </div>
            <a-empty v-else :description="currentItemLogItemDetail.issues.length ? '当前筛选下暂无问题单' : '暂无问题单'" />
          </section>
        </template>
      </div>
    </a-drawer>

    <a-drawer
      v-model:visible="mappingDrawerVisible"
      :title="currentItem ? `基础映射：${currentItem.name}` : '基础映射'"
      width="1040px"
      :footer="false"
      :mask-closable="!(savingItem || previewingItem || runningItem || simulatingRecord)"
      :closable="!(savingItem || previewingItem || runningItem || simulatingRecord)"
    >
      <div class="space-y-4">
        <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                字段概览
              </h3>
              <p class="text-[11px] text-slate-500 m-0 mt-1">
                系统会优先按字段名猜测映射关系；你只需要重点确认 externalId 和关联字段是否正确。政策要核对“会议编号”，人设要核对“对应竞赛 / 对象 / 至少一个人设槽位”。
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
          <div>
            <h3 class="text-[12px] text-slate-900 font-semibold m-0">
              字段边界
            </h3>
            <p class="text-[11px] text-slate-500 m-0 mt-1">
              这里只解释当前 entityType 的字段边界，不改变同步配置。contest.organizer 不从 Feishu contest 库写回；track.organizer 是支持字段；currentSeason 不作为 Feishu target。
            </p>
          </div>
          <div class="gap-3 grid lg:grid-cols-3">
            <div class="p-3 border border-slate-200 rounded space-y-2">
              <div class="flex gap-2 items-center justify-between">
                <h4 class="text-[11px] text-slate-900 font-semibold m-0">
                  当前实体支持
                </h4>
                <span class="text-[10px] text-slate-400">{{ schemaBoundarySupportedFields.length }} 项</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <a-tag
                  v-for="field in schemaBoundarySupportedFields"
                  :key="field.key"
                  size="small"
                  :color="field.required ? 'gold' : 'arcoblue'"
                >
                  {{ field.label }}{{ field.required ? ' · 重点' : '' }}
                </a-tag>
              </div>
            </div>

            <div class="p-3 border border-slate-200 rounded space-y-2">
              <div class="flex gap-2 items-center justify-between">
                <h4 class="text-[11px] text-slate-900 font-semibold m-0">
                  配置里不属于当前库
                </h4>
                <span class="text-[10px] text-slate-400">{{ unsupportedConfiguredMappingFields.length }} 项</span>
              </div>
              <div v-if="unsupportedConfiguredMappingFields.length" class="space-y-1.5">
                <div
                  v-for="field in unsupportedConfiguredMappingFields"
                  :key="field.key"
                  class="text-[11px] text-slate-700 px-2 py-1 border border-amber-200 rounded bg-amber-50"
                >
                  <div class="text-amber-800 font-medium">
                    {{ field.label }}
                  </div>
                  <div class="text-[10px] text-amber-700 break-all">
                    来源：{{ field.sourceText }}。可用“整理为当前实体模板”清理。
                  </div>
                </div>
              </div>
              <p v-else class="text-[11px] text-slate-500 m-0">
                当前 JSON / wizard 没有旧字段残留。
              </p>
            </div>

            <div class="p-3 border border-slate-200 rounded space-y-2">
              <div class="flex gap-2 items-center justify-between">
                <h4 class="text-[11px] text-slate-900 font-semibold m-0">
                  本地/发布保留
                </h4>
                <span class="text-[10px] text-slate-400">{{ localSchemaBoundaryFields.length }} 项</span>
              </div>
              <div v-if="localSchemaBoundaryFields.length" class="space-y-1.5">
                <div
                  v-for="field in localSchemaBoundaryFields"
                  :key="field.key"
                  class="text-[11px] text-slate-700 px-2 py-1 border border-slate-200 rounded"
                >
                  <div class="text-slate-900 font-medium">
                    {{ field.label }}
                  </div>
                  <div class="text-[10px] text-slate-500">
                    {{ field.description }}
                  </div>
                  <div v-if="field.matchedFields.length" class="text-[10px] text-sky-700 mt-1 break-all">
                    巡检命中：{{ field.matchedFields.join(' / ') }}
                  </div>
                </div>
              </div>
              <p v-else class="text-[11px] text-slate-500 m-0">
                当前实体没有额外的本地保留字段提示。
              </p>
            </div>
          </div>
        </section>

        <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                基础映射
              </h3>
              <p class="text-[11px] text-slate-500 m-0 mt-1">
                每个目标字段都可以单独配置来源列和 transform。`externalId` 是平台主键来源；赛道重点看 `contestExternalId / timelineText`；竞赛库重点看 `name / officialUrl / timelineText`；资料库重点看 `title / attachment`；政策库重点看 `externalId / meetingName / conferenceDate`；人设库重点看 `contestExternalId / object / persona1~5`。
              </p>
            </div>
            <div class="flex gap-2">
              <a-button size="mini" @click="normalizeCurrentEntityTemplate">
                整理为当前实体模板
              </a-button>
              <a-button size="mini" @click="rematchMissingMappingFields">
                重新匹配缺失字段
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
                <a-select v-model="binding.sourceField" size="small" allow-search allow-clear :popup-container="mappingSelectPopupContainer" placeholder="来源字段">
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
      :mask-closable="!(savingItem || previewingItem || runningItem || simulatingRecord)"
      :closable="!(savingItem || previewingItem || runningItem || simulatingRecord)"
    >
      <div class="space-y-4">
        <a-alert v-if="feedbackError" type="error" :show-icon="true">
          {{ feedbackError }}
        </a-alert>
        <a-alert v-else-if="writebackSaveSuccess" type="success" :show-icon="true">
          {{ writebackSaveSuccess }}
        </a-alert>

        <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
          <div class="flex gap-3 items-center justify-between">
            <div>
              <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                回填配置
              </h3>
              <p class="text-[11px] text-slate-500 m-0 mt-1">
                回填的是飞书列名，不是平台字段名。这里直接从当前子表字段里选择，建议至少配置状态、同步时间、错误摘要、平台实体 ID 和 runId。关闭只丢弃当前草稿，只有点击“保存配置”才会写入同步项配置。
              </p>
            </div>
            <a-button size="mini" :loading="loadingFieldInspection" :disabled="!canRefreshFieldInspection" @click="inspectFields">
              刷新字段
            </a-button>
          </div>
          <a-alert v-if="writebackStatusFieldRisk" type="warning" :show-icon="true">
            当前“同步状态回填字段”选成了“{{ savedAutoSyncState.recordStatusField || '记录状态' }}”。保存时会自动改写到“{{ effectiveWritebackStatusField || '同步信息' }}”，避免把“已同步”写入业务记录状态。
          </a-alert>
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
                :popup-container="writebackSelectPopupContainer"
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
              <p v-if="field.helper" class="text-[10px] text-slate-400 font-normal m-0 mt-1">
                {{ field.helper }}
              </p>
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
                  <a-textarea v-model="writebackDraftText" class="font-mono" :auto-size="{ minRows: 6, maxRows: 16 }" />
                </section>
              </div>
            </a-collapse-item>
          </a-collapse>
        </section>

        <div class="flex gap-2 justify-end">
          <a-button size="small" :disabled="savingItem" @click="closeWritebackDrawer">
            关闭（不保存）
          </a-button>
          <a-button size="small" type="primary" :loading="savingItem" :disabled="archivedReadonly" @click="saveCurrentItem('writeback')">
            保存配置
          </a-button>
        </div>
      </div>
    </a-drawer>

    <a-drawer
      v-model:visible="autoSyncDrawerVisible"
      :title="currentItem ? `自动同步规则：${currentItem.name}` : '自动同步规则'"
      width="860px"
      :footer="false"
      :mask-closable="!(savingItem || previewingItem || runningItem || simulatingRecord)"
      :closable="!(savingItem || previewingItem || runningItem || simulatingRecord)"
    >
      <div class="space-y-4">
        <a-alert v-if="feedbackError" type="error" :show-icon="true">
          {{ feedbackError }}
        </a-alert>
        <a-alert v-else-if="autoSyncSaveSuccess" type="success" :show-icon="true">
          {{ autoSyncSaveSuccess }}
        </a-alert>

        <section class="p-4 border border-slate-200 rounded bg-white space-y-3">
          <div class="flex flex-wrap gap-3 items-start justify-between">
            <div>
              <h3 class="text-[12px] text-slate-900 font-semibold m-0">
                自动同步规则
              </h3>
              <p class="text-[11px] text-slate-500 m-0 mt-1">
                只影响飞书事件触发链路。字段和值都可以直接从当前子表巡检结果里选择，避免手填出错。
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <a-button size="mini" :loading="loadingFieldInspection" :disabled="!canRefreshFieldInspection" @click="inspectFields">
                刷新字段
              </a-button>
              <a-button v-if="itemForm.entityType === 'contest'" size="mini" @click="applyContestAutoSyncPreset">
                套用竞赛库预设
              </a-button>
            </div>
          </div>
          <div class="text-[11px] text-slate-600 font-medium block">
            <div>启用自动同步</div>
            <div class="mt-2">
              <a-switch v-model="autoSyncForm.enabled" />
            </div>
          </div>
          <div class="gap-3 grid md:grid-cols-2">
            <label class="text-[11px] text-slate-600 font-medium block">
              记录状态字段
              <a-select
                v-model="autoSyncForm.recordStatusField"
                class="mt-1"
                size="small"
                allow-search
                allow-clear
                :popup-container="autoSyncSelectPopupContainer"
                placeholder="选择飞书字段"
              >
                <a-option
                  v-for="fieldName in selectableFieldNames(autoSyncForm.recordStatusField)"
                  :key="`auto-sync-record-status-${fieldName}`"
                  :value="fieldName"
                >
                  {{ fieldName }}
                </a-option>
              </a-select>
            </label>
            <label class="text-[11px] text-slate-600 font-medium block">
              同步信息字段
              <a-select
                v-model="autoSyncForm.syncStatusField"
                class="mt-1"
                size="small"
                allow-search
                allow-clear
                :popup-container="autoSyncSelectPopupContainer"
                placeholder="选择飞书字段"
              >
                <a-option
                  v-for="fieldName in selectableFieldNames(autoSyncForm.syncStatusField)"
                  :key="`auto-sync-sync-status-${fieldName}`"
                  :value="fieldName"
                >
                  {{ fieldName }}
                </a-option>
              </a-select>
            </label>
            <label class="text-[11px] text-slate-600 font-medium block">
              完成状态值
              <a-select
                v-model="autoSyncCompletedValues"
                class="mt-1"
                size="small"
                multiple
                allow-search
                allow-clear
                :popup-container="autoSyncSelectPopupContainer"
                placeholder="从记录状态样本值里选择"
              >
                <a-option
                  v-for="value in selectableFieldSampleValues(autoSyncForm.recordStatusField, autoSyncCompletedValues)"
                  :key="`auto-sync-completed-${value}`"
                  :value="value"
                >
                  {{ value }}
                </a-option>
              </a-select>
            </label>
            <label class="text-[11px] text-slate-600 font-medium block">
              待同步值
              <a-select
                v-model="autoSyncPendingValues"
                class="mt-1"
                size="small"
                multiple
                allow-search
                allow-clear
                :popup-container="autoSyncSelectPopupContainer"
                placeholder="从同步信息样本值里选择"
              >
                <a-option
                  v-for="value in selectableFieldSampleValues(autoSyncForm.syncStatusField, autoSyncPendingValues)"
                  :key="`auto-sync-pending-${value}`"
                  :value="value"
                >
                  {{ value }}
                </a-option>
              </a-select>
            </label>
            <label class="text-[11px] text-slate-600 font-medium block">
              已同步值
              <a-select
                v-model="autoSyncSyncedValues"
                class="mt-1"
                size="small"
                multiple
                allow-search
                allow-clear
                :popup-container="autoSyncSelectPopupContainer"
                placeholder="从同步信息样本值里选择"
              >
                <a-option
                  v-for="value in selectableFieldSampleValues(autoSyncForm.syncStatusField, autoSyncSyncedValues)"
                  :key="`auto-sync-synced-${value}`"
                  :value="value"
                >
                  {{ value }}
                </a-option>
              </a-select>
            </label>
            <label class="text-[11px] text-slate-600 font-medium block">
              变更后记录状态
              <a-select
                v-model="autoSyncForm.resetRecordStatusValue"
                class="mt-1"
                size="small"
                allow-search
                allow-clear
                :popup-container="autoSyncSelectPopupContainer"
                placeholder="从记录状态样本值里选择"
              >
                <a-option
                  v-for="value in selectableFieldSampleValues(autoSyncForm.recordStatusField, autoSyncForm.resetRecordStatusValue)"
                  :key="`auto-sync-reset-record-${value}`"
                  :value="value"
                >
                  {{ value }}
                </a-option>
              </a-select>
            </label>
            <label class="text-[11px] text-slate-600 font-medium block">
              变更后同步状态
              <a-select
                v-model="autoSyncForm.resetSyncStatusValue"
                class="mt-1"
                size="small"
                allow-search
                allow-clear
                :popup-container="autoSyncSelectPopupContainer"
                placeholder="从同步信息样本值里选择"
              >
                <a-option
                  v-for="value in selectableFieldSampleValues(autoSyncForm.syncStatusField, autoSyncForm.resetSyncStatusValue)"
                  :key="`auto-sync-reset-sync-${value}`"
                  :value="value"
                >
                  {{ value }}
                </a-option>
              </a-select>
            </label>
            <div class="text-[11px] text-slate-600 font-medium block">
              <div>使用当前映射字段作为监听范围</div>
              <div class="mt-2">
                <a-switch v-model="autoSyncForm.useMappedFieldsAsWatched" />
              </div>
            </div>
            <label class="text-[11px] text-slate-600 font-medium block md:col-span-2">
              额外监听字段
              <a-select
                v-model="autoSyncWatchedFields"
                class="mt-1"
                size="small"
                multiple
                allow-search
                allow-clear
                :popup-container="autoSyncSelectPopupContainer"
                placeholder="选择飞书字段；这些字段变更也会被当作业务变化"
              >
                <a-option
                  v-for="fieldName in selectableFieldNames(autoSyncWatchedFields)"
                  :key="`auto-sync-watched-${fieldName}`"
                  :value="fieldName"
                >
                  {{ fieldName }}
                </a-option>
              </a-select>
            </label>
            <label class="text-[11px] text-slate-600 font-medium block md:col-span-2">
              忽略字段
              <a-select
                v-model="autoSyncIgnoredFields"
                class="mt-1"
                size="small"
                multiple
                allow-search
                allow-clear
                :popup-container="autoSyncSelectPopupContainer"
                placeholder="选择飞书字段；这些字段变化不会触发重置"
              >
                <a-option
                  v-for="fieldName in selectableFieldNames(autoSyncIgnoredFields)"
                  :key="`auto-sync-ignored-${fieldName}`"
                  :value="fieldName"
                >
                  {{ fieldName }}
                </a-option>
              </a-select>
            </label>
          </div>
          <p v-if="!fieldInspection.length" class="text-[10px] text-slate-400 m-0">
            还没有可选字段时，请先在主 Drawer 的“来源”里选择子表/视图，然后点上面的“刷新字段”。
          </p>
          <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-slate-50 space-y-1">
            <p class="text-slate-900 font-medium m-0">
              当前规则说明
            </p>
            <p class="m-0">
              已完成 + 未同步 => 自动同步
            </p>
            <p class="m-0">
              已完成 + 已同步 且业务字段变更 => 重置为 {{ autoSyncForm.resetRecordStatusValue || '撰写中' }} + {{ autoSyncForm.resetSyncStatusValue || '未同步' }}
            </p>
            <p class="text-slate-500 m-0">
              业务字段 = 当前映射字段 {{ autoSyncForm.useMappedFieldsAsWatched ? '+ 额外监听字段' : '（未自动纳入映射字段）' }}，并排除状态字段、回填字段和忽略字段。
            </p>
            <p class="text-slate-500 m-0">
              如果同步成功后需要自动写成“已同步”，请把回填配置里的状态字段指向 {{ autoSyncForm.syncStatusField || '同步信息' }}，成功值设成 {{ autoSyncSyncedValues[0] || '已同步' }}。
            </p>
          </div>
        </section>

        <section class="p-4 border border-slate-200 rounded bg-white">
          <a-collapse :default-active-key="[]" :bordered="false" expand-icon-position="right">
            <a-collapse-item key="auto-sync-json" header="高级 JSON 模式（自动同步兜底）">
              <div class="pt-2 space-y-4">
                <p class="text-[11px] text-slate-500 m-0">
                  默认请优先用上面的表单。只有在需要细调监听字段或批量改值时，再直接改 JSON。
                </p>
                <section class="space-y-2">
                  <div class="flex items-center justify-between">
                    <h4 class="text-[12px] text-slate-900 font-semibold m-0">
                      自动同步配置 JSON
                    </h4>
                    <div class="flex gap-2">
                      <a-button size="mini" @click="loadAutoSyncFormFromJson()">
                        从 JSON 回读
                      </a-button>
                      <a-button size="mini" @click="syncAutoSyncFormToJson(true)">
                        同步到 JSON
                      </a-button>
                    </div>
                  </div>
                  <a-textarea v-model="autoSyncDraftText" class="font-mono" :auto-size="{ minRows: 6, maxRows: 16 }" />
                </section>
              </div>
            </a-collapse-item>
          </a-collapse>
        </section>

        <div class="flex gap-2 justify-end">
          <a-button size="small" :disabled="savingItem" @click="autoSyncDrawerVisible = false">
            关闭
          </a-button>
          <a-button size="small" type="primary" :loading="savingItem" :disabled="archivedReadonly" @click="saveCurrentItem('autoSync')">
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
          新建后会自动带入当前实体类型的推荐模板：映射骨架、同步选项、自动同步规则和回填配置都会先帮你铺好。
        </a-alert>
        <div class="text-[11px] text-slate-600 p-3 border border-slate-200 rounded bg-slate-50">
          <p class="text-slate-900 font-medium m-0">
            推荐模板说明
          </p>
          <p class="m-0 mt-1">
            `contest` 默认关注 `externalId + 名称/官网/简介`；`track` 额外带 `contestExternalId`；`resource` 会再补 `trackExternalId` 和资料默认值；`policy` 重点确认 `会议编号 + 会议名称`；`persona` 重点确认 `对应竞赛 + 对象 + 至少一个人设槽位`。
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
          <div class="mt-1 flex flex-wrap gap-2">
            <button
              v-for="option in newItemEntityTypeOptions"
              :key="`new-item-entity-${option.value}`"
              type="button"
              class="text-[11px] px-3 py-1.5 border transition-colors"
              :class="newItemForm.entityType === option.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
              :aria-pressed="newItemForm.entityType === option.value"
              @click="newItemForm.entityType = option.value"
            >
              {{ option.label }}
            </button>
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
          <a-select
            v-model="newItemForm.tableId"
            class="mt-1"
            size="small"
            allow-search
            :popup-container="selectPopupContainer"
            placeholder="选择子表"
            @change="handleNewItemTableChange"
          >
            <a-option v-for="item in availableTables" :key="item.tableId" :value="item.tableId">
              {{ item.name }} ({{ item.tableId }})
            </a-option>
          </a-select>
        </label>
        <label class="text-[11px] text-slate-600 font-medium block">
          视图 viewId（可选）
          <a-select
            v-model="newItemForm.viewId"
            class="mt-1"
            size="small"
            allow-search
            :popup-container="selectPopupContainer"
            placeholder="选择视图（可选）"
            @change="handleNewItemViewChange"
          >
            <a-option value="">
              全部视图（不限制）
            </a-option>
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

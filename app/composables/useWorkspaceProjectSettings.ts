import type { ComputedRef, Ref } from 'vue'
import type {
  ApiResponse,
  ProjectSettingsDraft,
  ProjectSettingsDraftDevicePayload,
  ProjectSettingsDraftPayload,
  ProjectSettingsDraftUi,
  ProjectSettingsSnapshot,
  ProjectWorkspaceViewPreference,
  ProjectWorkspaceViewState,
  WorkspaceDisplayPreferenceSnapshot,
} from '~~/shared/types/domain'
import type {
  WorkspaceProjectAdaptationForm,
  WorkspaceProjectCommonForm,
  WorkspaceProjectContestBindingForm,
  WorkspaceProjectSaveState,
} from '~/types/workspace'
import { Message } from '@arco-design/web-vue'
import { reactive, ref } from 'vue'
import {
  buildProjectSettingsCommonPatch,
  cloneProjectCommonForm,
  createEmptyProjectCommonForm,
} from '~/composables/project-settings'
import { useApiEndpoint } from '~/composables/useApiEndpoint'
import { defaultWorkspaceDisplayPreferenceSnapshot } from '~/composables/useWorkspaceDisplayPreferences'
import { normalizeProjectWorkspaceViewState, sanitizeProjectWorkspaceViewState } from '~/composables/useWorkspaceProjectShell'
import {
  cloneProjectAdaptationForm,
  cloneProjectContestBindings,
  createEmptyProjectAdaptationForm,
  resolveApiErrorMessage,
  resolveApiStatusCode,
} from '~/utils/workspace-project-helpers'

export type WorkspaceProjectSettingsDraftCache = ProjectSettingsDraftPayload

interface UseWorkspaceProjectSettingsStorageOptions {
  currentUserId: Ref<string> | ComputedRef<string>
  workspaceDeviceId: Ref<string>
  projectSettingsDraftServerRevision: Ref<number | null>
  normalizeDraftCachePayload: (input: unknown) => WorkspaceProjectSettingsDraftCache | null
}

interface ProjectSettingsDraftHydrationResult {
  bundle: ProjectSettingsDraftDevicePayload | null
  localDraft: WorkspaceProjectSettingsDraftCache | null
  currentDraft: WorkspaceProjectSettingsDraftCache | null
  latestOtherDraft: WorkspaceProjectSettingsDraftCache | null
  appliedDraft: WorkspaceProjectSettingsDraftCache | null
  source: 'local' | 'current' | 'latest_other' | ''
}

interface HydratedWorkspaceViewStateResult {
  bundle: {
    current?: ProjectWorkspaceViewPreference | null
    latestOther?: ProjectWorkspaceViewPreference | null
    resolution: {
      isNewDevice: boolean
      isStaleDevice: boolean
    }
  } | null
  hasManagedQuery: boolean
}

interface UseWorkspaceProjectSettingsDraftBehaviorOptions {
  activeProjectId: Ref<string> | ComputedRef<string>
  selectedContestId: Ref<string>
  selectedTrackId: Ref<string>
  leftSidebarCollapsed: Ref<boolean>
  rightSidebarUserCollapsed: Ref<boolean>
  projectSettingsHydrating: Ref<boolean>
  projectSettingsLoading: Ref<boolean>
  projectSettingsSaveState: Ref<WorkspaceProjectSaveState>
  projectSettingsCommon: WorkspaceProjectCommonForm
  projectSettingsBindings: Ref<WorkspaceProjectContestBindingForm[]>
  projectSettingsCurrentContestId: Ref<string>
  projectSettingsAdaptation: WorkspaceProjectAdaptationForm
  projectSettingsAdaptationDrafts: Ref<Record<string, WorkspaceProjectAdaptationForm>>
  projectSettingsCommonDirty: Ref<boolean>
  projectSettingsBindingsDirty: Ref<boolean>
  projectSettingsDirtyAdaptationContestIds: Ref<string[]>
  projectSettingsDraftServerRevision: Ref<number | null>
  readProjectSettingsDraftCache: (projectId: string) => WorkspaceProjectSettingsDraftCache | null
  writeProjectSettingsDraftCache: (projectId: string, payload: WorkspaceProjectSettingsDraftCache) => boolean
  clearProjectSettingsDraftCache: (projectId: string) => void
  ensureWorkspaceDeviceId: () => string
  resetProjectSettingsDraftServerState: () => void
  applySidebarLayoutState: (payload: ProjectSettingsDraftUi | null | undefined) => void
  ensureProjectSettingsCurrentContest: (preferredContestId?: string) => string
  normalizeProjectSettingsBindings: (value: WorkspaceProjectContestBindingForm[]) => WorkspaceProjectContestBindingForm[]
  syncProjectSettingsAdaptationFormByContest: (contestId: string) => void
  applyProjectSettingsSnapshot: (snapshot: ProjectSettingsSnapshot, preferredContestId?: string) => void
  resetProjectSettingsState: (project: unknown) => void
  buildProjectSettingsAdaptationPatch: (draft: WorkspaceProjectAdaptationForm) => Record<string, unknown>
  clearProjectSettingsAdaptationDirty: (contestId: string) => void
  isProjectSettingsAdaptationDirty: (contestId: string) => boolean
  projectSettingsBindingMap: ComputedRef<Map<string, WorkspaceProjectContestBindingForm>>
  resources: Ref<Array<{ id: string }>> | ComputedRef<Array<{ id: string }>>
  askDeviceRestoreConfirm: (title: string, content: string) => Promise<'sync' | 'keep'>
  applyProjectWorkspaceViewState: (state: ProjectWorkspaceViewState) => void
  syncProjectWorkspaceViewState: () => Promise<void>
  openProjectResourcePreview: (resourceId: string, options?: { openTab?: boolean }) => Promise<void> | void
  statusLine: Ref<string>
  activeProject: Ref<unknown>
}

const PROJECT_SETTINGS_DRAFT_PREFIX = 'workspace.projectSettingsDraft'
const PROJECT_SETTINGS_DRAFT_DEVICE_PREFIX = 'workspace.projectSettingsDraftDevice'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function generateWorkspaceDeviceId(): string {
  if (import.meta.client && typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()
  return `draft-device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function serializeProjectSettingsDraftCachePayload(payload: WorkspaceProjectSettingsDraftCache): string {
  const adaptationEntries = Object.keys(payload.adaptationDrafts || {})
    .sort((left, right) => left.localeCompare(right))
    .map((contestId) => {
      const item = payload.adaptationDrafts[contestId]
      if (!item) {
        return [
          contestId,
          createEmptyProjectAdaptationForm(contestId, ''),
        ] as const
      }
      return [
        contestId,
        {
          contestId: item.contestId,
          trackId: item.trackId,
          problemStatement: item.problemStatement,
          innovationPointsText: item.innovationPointsText,
          techRouteStepsText: item.techRouteStepsText,
          scoringMappingText: item.scoringMappingText,
          risksText: item.risksText,
          deliverablesText: item.deliverablesText,
          summary: item.summary,
        },
      ]
    })

  const comparable = {
    common: payload.common,
    bindings: [...payload.bindings].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder)
        return left.sortOrder - right.sortOrder
      return left.contestId.localeCompare(right.contestId)
    }),
    currentContestId: payload.currentContestId,
    adaptationDrafts: Object.fromEntries(adaptationEntries),
    ui: {
      leftSidebarCollapsed: Boolean(payload.ui?.leftSidebarCollapsed),
      rightSidebarCollapsed: Boolean(payload.ui?.rightSidebarCollapsed),
    },
  }

  return JSON.stringify(comparable)
}

function isProjectSettingsDraftCacheEqual(
  left: WorkspaceProjectSettingsDraftCache,
  right: WorkspaceProjectSettingsDraftCache,
): boolean {
  return serializeProjectSettingsDraftCachePayload(left) === serializeProjectSettingsDraftCachePayload(right)
}

export function useWorkspaceProjectSettings() {
  const projectSettingsLoading = ref(false)
  const projectSettingsSaveState = ref<WorkspaceProjectSaveState>('idle')
  const workspaceDisplayPreferenceSnapshot = ref<WorkspaceDisplayPreferenceSnapshot>(defaultWorkspaceDisplayPreferenceSnapshot())
  const workspaceDisplayPreferenceLoading = ref(false)
  const workspaceDisplayPreferenceSavingScope = ref<'' | 'user' | 'team'>('')
  const workspaceDisplayPreferenceError = ref('')

  const projectSettingsCommon = reactive<WorkspaceProjectCommonForm>(createEmptyProjectCommonForm())
  const projectSettingsBindings = ref<WorkspaceProjectContestBindingForm[]>([])
  const projectSettingsCurrentContestId = ref('')
  const projectSettingsAdaptation = reactive<WorkspaceProjectAdaptationForm>(createEmptyProjectAdaptationForm())
  const projectSettingsAdaptationDrafts = ref<Record<string, WorkspaceProjectAdaptationForm>>({})
  const projectSettingsHydrating = ref(false)
  const projectSettingsCommonDirty = ref(false)
  const projectSettingsBindingsDirty = ref(false)
  const projectSettingsDirtyAdaptationContestIds = ref<string[]>([])
  const projectSettingsDraftServerRevision = ref<number | null>(null)
  const workspaceDeviceId = ref('')

  return {
    projectSettingsLoading,
    projectSettingsSaveState,
    workspaceDisplayPreferenceSnapshot,
    workspaceDisplayPreferenceLoading,
    workspaceDisplayPreferenceSavingScope,
    workspaceDisplayPreferenceError,
    projectSettingsCommon,
    projectSettingsBindings,
    projectSettingsCurrentContestId,
    projectSettingsAdaptation,
    projectSettingsAdaptationDrafts,
    projectSettingsHydrating,
    projectSettingsCommonDirty,
    projectSettingsBindingsDirty,
    projectSettingsDirtyAdaptationContestIds,
    projectSettingsDraftServerRevision,
    workspaceDeviceId,
  }
}

export function useWorkspaceProjectSettingsStorage(options: UseWorkspaceProjectSettingsStorageOptions) {
  function getProjectSettingsDraftStorageKey(projectId: string): string {
    if (!import.meta.client)
      return ''
    const normalizedProjectId = normalizeString(projectId)
    const userId = normalizeString(options.currentUserId.value)
    const deviceId = ensureWorkspaceDeviceId()
    if (!normalizedProjectId || !userId || !deviceId)
      return ''
    return `${PROJECT_SETTINGS_DRAFT_PREFIX}.${userId}.${deviceId}.${normalizedProjectId}`
  }

  function getLegacyProjectSettingsDraftStorageKey(projectId: string): string {
    if (!import.meta.client)
      return ''
    const normalizedProjectId = normalizeString(projectId)
    const userId = normalizeString(options.currentUserId.value)
    if (!normalizedProjectId || !userId)
      return ''
    return `${PROJECT_SETTINGS_DRAFT_PREFIX}.${userId}.${normalizedProjectId}`
  }

  function getWorkspaceDeviceStorageKey(): string {
    if (!import.meta.client)
      return ''
    const userId = normalizeString(options.currentUserId.value)
    if (!userId)
      return ''
    return `${PROJECT_SETTINGS_DRAFT_DEVICE_PREFIX}.${userId}`
  }

  function ensureWorkspaceDeviceId(): string {
    if (!import.meta.client)
      return ''
    if (options.workspaceDeviceId.value)
      return options.workspaceDeviceId.value

    const key = getWorkspaceDeviceStorageKey()
    if (!key)
      return ''

    try {
      const cached = normalizeString(localStorage.getItem(key))
      if (cached) {
        options.workspaceDeviceId.value = cached
        return cached
      }

      const created = generateWorkspaceDeviceId()
      localStorage.setItem(key, created)
      options.workspaceDeviceId.value = created
      return created
    }
    catch {
      const fallback = generateWorkspaceDeviceId()
      options.workspaceDeviceId.value = fallback
      return fallback
    }
  }

  function resetProjectSettingsDraftServerState(): void {
    options.projectSettingsDraftServerRevision.value = null
  }

  function readProjectSettingsDraftCache(projectId: string): WorkspaceProjectSettingsDraftCache | null {
    const key = getProjectSettingsDraftStorageKey(projectId)
    if (!key)
      return null

    try {
      const raw = localStorage.getItem(key)
      if (!raw) {
        const legacyKey = getLegacyProjectSettingsDraftStorageKey(projectId)
        const legacyRaw = legacyKey ? localStorage.getItem(legacyKey) : ''
        if (!legacyRaw)
          return null

        const legacyParsed = JSON.parse(legacyRaw) as unknown
        const legacyNormalized = options.normalizeDraftCachePayload(legacyParsed)
        if (!legacyNormalized)
          return null

        localStorage.setItem(key, JSON.stringify(legacyNormalized))
        localStorage.removeItem(legacyKey)
        return legacyNormalized
      }

      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object')
        return null

      return options.normalizeDraftCachePayload(parsed)
    }
    catch {
      return null
    }
  }

  function writeProjectSettingsDraftCache(projectId: string, payload: WorkspaceProjectSettingsDraftCache): boolean {
    const key = getProjectSettingsDraftStorageKey(projectId)
    if (!key)
      return false

    try {
      const normalized = options.normalizeDraftCachePayload(payload)
      if (!normalized)
        return false
      localStorage.setItem(key, JSON.stringify(normalized))
      return true
    }
    catch {
      return false
    }
  }

  function clearProjectSettingsDraftCache(projectId: string): void {
    const key = getProjectSettingsDraftStorageKey(projectId)
    const legacyKey = getLegacyProjectSettingsDraftStorageKey(projectId)
    if (!key && !legacyKey)
      return

    try {
      if (key)
        localStorage.removeItem(key)
      if (legacyKey)
        localStorage.removeItem(legacyKey)
    }
    catch {
      // ignore local cache cleanup errors
    }
  }

  return {
    ensureWorkspaceDeviceId,
    resetProjectSettingsDraftServerState,
    readProjectSettingsDraftCache,
    writeProjectSettingsDraftCache,
    clearProjectSettingsDraftCache,
  }
}

export function useWorkspaceProjectSettingsDraftBehavior(options: UseWorkspaceProjectSettingsDraftBehaviorOptions) {
  const { endpoint } = useApiEndpoint()
  let projectSettingsDraftTimer: ReturnType<typeof setTimeout> | null = null
  let projectSettingsDraftPersistSeq = 0

  function normalizeProjectSettingsDraftCachePayload(input: unknown): WorkspaceProjectSettingsDraftCache | null {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return null

    const source = input as Record<string, unknown>
    const normalizeDraftBoolean = (value: unknown): boolean => {
      if (typeof value === 'boolean')
        return value
      if (typeof value === 'number')
        return value !== 0
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        return normalized === '1' || normalized === 'true' || normalized === 'yes'
      }
      return false
    }
    const normalizeUi = (value: unknown): ProjectSettingsDraftUi => {
      const uiSource = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {}
      return {
        leftSidebarCollapsed: normalizeDraftBoolean(uiSource.leftSidebarCollapsed),
        rightSidebarCollapsed: normalizeDraftBoolean(uiSource.rightSidebarCollapsed),
      }
    }
    const normalizedBindings = options.normalizeProjectSettingsBindings(Array.isArray(source.bindings)
      ? source.bindings as WorkspaceProjectContestBindingForm[]
      : [])
    const allowedContestIds = new Set(normalizedBindings.map(item => item.contestId))
    const adaptationDrafts: Record<string, WorkspaceProjectAdaptationForm> = {}
    const adaptationSource = source.adaptationDrafts && typeof source.adaptationDrafts === 'object' && !Array.isArray(source.adaptationDrafts)
      ? source.adaptationDrafts as Record<string, unknown>
      : {}

    for (const [contestId, rawValue] of Object.entries(adaptationSource)) {
      const normalizedContestId = normalizeString(contestId)
      if (!normalizedContestId || !allowedContestIds.has(normalizedContestId))
        continue

      const record = rawValue && typeof rawValue === 'object'
        ? rawValue as Record<string, unknown>
        : {}
      const binding = normalizedBindings.find(item => item.contestId === normalizedContestId)
      adaptationDrafts[normalizedContestId] = cloneProjectAdaptationForm({
        contestId: normalizedContestId,
        trackId: binding?.trackId || normalizeString(record.trackId),
        problemStatement: String(record.problemStatement || ''),
        innovationPointsText: String(record.innovationPointsText || ''),
        techRouteStepsText: String(record.techRouteStepsText || ''),
        scoringMappingText: String(record.scoringMappingText || ''),
        risksText: String(record.risksText || ''),
        deliverablesText: String(record.deliverablesText || ''),
        summary: String(record.summary || ''),
      })
    }

    const commonSource = source.common && typeof source.common === 'object' && !Array.isArray(source.common)
      ? source.common as Record<string, unknown>
      : {}
    const currentContestIdRaw = normalizeString(source.currentContestId)
    const currentContestId = currentContestIdRaw && allowedContestIds.has(currentContestIdRaw)
      ? currentContestIdRaw
      : (normalizedBindings[0]?.contestId || '')

    return {
      updatedAt: normalizeString(source.updatedAt) || new Date().toISOString(),
      deviceId: normalizeString(source.deviceId) || undefined,
      common: {
        title: String(commonSource.title || ''),
        summary: String(commonSource.summary || ''),
        icon: String(commonSource.icon || ''),
        accentColor: String(commonSource.accentColor || ''),
        problemStatement: String(commonSource.problemStatement || ''),
        innovationPointsText: String(commonSource.innovationPointsText || ''),
        techRouteStepsText: String(commonSource.techRouteStepsText || ''),
        scoringMappingText: String(commonSource.scoringMappingText || ''),
        risksText: String(commonSource.risksText || ''),
        deliverablesText: String(commonSource.deliverablesText || ''),
      },
      bindings: normalizedBindings,
      currentContestId,
      adaptationDrafts,
      ui: normalizeUi(source.ui),
    }
  }

  function buildProjectSettingsDraftCachePayload(): WorkspaceProjectSettingsDraftCache {
    const currentContestId = normalizeString(options.projectSettingsCurrentContestId.value || options.selectedContestId.value)
    const nextAdaptationDrafts = { ...options.projectSettingsAdaptationDrafts.value }
    if (currentContestId) {
      nextAdaptationDrafts[currentContestId] = cloneProjectAdaptationForm({
        ...options.projectSettingsAdaptation,
        contestId: currentContestId,
        trackId: options.projectSettingsBindingMap.value.get(currentContestId)?.trackId || options.projectSettingsAdaptation.trackId,
      })
    }

    return {
      updatedAt: new Date().toISOString(),
      deviceId: options.ensureWorkspaceDeviceId() || undefined,
      common: cloneProjectCommonForm(options.projectSettingsCommon),
      bindings: cloneProjectContestBindings(options.projectSettingsBindings.value),
      currentContestId,
      adaptationDrafts: nextAdaptationDrafts,
      ui: {
        leftSidebarCollapsed: options.leftSidebarCollapsed.value,
        rightSidebarCollapsed: options.rightSidebarUserCollapsed.value,
      },
    }
  }

  function applyProjectSettingsDraftCachePayload(
    payload: WorkspaceProjectSettingsDraftCache,
    saveState: WorkspaceProjectSaveState,
  ): boolean {
    const draft = normalizeProjectSettingsDraftCachePayload(payload)
    if (!draft)
      return false

    const hasCommonDraft = Object.values(draft.common).some(value => normalizeString(value).length > 0)
    const normalizedBindings = options.normalizeProjectSettingsBindings(Array.isArray(draft.bindings) ? draft.bindings : [])
    const allowedContestIds = new Set(normalizedBindings.map(item => item.contestId))
    const nextAdaptationDrafts: Record<string, WorkspaceProjectAdaptationForm> = {}

    for (const [contestId, form] of Object.entries(draft.adaptationDrafts || {})) {
      if (!allowedContestIds.has(contestId))
        continue
      const binding = normalizedBindings.find(item => item.contestId === contestId)
      nextAdaptationDrafts[contestId] = cloneProjectAdaptationForm({
        contestId,
        trackId: binding?.trackId || form.trackId,
        problemStatement: String(form.problemStatement || ''),
        innovationPointsText: String(form.innovationPointsText || ''),
        techRouteStepsText: String(form.techRouteStepsText || ''),
        scoringMappingText: String(form.scoringMappingText || ''),
        risksText: String(form.risksText || ''),
        deliverablesText: String(form.deliverablesText || ''),
        summary: String(form.summary || ''),
      })
    }

    options.applySidebarLayoutState(draft.ui)
    const hasLayoutDraft = Boolean(draft.ui?.leftSidebarCollapsed || draft.ui?.rightSidebarCollapsed)
    const hasDraftContent = hasCommonDraft || normalizedBindings.length > 0 || Object.keys(nextAdaptationDrafts).length > 0 || hasLayoutDraft
    if (!hasDraftContent)
      return false

    options.projectSettingsHydrating.value = true
    try {
      Object.assign(options.projectSettingsCommon, createEmptyProjectCommonForm(), draft.common || {})

      if (normalizedBindings.length > 0)
        options.projectSettingsBindings.value = normalizedBindings

      options.projectSettingsAdaptationDrafts.value = nextAdaptationDrafts

      const preferredContestId = normalizeString(draft.currentContestId)
      const nextContestId = options.ensureProjectSettingsCurrentContest(preferredContestId)
      if (nextContestId)
        options.selectedContestId.value = nextContestId

      const selectedBinding = options.projectSettingsBindingMap.value.get(nextContestId)
      if (selectedBinding)
        options.selectedTrackId.value = selectedBinding.trackId

      options.syncProjectSettingsAdaptationFormByContest(nextContestId)

      options.projectSettingsCommonDirty.value = hasCommonDraft
      options.projectSettingsBindingsDirty.value = normalizedBindings.length > 0
      options.projectSettingsDirtyAdaptationContestIds.value = Object.keys(nextAdaptationDrafts)
      options.projectSettingsSaveState.value = saveState
    }
    finally {
      options.projectSettingsHydrating.value = false
    }
    return true
  }

  function normalizeProjectSettingsDraftServerRecord(
    record: ProjectSettingsDraft | null,
    payload: { updateServerState?: boolean } = {},
  ): WorkspaceProjectSettingsDraftCache | null {
    if (!record) {
      if (payload.updateServerState)
        options.resetProjectSettingsDraftServerState()
      return null
    }

    if (payload.updateServerState)
      options.projectSettingsDraftServerRevision.value = Number(record.revision || 0) || null

    const normalized = normalizeProjectSettingsDraftCachePayload(record.payload)
    if (!normalized)
      return null

    return {
      ...normalized,
      updatedAt: normalized.updatedAt || String(record.updatedAt || ''),
      deviceId: normalized.deviceId || String(record.deviceId || ''),
    }
  }

  async function fetchProjectSettingsDraftFromServer(projectId: string): Promise<ProjectSettingsDraftDevicePayload | null> {
    const deviceId = options.ensureWorkspaceDeviceId()
    if (!projectId || !deviceId)
      return null

    const response = await unsafeFetch<ApiResponse<ProjectSettingsDraftDevicePayload>>(
      endpoint(`/projects/${projectId}/settings-draft`),
      {
        query: {
          deviceId,
        },
      },
    )
    const bundle = response.data || null
    normalizeProjectSettingsDraftServerRecord(bundle?.current || null, { updateServerState: true })
    return bundle
  }

  function pickProjectSettingsDraftForHydration(
    localDraft: WorkspaceProjectSettingsDraftCache | null,
    bundle: ProjectSettingsDraftDevicePayload | null,
  ): ProjectSettingsDraftHydrationResult {
    const currentDraft = normalizeProjectSettingsDraftServerRecord(bundle?.current || null, { updateServerState: true })
    const latestOtherDraft = normalizeProjectSettingsDraftServerRecord(bundle?.latestOther || null)
    const currentDeviceDraft = localDraft || currentDraft

    if (currentDeviceDraft) {
      return {
        bundle,
        localDraft,
        currentDraft,
        latestOtherDraft,
        appliedDraft: currentDeviceDraft,
        source: localDraft ? 'local' : 'current',
      }
    }

    if (bundle?.resolution.isNewDevice && latestOtherDraft) {
      return {
        bundle,
        localDraft,
        currentDraft,
        latestOtherDraft,
        appliedDraft: latestOtherDraft,
        source: 'latest_other',
      }
    }

    return {
      bundle,
      localDraft,
      currentDraft,
      latestOtherDraft,
      appliedDraft: null,
      source: '',
    }
  }

  async function refreshProjectSettingsDraftServerRevision(projectId: string): Promise<void> {
    try {
      await fetchProjectSettingsDraftFromServer(projectId)
    }
    catch {
      // ignore refresh failures
    }
  }

  async function persistProjectSettingsDraftToServer(
    projectId: string,
    payload: WorkspaceProjectSettingsDraftCache,
    persistSeq: number,
  ): Promise<'success' | 'conflict' | 'error' | 'stale'> {
    const expectedRevision = options.projectSettingsDraftServerRevision.value
    const deviceId = options.ensureWorkspaceDeviceId()
    const requestPayload: WorkspaceProjectSettingsDraftCache = {
      ...payload,
      deviceId: payload.deviceId || deviceId || undefined,
    }

    try {
      const response = await unsafeFetch<ApiResponse<ProjectSettingsDraft>>(
        endpoint(`/projects/${projectId}/settings-draft`),
        {
          method: 'PATCH',
          body: {
            payload: requestPayload,
            expectedRevision,
            deviceId,
          },
        },
      )

      if (options.activeProjectId.value !== projectId || persistSeq !== projectSettingsDraftPersistSeq)
        return 'stale'

      normalizeProjectSettingsDraftServerRecord(response.data, { updateServerState: true })
      return 'success'
    }
    catch (error) {
      if (options.activeProjectId.value !== projectId || persistSeq !== projectSettingsDraftPersistSeq)
        return 'stale'

      if (resolveApiStatusCode(error) === 409) {
        await refreshProjectSettingsDraftServerRevision(projectId)
        if (options.activeProjectId.value === projectId && persistSeq === projectSettingsDraftPersistSeq) {
          options.projectSettingsSaveState.value = 'conflict'
          options.statusLine.value = '检测到多设备草稿冲突，已保留本地编辑。请再次保存或刷新后处理。'
        }
        return 'conflict'
      }

      return 'error'
    }
  }

  async function persistResolvedProjectSettingsDraft(
    projectId: string,
    payload: WorkspaceProjectSettingsDraftCache,
    config: { silent?: boolean } = {},
  ): Promise<void> {
    const normalizedPayload = normalizeProjectSettingsDraftCachePayload(payload)
    if (!normalizedPayload)
      return

    const persistSeq = ++projectSettingsDraftPersistSeq
    const localSuccess = options.writeProjectSettingsDraftCache(projectId, normalizedPayload)
    const serverResult = await persistProjectSettingsDraftToServer(projectId, normalizedPayload, persistSeq)

    if (options.activeProjectId.value !== projectId || persistSeq !== projectSettingsDraftPersistSeq)
      return

    if (serverResult === 'conflict')
      return

    if (!localSuccess && serverResult !== 'success') {
      options.projectSettingsSaveState.value = 'error'
      if (!config.silent)
        options.statusLine.value = '草稿缓存失败（可重试）'
      return
    }

    options.projectSettingsSaveState.value = 'saved_auto'

    if (localSuccess && serverResult === 'success') {
      if (!config.silent)
        options.statusLine.value = '草稿已缓存（本地 + 云端，未提交）'
      return
    }
    if (localSuccess && serverResult === 'error') {
      if (!config.silent)
        options.statusLine.value = '草稿已本地缓存，云端同步失败（稍后重试）'
      return
    }
    if (!localSuccess && serverResult === 'success') {
      if (!config.silent)
        options.statusLine.value = '草稿已云端缓存，本地写入失败（可重试）'
      return
    }

    if (!config.silent)
      options.statusLine.value = '草稿已自动缓存（未提交）'
  }

  async function persistProjectSettingsDraftCache(config: { silent?: boolean } = {}) {
    if (options.projectSettingsHydrating.value || !options.activeProjectId.value)
      return

    await persistResolvedProjectSettingsDraft(
      options.activeProjectId.value,
      buildProjectSettingsDraftCachePayload(),
      config,
    )
  }

  function clearProjectSettingsAutoTimers(): void {
    if (!projectSettingsDraftTimer)
      return
    clearTimeout(projectSettingsDraftTimer)
    projectSettingsDraftTimer = null
  }

  function scheduleProjectSettingsDraftPersist(): void {
    if (options.projectSettingsHydrating.value || !options.activeProjectId.value)
      return

    if (projectSettingsDraftTimer)
      clearTimeout(projectSettingsDraftTimer)

    projectSettingsDraftTimer = setTimeout(() => {
      projectSettingsDraftTimer = null
      void persistProjectSettingsDraftCache()
    }, 1200)
  }

  async function clearProjectSettingsDraftOnServer(projectId: string): Promise<'cleared' | 'none' | 'conflict' | 'error'> {
    const expectedRevision = options.projectSettingsDraftServerRevision.value
    const deviceId = options.ensureWorkspaceDeviceId()
    if (!expectedRevision || !deviceId)
      return 'none'

    try {
      await unsafeFetch<ApiResponse<ProjectSettingsDraft | null>>(
        endpoint(`/projects/${projectId}/settings-draft`),
        {
          method: 'DELETE',
          body: {
            expectedRevision,
            deviceId,
          },
        },
      )
      options.resetProjectSettingsDraftServerState()
      return 'cleared'
    }
    catch (error) {
      if (resolveApiStatusCode(error) === 409) {
        await refreshProjectSettingsDraftServerRevision(projectId)
        return 'conflict'
      }
      return 'error'
    }
  }

  function resolveWorkspaceViewPreferenceState(record: ProjectWorkspaceViewPreference | null | undefined): ProjectWorkspaceViewState | null {
    if (!record?.payload)
      return null
    return sanitizeProjectWorkspaceViewState(normalizeProjectWorkspaceViewState(record.payload), options.resources.value)
  }

  function buildDeviceRestorePromptContent(payload: { view: boolean, draft: boolean }): string {
    if (payload.view && payload.draft)
      return '另一台设备存在较新的工作上下文，包括工作区位置和项目设置草稿。\n\n你可以同步最新设备，或继续保留本设备当前内容。'
    if (payload.view)
      return '另一台设备存在较新的工作区位置，包括当前工作台、打开的标签页、会话或会议定位。\n\n你可以同步最新设备，或继续保留本设备当前位置。'
    return '另一台设备存在较新的项目设置草稿。\n\n你可以同步最新设备的草稿，或继续保留本设备当前草稿。'
  }

  async function resolveProjectDeviceRestore(
    projectId: string,
    restoredViewState: HydratedWorkspaceViewStateResult,
    draftResult: ProjectSettingsDraftHydrationResult,
    payload: {
      onApplyLatestOtherDraft: (draft: WorkspaceProjectSettingsDraftCache) => boolean
      onSyncLatestOtherViewState: (state: ProjectWorkspaceViewState) => Promise<void> | void
    },
  ): Promise<void> {
    if (!projectId || options.activeProjectId.value !== projectId)
      return

    const currentViewState = resolveWorkspaceViewPreferenceState(restoredViewState.bundle?.current || null)
    const latestOtherViewState = resolveWorkspaceViewPreferenceState(restoredViewState.bundle?.latestOther || null)
    const viewNeedsPrompt = Boolean(
      restoredViewState.bundle?.resolution.isStaleDevice
      && !restoredViewState.hasManagedQuery
      && currentViewState
      && latestOtherViewState
      && currentViewState
      && latestOtherViewState
      && JSON.stringify(currentViewState) !== JSON.stringify(latestOtherViewState),
    )

    const currentDraftBaseline = draftResult.localDraft || draftResult.currentDraft
    const latestOtherDraft = draftResult.latestOtherDraft
    const draftNeedsPrompt = Boolean(
      draftResult.bundle?.resolution.isStaleDevice
      && currentDraftBaseline
      && latestOtherDraft
      && !isProjectSettingsDraftCacheEqual(currentDraftBaseline, latestOtherDraft),
    )

    let choice: 'sync' | 'keep' = 'keep'
    if (viewNeedsPrompt || draftNeedsPrompt) {
      choice = await options.askDeviceRestoreConfirm(
        '同步最近设备的工作上下文？',
        buildDeviceRestorePromptContent({ view: viewNeedsPrompt, draft: draftNeedsPrompt }),
      )
      if (options.activeProjectId.value !== projectId)
        return
    }

    if (choice === 'sync') {
      if (viewNeedsPrompt && latestOtherViewState)
        await payload.onSyncLatestOtherViewState(latestOtherViewState)

      if (draftNeedsPrompt && latestOtherDraft) {
        const applied = payload.onApplyLatestOtherDraft(latestOtherDraft)
        if (applied)
          options.writeProjectSettingsDraftCache(projectId, latestOtherDraft)
      }

      options.statusLine.value = '已同步最近设备的工作上下文。'
    }
    else if (viewNeedsPrompt || draftNeedsPrompt) {
      options.statusLine.value = '已保留当前设备的工作上下文。'
    }

    await options.syncProjectWorkspaceViewState()

    const draftToPersist = (choice === 'sync' && draftNeedsPrompt && latestOtherDraft)
      || draftResult.localDraft
      || draftResult.currentDraft
      || (draftResult.source === 'latest_other' ? draftResult.appliedDraft : null)
    if (draftToPersist)
      await persistResolvedProjectSettingsDraft(projectId, draftToPersist, { silent: true })
  }

  async function flushProjectSettingsSave(): Promise<boolean> {
    if (!options.activeProjectId.value)
      return true

    if (!options.projectSettingsCommonDirty.value && !options.projectSettingsBindingsDirty.value)
      return true

    options.projectSettingsSaveState.value = 'saving'
    options.statusLine.value = '保存中...'

    try {
      const body: Record<string, unknown> = {
        currentContestId: options.projectSettingsCurrentContestId.value || options.selectedContestId.value || '',
      }

      if (options.projectSettingsCommonDirty.value)
        body.common = buildProjectSettingsCommonPatch(options.projectSettingsCommon)
      if (options.projectSettingsBindingsDirty.value)
        body.contestBindings = cloneProjectContestBindings(options.projectSettingsBindings.value)

      const response = await unsafeFetch<ApiResponse<ProjectSettingsSnapshot>>(
        endpoint(`/projects/${options.activeProjectId.value}/settings`),
        {
          method: 'PATCH',
          body,
        },
      )

      options.applyProjectSettingsSnapshot(response.data, options.projectSettingsCurrentContestId.value || options.selectedContestId.value)
      options.projectSettingsSaveState.value = 'saved_manual'
      options.statusLine.value = '手动保存成功'
      return true
    }
    catch (error) {
      Message.error(resolveApiErrorMessage(error, '保存失败'))
      options.projectSettingsSaveState.value = 'error'
      options.statusLine.value = `${resolveApiErrorMessage(error, '保存失败')}（可重试）`
      return false
    }
  }

  async function flushProjectAdaptationSave(contestId: string): Promise<boolean> {
    const normalizedContestId = normalizeString(contestId)
    if (!options.activeProjectId.value || !normalizedContestId)
      return true

    if (!options.isProjectSettingsAdaptationDirty(normalizedContestId))
      return true

    const draft = options.projectSettingsAdaptationDrafts.value[normalizedContestId]
    if (!draft)
      return true

    const preferredContestId = normalizeString(options.projectSettingsCurrentContestId.value || options.selectedContestId.value)
    options.projectSettingsSaveState.value = 'saving'
    options.statusLine.value = '保存中...'

    try {
      const response = await unsafeFetch<ApiResponse<ProjectSettingsSnapshot>>(
        endpoint(`/projects/${options.activeProjectId.value}/adaptations/${normalizedContestId}`),
        {
          method: 'PATCH',
          body: options.buildProjectSettingsAdaptationPatch(draft),
        },
      )

      options.applyProjectSettingsSnapshot(response.data, preferredContestId)
      options.clearProjectSettingsAdaptationDirty(normalizedContestId)
      options.projectSettingsSaveState.value = 'saved_manual'
      options.statusLine.value = '手动保存成功'
      return true
    }
    catch (error) {
      Message.error(resolveApiErrorMessage(error, '保存失败'))
      options.projectSettingsSaveState.value = 'error'
      options.statusLine.value = `${resolveApiErrorMessage(error, '保存失败')}（可重试）`
      return false
    }
  }

  function bumpProjectSettingsDraftPersistSeq(): void {
    projectSettingsDraftPersistSeq += 1
  }

  return {
    normalizeProjectSettingsDraftCachePayload,
    isProjectSettingsDraftCacheEqual,
    buildProjectSettingsDraftCachePayload,
    applyProjectSettingsDraftCachePayload,
    pickProjectSettingsDraftForHydration,
    fetchProjectSettingsDraftFromServer,
    refreshProjectSettingsDraftServerRevision,
    persistResolvedProjectSettingsDraft,
    persistProjectSettingsDraftCache,
    scheduleProjectSettingsDraftPersist,
    clearProjectSettingsDraftOnServer,
    resolveProjectDeviceRestore,
    clearProjectSettingsAutoTimers,
    flushProjectSettingsSave,
    flushProjectAdaptationSave,
    bumpProjectSettingsDraftPersistSeq,
  }
}

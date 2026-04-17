<script setup lang="ts">
import type {
  ApiResponse,
  Contest,
  Project,
  ProjectKnowledgeIndexDashboard,
  ProjectKnowledgeIndexSourceStatus,
  ProjectResourceShare,
  Track,
} from '~~/shared/types/domain'
import { Message } from '@arco-design/web-vue'
import type {
  WorkspaceProjectAdaptationForm,
  WorkspaceProjectCommonForm,
  WorkspaceProjectContestBindingForm,
  WorkspaceProjectSaveState,
} from '~/types/workspace'

const props = withDefaults(defineProps<{
  activeProject?: Project | null
  activeProjectId?: string
  contests?: Contest[]
  projectSettingsLoading?: boolean
  projectSettingsSaveState?: WorkspaceProjectSaveState
  projectSettingsCommon?: WorkspaceProjectCommonForm
  projectSettingsBindings?: WorkspaceProjectContestBindingForm[]
  projectSettingsCurrentContestId?: string
  projectSettingsAdaptation?: WorkspaceProjectAdaptationForm
  projectSettingsHasCurrentContest?: boolean
  projectResourceShares?: ProjectResourceShare[]
  projectResourceSharesLoading?: boolean
  projectSettingsSaveLabel?: string
  projectSettingsSaveBadgeClass?: string
  projectSettingsContestName?: string
  contestTracksByContestId: (contestId: string) => Track[]
  shareVisibilityLabel: (value: string) => string
  shareStatusLabel: (share: ProjectResourceShare) => string
  shareStatusBadgeClass: (share: ProjectResourceShare) => string
  getShareStatus: (share: ProjectResourceShare) => 'active' | 'expired' | 'revoked'
  formatDateTime: (value: string) => string
}>(), {
  activeProject: null,
  activeProjectId: '',
  contests: () => [],
  projectSettingsLoading: false,
  projectSettingsSaveState: 'idle',
  projectSettingsCommon: () => ({
    title: '',
    summary: '',
    icon: '',
    accentColor: '',
    problemStatement: '',
    innovationPointsText: '',
    techRouteStepsText: '',
    scoringMappingText: '',
    risksText: '',
    deliverablesText: '',
  }),
  projectSettingsBindings: () => [],
  projectSettingsCurrentContestId: '',
  projectSettingsAdaptation: () => ({
    contestId: '',
    trackId: '',
    problemStatement: '',
    innovationPointsText: '',
    techRouteStepsText: '',
    scoringMappingText: '',
    risksText: '',
    deliverablesText: '',
    summary: '',
  }),
  projectSettingsHasCurrentContest: false,
  projectResourceShares: () => [],
  projectResourceSharesLoading: false,
  projectSettingsSaveLabel: '尚未保存',
  projectSettingsSaveBadgeClass: 'text-slate-600 border-slate-200 bg-white',
  projectSettingsContestName: '',
})

const emit = defineEmits<{
  emitProjectSettingsCommon: [value: WorkspaceProjectCommonForm]
  updateProjectSettingsCommonField: [payload: { field: keyof WorkspaceProjectCommonForm, value: string }]
  saveProjectSettings: []
  addProjectSettingsBinding: []
  updateProjectSettingsBindingContest: [payload: { index: number, contestId: string }]
  updateProjectSettingsBindingTrack: [payload: { index: number, trackId: string }]
  useBindingAsCurrentContest: [payload: { contestId: string, trackId: string }]
  removeProjectSettingsBinding: [index: number]
  updateProjectSettingsAdaptationField: [payload: { field: keyof WorkspaceProjectAdaptationForm, value: string }]
  copyProjectResourceShare: [shareId: string]
  revokeProjectResourceShare: [shareId: string]
}>()

const EMPTY_KNOWLEDGE_DASHBOARD: ProjectKnowledgeIndexDashboard = {
  summary: {
    projectId: '',
    totalResources: 0,
    indexableResources: 0,
    pendingCount: 0,
    readyCount: 0,
    processingCount: 0,
    queuedCount: 0,
    failedCount: 0,
    staleCount: 0,
    skippedCount: 0,
    overallProgressPercent: 0,
    etaSeconds: 0,
    estimatedFinishedAt: null,
    lastRefreshedAt: '',
  },
  processing: [],
  recentCompleted: [],
  failed: [],
  sources: [],
  tasks: [],
}

const hasActiveProject = computed(() => Boolean(props.activeProject?.id))
const resolvedActiveProjectId = computed(() => String(props.activeProjectId || props.activeProject?.id || '').trim())
const projectKnowledgeDashboard = ref<ProjectKnowledgeIndexDashboard | null>(null)
const projectKnowledgeLoading = ref(false)
const projectKnowledgeError = ref('')
const projectKnowledgeReindexingTarget = ref<'all' | 'stale' | 'failed' | ''>('')
const projectKnowledgeRetryingSourceId = ref('')
let projectKnowledgePollingTimer: ReturnType<typeof setInterval> | null = null

const knowledgeSummary = computed(() => projectKnowledgeDashboard.value?.summary || EMPTY_KNOWLEDGE_DASHBOARD.summary)
const knowledgeProcessing = computed(() => projectKnowledgeDashboard.value?.processing || [])
const knowledgeRecentCompleted = computed(() => projectKnowledgeDashboard.value?.recentCompleted || [])
const knowledgeFailed = computed(() => projectKnowledgeDashboard.value?.failed || [])
const knowledgeSources = computed(() => projectKnowledgeDashboard.value?.sources || [])

const knowledgeSummaryCards = computed(() => {
  const summary = knowledgeSummary.value
  return [
    { label: '总资源数', value: String(summary.totalResources) },
    { label: '可索引资源', value: String(summary.indexableResources) },
    { label: '已完成', value: String(summary.readyCount) },
    { label: '进行中', value: String(summary.processingCount) },
    { label: '排队中', value: String(summary.pendingCount + summary.queuedCount) },
    { label: '待刷新', value: String(summary.staleCount) },
    { label: '失败', value: String(summary.failedCount) },
    { label: '跳过', value: String(summary.skippedCount) },
  ]
})

const shouldPollProjectKnowledge = computed(() => {
  const summary = knowledgeSummary.value
  return Boolean(
    resolvedActiveProjectId.value
    && (summary.processingCount > 0 || summary.pendingCount > 0 || summary.queuedCount > 0 || summary.staleCount > 0),
  )
})

function knowledgeStatusLabel(status: string): string {
  const normalized = String(status || '').trim()
  if (!normalized)
    return '-'
  if (normalized === 'pending')
    return '待索引'
  if (normalized === 'queued')
    return '排队中'
  if (normalized === 'extracting')
    return '提取中'
  if (normalized === 'chunking')
    return '切块中'
  if (normalized === 'embedding')
    return '向量化中'
  if (normalized === 'ready')
    return '索引完成'
  if (normalized === 'failed')
    return '索引失败'
  if (normalized === 'stale')
    return '等待刷新'
  if (normalized === 'skipped')
    return '暂不索引'
  return normalized
}

function knowledgeStageLabel(stage: string | null | undefined): string {
  const normalized = String(stage || '').trim()
  if (!normalized)
    return '-'
  if (normalized === 'finalizing')
    return '收尾中'
  return knowledgeStatusLabel(normalized)
}

function formatDurationLabel(value: number | string | null | undefined): string {
  const seconds = Math.max(0, Math.round(Number(value || 0)))
  if (!Number.isFinite(seconds) || seconds <= 0)
    return '-'
  if (seconds < 60)
    return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60
  if (minutes < 60)
    return remainSeconds > 0 ? `${minutes} 分 ${remainSeconds} 秒` : `${minutes} 分`
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  return remainMinutes > 0 ? `${hours} 小时 ${remainMinutes} 分` : `${hours} 小时`
}

function formatProgressPercent(value: number | string | null | undefined): string {
  const percent = Math.max(0, Math.min(100, Math.round(Number(value || 0))))
  return `${percent}%`
}

function resolveSourceError(source: ProjectKnowledgeIndexSourceStatus): string {
  const errorText = String(source.lastError || source.lastTask?.errorMessage || '').trim()
  return errorText || '暂无错误详情'
}

async function loadProjectKnowledgeDashboard() {
  const projectId = resolvedActiveProjectId.value
  if (!projectId) {
    projectKnowledgeDashboard.value = null
    projectKnowledgeError.value = ''
    return
  }

  projectKnowledgeLoading.value = true
  projectKnowledgeError.value = ''
  try {
    const requestUrl: string = `/api/projects/${projectId}/knowledge/index-status`
    const response = await unsafeFetch(requestUrl) as ApiResponse<ProjectKnowledgeIndexDashboard>
    projectKnowledgeDashboard.value = response.data
  }
  catch (error: any) {
    projectKnowledgeDashboard.value = null
    projectKnowledgeError.value = String(error?.data?.message || '加载知识索引状态失败，请稍后重试。').trim() || '加载知识索引状态失败，请稍后重试。'
  }
  finally {
    projectKnowledgeLoading.value = false
  }
}

async function reindexProjectKnowledge(target: 'all' | 'stale' | 'failed') {
  const projectId = resolvedActiveProjectId.value
  if (!projectId || projectKnowledgeReindexingTarget.value)
    return

  projectKnowledgeReindexingTarget.value = target
  try {
    const requestUrl: string = `/api/projects/${projectId}/knowledge/reindex`
    await unsafeFetch(requestUrl, {
      method: 'POST',
      body: { target },
    })
    Message.success(target === 'all' ? '已提交全量重建任务。' : target === 'stale' ? '已提交 stale 重建任务。' : '已提交 failed 重建任务。')
    await loadProjectKnowledgeDashboard()
  }
  catch (error: any) {
    Message.error(String(error?.data?.message || '项目知识索引重建失败，请稍后重试。').trim() || '项目知识索引重建失败，请稍后重试。')
  }
  finally {
    projectKnowledgeReindexingTarget.value = ''
  }
}

async function reindexKnowledgeSource(resourceId: string) {
  const projectId = resolvedActiveProjectId.value
  const normalizedResourceId = String(resourceId || '').trim()
  if (!projectId || !normalizedResourceId || projectKnowledgeRetryingSourceId.value)
    return

  projectKnowledgeRetryingSourceId.value = normalizedResourceId
  try {
    const requestUrl: string = `/api/projects/${projectId}/resources/${normalizedResourceId}/knowledge/reindex`
    await unsafeFetch(requestUrl, {
      method: 'POST',
    })
    Message.success('已提交资源重新索引任务。')
    await loadProjectKnowledgeDashboard()
  }
  catch (error: any) {
    Message.error(String(error?.data?.message || '资源重新索引失败，请稍后重试。').trim() || '资源重新索引失败，请稍后重试。')
  }
  finally {
    projectKnowledgeRetryingSourceId.value = ''
  }
}

function stopProjectKnowledgePolling() {
  if (!projectKnowledgePollingTimer)
    return
  clearInterval(projectKnowledgePollingTimer)
  projectKnowledgePollingTimer = null
}

function startProjectKnowledgePolling() {
  if (!import.meta.client || projectKnowledgePollingTimer)
    return
  projectKnowledgePollingTimer = setInterval(() => {
    if (projectKnowledgeLoading.value)
      return
    void loadProjectKnowledgeDashboard()
  }, 5000)
}

watch(resolvedActiveProjectId, async (next, previous) => {
  if (next === previous && projectKnowledgeDashboard.value)
    return
  stopProjectKnowledgePolling()
  projectKnowledgeDashboard.value = null
  projectKnowledgeError.value = ''
  if (!next)
    return
  await loadProjectKnowledgeDashboard()
}, { immediate: true })

watch(shouldPollProjectKnowledge, (next) => {
  if (next) {
    startProjectKnowledgePolling()
    return
  }
  stopProjectKnowledgePolling()
}, { immediate: true })

onBeforeUnmount(() => {
  stopProjectKnowledgePolling()
})
</script>

<template>
  <div class="w-full space-y-4">
    <section class="border border-slate-200 rounded-lg bg-white overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div class="flex gap-3 items-center">
          <span class="material-symbols-outlined text-xl text-blue-600">settings</span>
          <div>
            <h2 class="text-sm font-bold">
              项目通用设置
            </h2>
            <div class="text-xs text-slate-500 mt-0.5">
              项目通用信息
            </div>
          </div>
        </div>

        <div class="flex gap-2 items-center">
          <span
            class="text-xs font-medium px-2 py-1 border rounded"
            :class="props.projectSettingsSaveBadgeClass"
          >
            {{ props.projectSettingsSaveLabel }}
          </span>
          <button
            class="text-xs text-white font-semibold px-3 py-1.5 rounded bg-slate-900 transition-colors hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            type="button"
            :disabled="!hasActiveProject || props.projectSettingsLoading"
            @click="emit('saveProjectSettings')"
          >
            立即保存
          </button>
        </div>
      </div>

      <div class="p-4">
        <div v-if="props.projectSettingsLoading" class="text-xs text-slate-500 p-3 border border-slate-200 rounded bg-slate-50">
          正在加载项目设置...
        </div>

        <div v-else-if="!hasActiveProject" class="text-xs text-slate-500 p-3 border border-slate-200 rounded bg-slate-50">
          当前 Team 暂无可编辑项目，请先创建或切换到目标项目。
        </div>

        <div v-else class="space-y-3">
          <ProjectBasicSettingsEditor
            :model-value="props.projectSettingsCommon"
            :project="props.activeProject"
            :disabled="props.projectSettingsLoading"
            @update:model-value="emit('emitProjectSettingsCommon', $event)"
          />

          <div class="gap-3 grid grid-cols-1 md:grid-cols-2">
            <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
              <span class="block">问题陈述</span>
              <textarea
                :value="props.projectSettingsCommon.problemStatement"
                class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[70px] w-full focus:border-blue-500"
                @input="emit('updateProjectSettingsCommonField', { field: 'problemStatement', value: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>

            <label class="text-xs text-slate-600 block space-y-1">
              <span class="block">创新点（每行一条）</span>
              <textarea
                :value="props.projectSettingsCommon.innovationPointsText"
                class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                @input="emit('updateProjectSettingsCommonField', { field: 'innovationPointsText', value: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>
            <label class="text-xs text-slate-600 block space-y-1">
              <span class="block">技术路线（每行一条）</span>
              <textarea
                :value="props.projectSettingsCommon.techRouteStepsText"
                class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                @input="emit('updateProjectSettingsCommonField', { field: 'techRouteStepsText', value: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>
            <label class="text-xs text-slate-600 block space-y-1">
              <span class="block">评分映射（每行一条）</span>
              <textarea
                :value="props.projectSettingsCommon.scoringMappingText"
                class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                @input="emit('updateProjectSettingsCommonField', { field: 'scoringMappingText', value: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>
            <label class="text-xs text-slate-600 block space-y-1">
              <span class="block">风险项（每行一条）</span>
              <textarea
                :value="props.projectSettingsCommon.risksText"
                class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                @input="emit('updateProjectSettingsCommonField', { field: 'risksText', value: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>
            <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
              <span class="block">交付物（每行一条）</span>
              <textarea
                :value="props.projectSettingsCommon.deliverablesText"
                class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                @input="emit('updateProjectSettingsCommonField', { field: 'deliverablesText', value: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>
          </div>
        </div>
      </div>
    </section>

    <template v-if="!props.projectSettingsLoading && hasActiveProject">
      <section class="p-4 border border-slate-200 rounded-lg bg-white">
        <div class="mb-3 flex gap-2 items-center justify-between">
          <h3 class="text-xs text-slate-700 font-semibold">
            竞赛与赛道绑定
          </h3>
          <button
            class="text-xs font-semibold px-2.5 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            type="button"
            @click="emit('addProjectSettingsBinding')"
          >
            添加竞赛
          </button>
        </div>

        <div class="space-y-2">
          <div
            v-for="(binding, index) in props.projectSettingsBindings"
            :key="`binding-${binding.contestId}-${index}`"
            class="gap-2 grid grid-cols-1 items-center md:grid-cols-[1fr,1fr,auto,auto]"
          >
            <select
              :value="binding.contestId"
              class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
              @change="emit('updateProjectSettingsBindingContest', { index, contestId: ($event.target as HTMLSelectElement).value })"
            >
              <option value="" disabled>
                选择竞赛
              </option>
              <option v-for="contest in props.contests" :key="contest.id" :value="contest.id">
                {{ contest.name }}
              </option>
            </select>

            <select
              :value="binding.trackId"
              class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
              @change="emit('updateProjectSettingsBindingTrack', { index, trackId: ($event.target as HTMLSelectElement).value })"
            >
              <option value="" disabled>
                选择赛道
              </option>
              <option v-for="track in props.contestTracksByContestId(binding.contestId)" :key="track.id" :value="track.id">
                {{ track.name }}
              </option>
            </select>

            <button
              class="text-xs font-semibold px-2.5 py-1 border rounded transition-colors"
              :class="binding.contestId === props.projectSettingsCurrentContestId ? 'text-blue-700 border-blue-200 bg-blue-50' : 'text-slate-600 border-slate-200 bg-white hover:bg-slate-50'"
              type="button"
              @click="emit('useBindingAsCurrentContest', { contestId: binding.contestId, trackId: binding.trackId })"
            >
              {{ binding.contestId === props.projectSettingsCurrentContestId ? '当前竞赛' : '设为当前' }}
            </button>

            <button
              class="text-xs text-rose-600 font-semibold px-2.5 py-1 border border-rose-200 rounded bg-white transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
              type="button"
              :disabled="props.projectSettingsBindings.length <= 1"
              @click="emit('removeProjectSettingsBinding', index)"
            >
              删除
            </button>
          </div>

          <p v-if="props.projectSettingsBindings.length === 0" class="text-xs text-slate-500">
            {{ props.contests.length > 0 ? '暂无竞赛绑定，请先添加至少一个竞赛并指定赛道。' : '暂无可用竞赛，点击“添加竞赛”可在弹窗中刷新并绑定。' }}
          </p>
        </div>
      </section>

      <section v-if="props.projectSettingsHasCurrentContest" class="p-4 border border-slate-200 rounded-lg bg-white">
        <h3 class="text-xs text-slate-700 font-semibold mb-3">
          当前竞赛适配稿
          <span class="text-slate-400 font-normal ml-1">
            {{ props.projectSettingsContestName || props.projectSettingsCurrentContestId }}
          </span>
        </h3>
        <div class="gap-3 grid grid-cols-1 md:grid-cols-2">
          <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
            <span class="block">问题陈述</span>
            <textarea
              :value="props.projectSettingsAdaptation.problemStatement"
              class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[70px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'problemStatement', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>
          <label class="text-xs text-slate-600 block space-y-1">
            <span class="block">创新点（每行一条）</span>
            <textarea
              :value="props.projectSettingsAdaptation.innovationPointsText"
              class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'innovationPointsText', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>
          <label class="text-xs text-slate-600 block space-y-1">
            <span class="block">技术路线（每行一条）</span>
            <textarea
              :value="props.projectSettingsAdaptation.techRouteStepsText"
              class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'techRouteStepsText', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>
          <label class="text-xs text-slate-600 block space-y-1">
            <span class="block">评分映射（每行一条）</span>
            <textarea
              :value="props.projectSettingsAdaptation.scoringMappingText"
              class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'scoringMappingText', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>
          <label class="text-xs text-slate-600 block space-y-1">
            <span class="block">风险项（每行一条）</span>
            <textarea
              :value="props.projectSettingsAdaptation.risksText"
              class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'risksText', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>
          <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
            <span class="block">交付物（每行一条）</span>
            <textarea
              :value="props.projectSettingsAdaptation.deliverablesText"
              class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'deliverablesText', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>
          <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
            <span class="block">摘要</span>
            <textarea
              :value="props.projectSettingsAdaptation.summary"
              class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[70px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'summary', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>
        </div>
      </section>

      <section class="p-4 border border-slate-200 rounded-lg bg-white" data-testid="workspace-project-knowledge-index">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 class="text-xs text-slate-700 font-semibold">
              知识索引
            </h3>
            <p class="mt-1 text-xs text-slate-500">
              查看项目整体索引进度、预计完成时间、最近完成项与失败项。
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              class="text-xs font-semibold px-2.5 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              type="button"
              :disabled="!resolvedActiveProjectId || projectKnowledgeLoading || Boolean(projectKnowledgeReindexingTarget)"
              @click="reindexProjectKnowledge('all')"
            >
              {{ projectKnowledgeReindexingTarget === 'all' ? '重建中...' : '全量重建' }}
            </button>
            <button
              class="text-xs font-semibold px-2.5 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              type="button"
              :disabled="!resolvedActiveProjectId || projectKnowledgeLoading || Boolean(projectKnowledgeReindexingTarget)"
              @click="reindexProjectKnowledge('stale')"
            >
              {{ projectKnowledgeReindexingTarget === 'stale' ? '重建中...' : '重建 stale' }}
            </button>
            <button
              class="text-xs font-semibold px-2.5 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              type="button"
              :disabled="!resolvedActiveProjectId || projectKnowledgeLoading || Boolean(projectKnowledgeReindexingTarget)"
              @click="reindexProjectKnowledge('failed')"
            >
              {{ projectKnowledgeReindexingTarget === 'failed' ? '重建中...' : '重建 failed' }}
            </button>
          </div>
        </div>

        <div v-if="projectKnowledgeLoading" class="mt-4 text-xs text-slate-500 px-3 py-2 border border-slate-200 rounded bg-slate-50">
          正在加载知识索引概览...
        </div>

        <div v-else-if="projectKnowledgeError" class="mt-4 text-xs text-rose-600 px-3 py-2 border border-rose-200 rounded bg-rose-50">
          {{ projectKnowledgeError }}
        </div>

        <div v-else class="mt-4 space-y-4">
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article
              v-for="card in knowledgeSummaryCards"
              :key="card.label"
              class="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3"
            >
              <div class="text-[11px] text-slate-500">
                {{ card.label }}
              </div>
              <div class="mt-2 text-lg font-semibold text-slate-800">
                {{ card.value }}
              </div>
            </article>
          </div>

          <div class="rounded-lg border border-slate-200 bg-white px-3 py-3">
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div class="text-xs font-semibold text-slate-700">
                整体完成百分比
              </div>
              <div class="text-xs text-slate-500">
                {{ formatProgressPercent(knowledgeSummary.overallProgressPercent) }}
              </div>
            </div>
            <div class="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                class="h-full rounded-full bg-blue-500 transition-all"
                :style="{ width: formatProgressPercent(knowledgeSummary.overallProgressPercent) }"
              />
            </div>
            <div class="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
              <div>预计剩余时长：{{ formatDurationLabel(knowledgeSummary.etaSeconds) }}</div>
              <div>预计完成时间：{{ props.formatDateTime(String(knowledgeSummary.estimatedFinishedAt || '')) }}</div>
              <div>最近刷新时间：{{ props.formatDateTime(String(knowledgeSummary.lastRefreshedAt || '')) }}</div>
            </div>
          </div>

          <div class="grid gap-4 xl:grid-cols-3">
            <section class="rounded-lg border border-slate-200 bg-white p-3">
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-semibold text-slate-700">
                  正在处理
                </h4>
                <span class="text-[11px] text-slate-500">
                  {{ knowledgeProcessing.length }} 项
                </span>
              </div>
              <div class="mt-3 space-y-2">
                <article
                  v-for="source in knowledgeProcessing"
                  :key="source.id"
                  class="rounded border border-slate-200 bg-slate-50/70 px-3 py-2"
                >
                  <div class="text-xs font-semibold text-slate-800 truncate" :title="source.resourceTitle">
                    {{ source.resourceTitle }}
                  </div>
                  <div class="mt-1 text-[11px] text-slate-500">
                    {{ knowledgeStageLabel(source.currentStage || source.status) }} · {{ formatProgressPercent(source.progressPercent) }} · ETA {{ formatDurationLabel(source.etaSeconds) }}
                  </div>
                </article>
                <div v-if="knowledgeProcessing.length === 0" class="text-xs text-slate-500">
                  当前没有正在处理的索引任务。
                </div>
              </div>
            </section>

            <section class="rounded-lg border border-slate-200 bg-white p-3">
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-semibold text-slate-700">
                  最近完成
                </h4>
                <span class="text-[11px] text-slate-500">
                  {{ knowledgeRecentCompleted.length }} 项
                </span>
              </div>
              <div class="mt-3 space-y-2">
                <article
                  v-for="source in knowledgeRecentCompleted"
                  :key="source.id"
                  class="rounded border border-slate-200 bg-slate-50/70 px-3 py-2"
                >
                  <div class="text-xs font-semibold text-slate-800 truncate" :title="source.resourceTitle">
                    {{ source.resourceTitle }}
                  </div>
                  <div class="mt-1 text-[11px] text-slate-500">
                    完成于 {{ props.formatDateTime(String(source.lastIndexedAt || '')) }} · Chunk {{ source.chunkIndexed || source.chunkTotal || 0 }}
                  </div>
                </article>
                <div v-if="knowledgeRecentCompleted.length === 0" class="text-xs text-slate-500">
                  暂无最近完成记录。
                </div>
              </div>
            </section>

            <section class="rounded-lg border border-slate-200 bg-white p-3" data-testid="workspace-project-knowledge-failed-list">
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-semibold text-slate-700">
                  失败项
                </h4>
                <span class="text-[11px] text-slate-500">
                  {{ knowledgeFailed.length }} 项
                </span>
              </div>
              <div class="mt-3 space-y-2">
                <article
                  v-for="source in knowledgeFailed"
                  :key="source.id"
                  class="rounded border border-rose-200 bg-rose-50/70 px-3 py-2"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="text-xs font-semibold text-rose-700 truncate" :title="source.resourceTitle">
                        {{ source.resourceTitle }}
                      </div>
                      <div class="mt-1 text-[11px] text-rose-600">
                        {{ knowledgeStageLabel(source.lastErrorStage || source.currentStage || source.status) }} · {{ resolveSourceError(source) }}
                      </div>
                    </div>
                    <button
                      class="shrink-0 text-[11px] font-semibold px-2 py-1 border border-rose-200 rounded bg-white text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      type="button"
                      :disabled="!source.sourceResourceId || projectKnowledgeRetryingSourceId === source.sourceResourceId"
                      @click="reindexKnowledgeSource(source.sourceResourceId || '')"
                    >
                      {{ projectKnowledgeRetryingSourceId === source.sourceResourceId ? '重试中...' : '重试' }}
                    </button>
                  </div>
                </article>
                <div v-if="knowledgeFailed.length === 0" class="text-xs text-slate-500">
                  当前没有失败项。
                </div>
              </div>
            </section>
          </div>

          <section class="rounded-lg border border-slate-200 bg-white overflow-hidden" data-testid="workspace-project-knowledge-source-table">
            <div class="px-3 py-2 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
              <h4 class="text-xs font-semibold text-slate-700">
                完整状态表
              </h4>
              <span class="text-[11px] text-slate-500">
                {{ knowledgeSources.length }} 条
              </span>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full text-xs">
                <thead class="bg-slate-50 text-slate-500">
                  <tr>
                    <th class="px-3 py-2 text-left font-medium">
                      资源
                    </th>
                    <th class="px-3 py-2 text-left font-medium">
                      状态
                    </th>
                    <th class="px-3 py-2 text-left font-medium">
                      阶段
                    </th>
                    <th class="px-3 py-2 text-left font-medium">
                      进度
                    </th>
                    <th class="px-3 py-2 text-left font-medium">
                      ETA
                    </th>
                    <th class="px-3 py-2 text-left font-medium">
                      Chunk
                    </th>
                    <th class="px-3 py-2 text-left font-medium">
                      最后完成
                    </th>
                    <th class="px-3 py-2 text-left font-medium">
                      错误
                    </th>
                    <th class="px-3 py-2 text-right font-medium">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="source in knowledgeSources" :key="source.id" class="border-t border-slate-200">
                    <td class="px-3 py-2 align-top">
                      <div class="font-medium text-slate-700 max-w-[220px] truncate" :title="source.resourceTitle">
                        {{ source.resourceTitle }}
                      </div>
                    </td>
                    <td class="px-3 py-2 align-top text-slate-600">
                      {{ knowledgeStatusLabel(source.status) }}
                    </td>
                    <td class="px-3 py-2 align-top text-slate-600">
                      {{ knowledgeStageLabel(source.currentStage || source.status) }}
                    </td>
                    <td class="px-3 py-2 align-top text-slate-600">
                      {{ formatProgressPercent(source.progressPercent) }}
                    </td>
                    <td class="px-3 py-2 align-top text-slate-600">
                      {{ formatDurationLabel(source.etaSeconds) }}
                    </td>
                    <td class="px-3 py-2 align-top text-slate-600">
                      {{ source.chunkIndexed || source.chunkTotal || 0 }}
                    </td>
                    <td class="px-3 py-2 align-top text-slate-600">
                      {{ props.formatDateTime(String(source.lastIndexedAt || '')) }}
                    </td>
                    <td class="px-3 py-2 align-top text-slate-600 max-w-[220px]">
                      <span class="line-clamp-2" :title="resolveSourceError(source)">
                        {{ source.status === 'failed' ? resolveSourceError(source) : '-' }}
                      </span>
                    </td>
                    <td class="px-3 py-2 align-top text-right">
                      <button
                        class="text-[11px] font-semibold px-2 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        type="button"
                        :disabled="!source.sourceResourceId || projectKnowledgeRetryingSourceId === source.sourceResourceId"
                        @click="reindexKnowledgeSource(source.sourceResourceId || '')"
                      >
                        {{ projectKnowledgeRetryingSourceId === source.sourceResourceId ? '处理中...' : '重新索引' }}
                      </button>
                    </td>
                  </tr>
                  <tr v-if="knowledgeSources.length === 0">
                    <td colspan="9" class="px-3 py-4 text-center text-slate-500">
                      当前项目暂无知识索引源。
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      <section class="p-4 border border-slate-200 rounded-lg bg-white">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-xs text-slate-700 font-semibold">
            分享链接管理
          </h3>
          <span class="text-xs text-slate-500">
            共 {{ props.projectResourceShares.length }} 条
          </span>
        </div>

        <div v-if="props.projectResourceSharesLoading" class="text-xs text-slate-500 px-3 py-2 border border-slate-200 rounded bg-slate-50">
          正在加载分享链接...
        </div>

        <div v-else-if="props.projectResourceShares.length === 0" class="text-xs text-slate-500 px-3 py-2 border border-slate-200 rounded bg-slate-50">
          暂无分享链接，可在左侧文件菜单点击“分享链接”创建。
        </div>

        <div v-else class="space-y-2">
          <article
            v-for="share in props.projectResourceShares"
            :key="share.id"
            class="px-3 py-2 border border-slate-200 rounded"
          >
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div class="min-w-0">
                <p class="text-xs text-slate-700 font-semibold truncate">
                  {{ share.resourceTitle || share.resourceId }}
                </p>
                <p class="text-xs text-slate-500 mt-1 break-all">
                  {{ share.shareUrl }}
                </p>
                <p class="text-xs text-slate-500 mt-1">
                  {{ props.shareVisibilityLabel(share.visibility) }} · {{ share.duration }} · 到期 {{ props.formatDateTime(share.expiresAt) }}
                </p>
              </div>
              <div class="flex gap-2 items-center">
                <span
                  class="text-xs font-semibold px-2 py-0.5 border rounded-full"
                  :class="props.shareStatusBadgeClass(share)"
                >
                  {{ props.shareStatusLabel(share) }}
                </span>
                <button
                  class="text-xs font-semibold px-2.5 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50"
                  type="button"
                  @click="emit('copyProjectResourceShare', share.id)"
                >
                  复制链接
                </button>
                <button
                  class="text-xs text-rose-600 font-semibold px-2.5 py-1 border border-rose-200 rounded bg-white transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  type="button"
                  :disabled="props.getShareStatus(share) === 'revoked'"
                  @click="emit('revokeProjectResourceShare', share.id)"
                >
                  失效
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

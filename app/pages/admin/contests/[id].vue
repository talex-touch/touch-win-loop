<script setup lang="ts">
import type {
  ApiResponse,
  ContestDetailPayload,
  PublishCheckResult,
} from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const route = useRoute()

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

const contestId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.id
  return Array.isArray(value) ? (value[0] || '') : (value || '')
})

const workspaceRootPath = computed(() => `/admin/contests/${contestId.value}`)
const normalizedRoutePath = computed(() => route.path.replace(/\/+$/, ''))

type WorkspaceModuleKey = 'overview' | 'faq' | 'tracks' | 'trackTimelines' | 'timelines' | 'rubrics' | 'resources' | 'releases' | 'knowledge' | 'prompts' | 'audit'

const workspaceModules = computed(() => {
  const id = contestId.value
  return [
    { key: 'overview' as const, label: '基础信息', path: `/admin/contests/${id}/overview/edit` },
    { key: 'faq' as const, label: 'FAQ', path: `/admin/contests/${id}/faq` },
    { key: 'tracks' as const, label: '赛道管理', path: `/admin/contests/${id}/tracks` },
    { key: 'trackTimelines' as const, label: '赛道时间线', path: `/admin/contests/${id}/track-timelines` },
    { key: 'timelines' as const, label: '时间节点', path: `/admin/contests/${id}/timelines` },
    { key: 'rubrics' as const, label: '评委细则', path: `/admin/contests/${id}/rubrics` },
    { key: 'resources' as const, label: '资料中心', path: `/admin/contests/${id}/resources` },
    { key: 'releases' as const, label: '版本发布', path: `/admin/contests/${id}/releases` },
    { key: 'knowledge' as const, label: '知识库治理', path: `/admin/contests/${id}/knowledge` },
    { key: 'prompts' as const, label: 'AI 提示词', path: `/admin/contests/${id}/ai-prompts` },
    { key: 'audit' as const, label: '审计历史', path: `/admin/contests/${id}/audit` },
  ]
})

function resolveModuleFromPath(path: string): WorkspaceModuleKey {
  const id = contestId.value
  const normalizedPath = path.replace(/\/+$/, '')
  const prefix = `/admin/contests/${id}/`
  if (!normalizedPath.startsWith(prefix))
    return 'overview'

  const tail = normalizedPath.slice(prefix.length)
  if (tail.startsWith('overview'))
    return 'overview'
  if (tail.startsWith('faq'))
    return 'faq'
  if (tail.startsWith('tracks'))
    return 'tracks'
  if (tail.startsWith('track-timelines'))
    return 'trackTimelines'
  if (tail.startsWith('timelines'))
    return 'timelines'
  if (tail.startsWith('rubrics'))
    return 'rubrics'
  if (tail.startsWith('resources'))
    return 'resources'
  if (tail.startsWith('releases'))
    return 'releases'
  if (tail.startsWith('knowledge'))
    return 'knowledge'
  if (tail.startsWith('ai-prompts'))
    return 'prompts'
  if (tail.startsWith('audit'))
    return 'audit'
  return 'overview'
}

const activeModule = computed<WorkspaceModuleKey>(() => resolveModuleFromPath(normalizedRoutePath.value))

const defaultModulePath = computed(() => {
  return workspaceModules.value[0]?.path
    || workspaceRootPath.value
})

async function switchModule(moduleKey: WorkspaceModuleKey) {
  const targetPath = workspaceModules.value.find(item => item.key === moduleKey)?.path
  if (!targetPath || normalizedRoutePath.value === targetPath)
    return
  await navigateTo(targetPath)
}

const loading = ref(false)
const actionLoading = ref(false)
const errorText = ref('')
const successText = ref('')
const detail = ref<ContestDetailPayload | null>(null)
const publishCheck = ref<PublishCheckResult | null>(null)

async function loadData() {
  if (!contestId.value)
    return
  loading.value = true
  errorText.value = ''
  try {
    const [detailData, checkData] = await Promise.all([
      requestApi<ContestDetailPayload>(endpoint(`/contests/${contestId.value}`), {}, '数据加载失败。'),
      requestApi<PublishCheckResult>(endpoint(`/admin/contests/${contestId.value}/publish-check`), {}, '数据加载失败。'),
    ])
    detail.value = detailData
    publishCheck.value = checkData
  }
  catch (error: any) {
    detail.value = null
    publishCheck.value = null
    errorText.value = String(error?.data?.message || '数据加载失败。')
  }
  finally {
    loading.value = false
  }
}

async function publishContest() {
  actionLoading.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await requestApi<unknown>(
      endpoint(`/admin/contests/${contestId.value}/publish`),
      { method: 'POST' },
      '发布失败。',
    )
    successText.value = '赛事已发布。'
    await loadData()
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '发布失败。')
  }
  finally {
    actionLoading.value = false
  }
}

async function archiveContest() {
  actionLoading.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await requestApi<unknown>(
      endpoint(`/admin/contests/${contestId.value}/archive`),
      { method: 'POST' },
      '下架失败。',
    )
    successText.value = '赛事已下架。'
    await loadData()
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '下架失败。')
  }
  finally {
    actionLoading.value = false
  }
}

watch(
  () => [contestId.value, normalizedRoutePath.value],
  () => {
    if (!contestId.value)
      return
    if (normalizedRoutePath.value === workspaceRootPath.value)
      void navigateTo(defaultModulePath.value, { replace: true })
  },
  { immediate: true },
)

watch(contestId, async (value, oldValue) => {
  if (!value || value === oldValue)
    return
  await loadData()
}, { immediate: true })
</script>

<template>
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 class="text-lg text-slate-900 font-semibold">
            竞赛工作区
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            赛事 ID：{{ contestId }}，统一通过 Tabs 进入各模块。
          </p>
        </div>
        <div class="flex gap-2 items-center">
          <NuxtLink class="dense-btn" to="/admin/contests">
            返回赛事列表
          </NuxtLink>
          <button class="dense-btn" :disabled="actionLoading" @click="publishContest">
            发布
          </button>
          <button class="dense-btn" :disabled="actionLoading" @click="archiveContest">
            下架
          </button>
        </div>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <button
          v-for="item in workspaceModules"
          :key="item.key"
          class="text-xs font-medium px-3 py-1.5 rounded transition-colors"
          :class="activeModule === item.key
            ? 'bg-slate-900 text-white'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'"
          @click="switchModule(item.key)"
        >
          {{ item.label }}
        </button>
      </div>

      <div v-if="loading" class="mt-3 p-3 border border-slate-200 rounded bg-slate-50">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="4" />
        </a-skeleton>
      </div>
      <div v-else-if="detail && publishCheck" class="mt-3 p-3 border border-slate-200 rounded bg-slate-50">
        <h2 class="text-sm text-slate-900 font-semibold">
          发布预检
        </h2>
        <p class="text-xs text-slate-600 mt-2">
          完成度：{{ publishCheck.completion }}% ｜ 结果：{{ publishCheck.canPublish ? '可发布' : '存在阻断项' }}
        </p>
        <div v-if="publishCheck.blockers.length > 0" class="text-xs text-rose-700 mt-2 p-3 border border-rose-200 rounded bg-rose-50">
          <p class="font-semibold">
            阻断项
          </p>
          <p v-for="item in publishCheck.blockers" :key="item.code" class="mt-1">
            · {{ item.message }}
          </p>
        </div>
        <div v-if="publishCheck.warnings.length > 0" class="text-xs text-amber-700 mt-2 p-3 border border-amber-200 rounded bg-amber-50">
          <p class="font-semibold">
            提示项
          </p>
          <p v-for="item in publishCheck.warnings" :key="item.code" class="mt-1">
            · {{ item.message }}
          </p>
        </div>
      </div>
    </section>

    <NuxtPage />

    <section v-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>

    <section v-if="successText" class="text-sm text-emerald-700 p-4 border border-emerald-200 rounded-lg bg-emerald-50">
      {{ successText }}
    </section>
  </div>
</template>

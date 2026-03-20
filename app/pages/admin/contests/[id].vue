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
const apiBase = runtime.public.apiBaseUrl || '/api'
const route = useRoute()

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

const contestId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.id
  return Array.isArray(value) ? (value[0] || '') : (value || '')
})

const workspaceRootPath = computed(() => `/admin/contests/${contestId.value}`)
const normalizedRoutePath = computed(() => route.path.replace(/\/+$/, ''))

type WorkspaceModuleKey = 'overview' | 'faq' | 'tracks' | 'timelines' | 'rubrics' | 'resources' | 'prompts' | 'audit'

const workspaceModuleKeys: WorkspaceModuleKey[] = [
  'overview',
  'faq',
  'tracks',
  'timelines',
  'rubrics',
  'resources',
  'prompts',
  'audit',
]

function isWorkspaceModuleKey(value: string): value is WorkspaceModuleKey {
  return workspaceModuleKeys.includes(value as WorkspaceModuleKey)
}

const workspaceModules = computed(() => {
  const id = contestId.value
  return [
    { key: 'overview' as const, label: '基础信息', path: `/admin/contests/${id}/overview/edit` },
    { key: 'faq' as const, label: 'FAQ', path: `/admin/contests/${id}/faq` },
    { key: 'tracks' as const, label: '赛道管理', path: `/admin/contests/${id}/tracks` },
    { key: 'timelines' as const, label: '时间节点', path: `/admin/contests/${id}/timelines` },
    { key: 'rubrics' as const, label: '评委细则', path: `/admin/contests/${id}/rubrics` },
    { key: 'resources' as const, label: '资料中心', path: `/admin/contests/${id}/resources` },
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
  if (tail.startsWith('timelines'))
    return 'timelines'
  if (tail.startsWith('rubrics'))
    return 'rubrics'
  if (tail.startsWith('resources'))
    return 'resources'
  if (tail.startsWith('ai-prompts'))
    return 'prompts'
  if (tail.startsWith('audit'))
    return 'audit'
  return 'overview'
}

const activeModule = computed<WorkspaceModuleKey>(() => resolveModuleFromPath(normalizedRoutePath.value))

const legacyQueryModule = computed<WorkspaceModuleKey | ''>(() => {
  const value = Array.isArray(route.query.module) ? route.query.module[0] : route.query.module
  const moduleText = String(value || '').trim()
  if (isWorkspaceModuleKey(moduleText))
    return moduleText
  return ''
})

const defaultModulePath = computed(() => {
  const preferredKey = legacyQueryModule.value || 'overview'
  return workspaceModules.value.find(item => item.key === preferredKey)?.path
    || workspaceModules.value[0]?.path
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
    const [detailRes, checkRes] = await Promise.all([
      $fetch<ApiResponse<ContestDetailPayload>>(endpoint(`/contests/${contestId.value}`)),
      $fetch<ApiResponse<PublishCheckResult>>(endpoint(`/admin/contests/${contestId.value}/publish-check`)),
    ])
    detail.value = detailRes.data
    publishCheck.value = checkRes.data
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
    await $fetch(endpoint(`/admin/contests/${contestId.value}/publish`), { method: 'POST' })
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
    await $fetch(endpoint(`/admin/contests/${contestId.value}/archive`), { method: 'POST' })
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
  () => [contestId.value, normalizedRoutePath.value, legacyQueryModule.value],
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
    <section class="rounded-lg border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 class="text-lg font-semibold text-slate-900">
            竞赛工作区
          </h1>
          <p class="mt-1 text-xs text-slate-500">
            赛事 ID：{{ contestId }}，统一通过 Tabs 进入各模块。
          </p>
        </div>
        <div class="flex items-center gap-2">
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
          class="rounded px-3 py-1.5 text-xs font-medium transition-colors"
          :class="activeModule === item.key
            ? 'bg-slate-900 text-white'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'"
          @click="switchModule(item.key)"
        >
          {{ item.label }}
        </button>
      </div>

      <div v-if="loading" class="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
        <a-skeleton :animation="true">
          <a-skeleton-line :rows="4" />
        </a-skeleton>
      </div>
      <div v-else-if="detail && publishCheck" class="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
        <h2 class="text-sm font-semibold text-slate-900">
          发布预检
        </h2>
        <p class="mt-2 text-xs text-slate-600">
          完成度：{{ publishCheck.completion }}% ｜ 结果：{{ publishCheck.canPublish ? '可发布' : '存在阻断项' }}
        </p>
        <div v-if="publishCheck.blockers.length > 0" class="mt-2 rounded border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <p class="font-semibold">
            阻断项
          </p>
          <p v-for="item in publishCheck.blockers" :key="item.code" class="mt-1">
            · {{ item.message }}
          </p>
        </div>
        <div v-if="publishCheck.warnings.length > 0" class="mt-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
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

    <section v-if="errorText" class="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
      {{ errorText }}
    </section>

    <section v-if="successText" class="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
      {{ successText }}
    </section>
  </div>
</template>

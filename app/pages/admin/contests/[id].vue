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
const workspacePageKey = computed(() => normalizedRoutePath.value)

const defaultModulePath = computed(() => {
  return contestId.value
    ? `/admin/contests/${contestId.value}/overview/edit`
    : workspaceRootPath.value
})
const releaseWorkbenchPath = computed(() => `/admin/contests/${contestId.value}/releases`)

const loading = ref(false)
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
      requestApi<ContestDetailPayload>(endpoint(`/admin/contests/${contestId.value}`), {}, '数据加载失败。'),
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
  <div class="admin-contest-workspace space-y-4">
    <section class="admin-contest-workspace__hero p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <div class="min-w-0">
          <h1 class="text-lg text-slate-900 font-semibold">
            竞赛工作区
          </h1>
          <p class="text-xs text-slate-500 mt-1 break-all">
            赛事 ID：{{ contestId }}，统一通过 Tabs 进入各模块。
          </p>
          <p class="text-xs text-amber-600 mt-2">
            当前工作区以版本流为准。手工修改或飞书同步都会先生成待审核版本，审核通过并发布后前台才更新。
          </p>
        </div>
        <div class="admin-contest-workspace__actions flex gap-2 items-center">
          <NuxtLink class="dense-btn" to="/admin/contests">
            返回赛事列表
          </NuxtLink>
          <NuxtLink class="dense-btn" :to="releaseWorkbenchPath">
            审核/版本
          </NuxtLink>
        </div>
      </div>

      <ContestWorkspaceTabs class="mt-3" :contest-id="contestId" />

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

    <NuxtPage :key="workspacePageKey" />

    <section v-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>

    <section v-if="successText" class="text-sm text-emerald-700 p-4 border border-emerald-200 rounded-lg bg-emerald-50">
      {{ successText }}
    </section>
  </div>
</template>

<style scoped>
.admin-contest-workspace,
.admin-contest-workspace__hero {
  min-width: 0;
}

.admin-contest-workspace__actions {
  min-width: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

@media (max-width: 640px) {
  .admin-contest-workspace__actions {
    width: 100%;
    justify-content: flex-start;
  }

  .admin-contest-workspace__actions .dense-btn {
    flex: 1 1 140px;
  }
}
</style>

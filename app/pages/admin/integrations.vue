<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  CasdoorIntegrationConfig,
  FeishuIntegrationConfig,
  PlatformPermission,
} from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

type IntegrationClickAction = 'navigate' | 'coming_soon'

interface IntegrationCard {
  key: string
  name: string
  summary: string
  status: string
  tone: string
  clickAction: IntegrationClickAction
  path?: string
}

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

const loadingPermissions = ref(true)
const loadingCasdoorStatus = ref(false)
const loadingFeishuStatus = ref(false)
const permissions = ref<PlatformPermission[]>([])
const casdoorEnabled = ref<boolean | null>(null)
const feishuEnabled = ref<boolean | null>(null)

const errorText = ref('')
const infoText = ref('')

const canManageConfig = computed(() => permissions.value.includes('role.assign'))
const canManageBitable = computed(() => permissions.value.includes('contest.write'))
const canAccessPage = computed(() => canManageConfig.value || canManageBitable.value)
const loadingAny = computed(() => loadingPermissions.value || loadingFeishuStatus.value || loadingCasdoorStatus.value)
const normalizedPath = computed(() => route.path.replace(/\/+$/, '') || '/')
const isDirectoryRoute = computed(() => normalizedPath.value === '/admin/integrations')

function isCasdoorConfigReady(config: CasdoorIntegrationConfig): boolean {
  const hasProviderConfig = config.protocolMode === 'oauth2_manual'
    ? Boolean(
        config.authorizeEndpoint.trim()
        && config.tokenEndpoint.trim()
        && config.userinfoEndpoint.trim(),
      )
    : Boolean(config.issuer.trim())

  return Boolean(
    config.enabled
    && hasProviderConfig
    && config.clientId.trim()
    && config.clientSecretConfigured
    && config.redirectUri.trim(),
  )
}

const integrationCards = computed<IntegrationCard[]>(() => {
  const feishuStatus = feishuEnabled.value === null
    ? (canManageConfig.value ? '状态未知' : '可进入')
    : (feishuEnabled.value ? '已启用' : '未启用')
  const feishuTone = feishuEnabled.value ? 'text-emerald-600' : 'text-slate-500'
  const casdoorStatus = casdoorEnabled.value === null
    ? (canManageConfig.value ? '状态未知' : '可进入')
    : (casdoorEnabled.value ? '已就绪' : '未完成')
  const casdoorTone = casdoorEnabled.value ? 'text-emerald-600' : 'text-slate-500'

  return [
    {
      key: 'casdoor',
      name: 'OAuth / OIDC',
      summary: '第三方单点登录、账号绑定、OIDC 参数托管',
      status: casdoorStatus,
      tone: casdoorTone,
      clickAction: 'navigate',
      path: '/admin/integrations/oauth',
    },
    {
      key: 'feishu',
      name: '飞书',
      summary: 'OAuth 登录、管理员组同步、Bitable 映射',
      status: feishuStatus,
      tone: feishuTone,
      clickAction: 'navigate',
      path: '/admin/integrations/feishu',
    },
    {
      key: 'dingtalk',
      name: '钉钉',
      summary: '预留扩展位（统一接入模型）',
      status: '规划中',
      tone: 'text-slate-500',
      clickAction: 'coming_soon',
    },
    {
      key: 'wecom',
      name: '企业微信',
      summary: '预留扩展位（统一接入模型）',
      status: '规划中',
      tone: 'text-slate-500',
      clickAction: 'coming_soon',
    },
  ]
})

function clearFeedback() {
  errorText.value = ''
  infoText.value = ''
}

function setError(message: string) {
  errorText.value = message
}

function setInfo(message: string) {
  infoText.value = message
}

async function loadPermissions() {
  loadingPermissions.value = true
  try {
    const data = await requestApi<AuthMeResult>(endpoint('/auth/me'), {}, '权限加载失败，请先登录。')
    permissions.value = data.user.platformPermissions || []
  }
  catch (error: any) {
    permissions.value = []
    setError(String(error?.data?.message || '权限加载失败，请先登录。'))
  }
  finally {
    loadingPermissions.value = false
  }
}

async function loadFeishuStatus() {
  if (!canManageConfig.value) {
    feishuEnabled.value = null
    return
  }

  loadingFeishuStatus.value = true
  try {
    const data = await requestApi<FeishuIntegrationConfig>(endpoint('/admin/integrations/feishu/config'), {}, '飞书状态加载失败。')
    feishuEnabled.value = Boolean(data.enabled)
  }
  catch {
    feishuEnabled.value = null
  }
  finally {
    loadingFeishuStatus.value = false
  }
}

async function loadCasdoorStatus() {
  if (!canManageConfig.value) {
    casdoorEnabled.value = null
    return
  }

  loadingCasdoorStatus.value = true
  try {
    const data = await requestApi<CasdoorIntegrationConfig>(endpoint('/admin/integrations/oauth/config'), {}, 'OAuth / OIDC 状态加载失败。')
    casdoorEnabled.value = isCasdoorConfigReady(data)
  }
  catch {
    casdoorEnabled.value = null
  }
  finally {
    loadingCasdoorStatus.value = false
  }
}

async function initializePage() {
  clearFeedback()
  await loadPermissions()
  if (!canAccessPage.value)
    return
  await Promise.all([
    loadCasdoorStatus(),
    loadFeishuStatus(),
  ])
}

async function openCard(card: IntegrationCard) {
  clearFeedback()
  if (card.clickAction === 'navigate' && card.path) {
    await navigateTo(card.path)
    return
  }
  setInfo(`${card.name}集成正在规划中，敬请期待。`)
}

onMounted(initializePage)
</script>

<template>
  <NuxtPage v-if="!isDirectoryRoute" />

  <div v-else class="text-[11px] space-y-3">
    <section class="p-3 border border-slate-200 bg-white">
      <h1 class="text-[13px] text-slate-900 tracking-tight font-bold uppercase">
        集成中心
      </h1>
      <p class="text-[11px] text-slate-500 mt-1">
        统一管理第三方登录、组织同步与外部数据映射，按集成模块独立进入配置页。
      </p>
    </section>

    <section v-if="loadingAny" class="p-3 border border-slate-200 bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <template v-else>
      <section v-if="errorText" class="text-rose-600 p-3 border border-rose-200 bg-rose-50">
        {{ errorText }}
      </section>
      <section v-if="infoText" class="text-amber-700 p-3 border border-amber-200 bg-amber-50">
        {{ infoText }}
      </section>

      <section
        v-if="!canAccessPage"
        class="text-rose-600 p-3 border border-rose-200 bg-rose-50"
      >
        403：当前账号无集成中心权限。需要 `role.assign` 或 `contest.write`。
      </section>

      <section v-else class="border border-slate-200 bg-white overflow-hidden">
        <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
          Integrations
        </div>

        <div class="p-3 gap-2 grid md:grid-cols-3">
          <button
            v-for="card in integrationCards"
            :key="card.key"
            type="button"
            class="p-3 text-left border border-slate-200 rounded bg-slate-50 transition-colors hover:bg-slate-100"
            @click="openCard(card)"
          >
            <p class="text-[12px] text-slate-900 font-semibold m-0">
              {{ card.name }}
            </p>
            <p class="text-[10px] text-slate-500 m-0 mt-1">
              {{ card.summary }}
            </p>
            <div class="mt-2 flex items-center justify-between">
              <p class="text-[11px] font-semibold m-0" :class="card.tone">
                {{ card.status }}
              </p>
              <p class="text-[10px] text-slate-500 m-0">
                {{ card.clickAction === 'navigate' ? '进入配置' : '敬请期待' }}
              </p>
            </div>
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

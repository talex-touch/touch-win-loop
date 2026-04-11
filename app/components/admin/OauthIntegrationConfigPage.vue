<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  CasdoorIntegrationConfig,
  OAuthProtocolMode,
  PlatformPermission,
} from '~~/shared/types/domain'

type SecretMode = 'keep' | 'replace' | 'clear'

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

const loadingPermissions = ref(true)
const loadingConfig = ref(false)
const savingConfig = ref(false)
const permissions = ref<PlatformPermission[]>([])
const config = ref<CasdoorIntegrationConfig | null>(null)

const errorText = ref('')
const successText = ref('')

const configForm = reactive({
  enabled: false,
  displayName: '第三方 OAuth',
  protocolMode: 'oidc_discovery' as OAuthProtocolMode,
  issuer: '',
  authorizeEndpoint: '',
  tokenEndpoint: '',
  userinfoEndpoint: '',
  clientId: '',
  scope: 'openid profile email',
  redirectUri: '',
  clientSecretMode: 'keep' as SecretMode,
  clientSecret: '',
})

const protocolModeOptions: Array<{ label: string, value: OAuthProtocolMode }> = [
  { label: 'OIDC discovery', value: 'oidc_discovery' },
  { label: 'OAuth2 手动端点', value: 'oauth2_manual' },
]

const canManageConfig = computed(() => permissions.value.includes('role.assign'))
const loadingAny = computed(() => loadingPermissions.value || loadingConfig.value)
const isManualProtocolMode = computed(() => configForm.protocolMode === 'oauth2_manual')
const configReady = computed(() => {
  const hasClientSecret = configForm.clientSecretMode === 'replace'
    ? Boolean(configForm.clientSecret.trim())
    : configForm.clientSecretMode === 'clear'
      ? false
      : Boolean(config.value?.clientSecretConfigured)

  const hasProviderConfig = configForm.protocolMode === 'oauth2_manual'
    ? Boolean(
        configForm.authorizeEndpoint.trim()
        && configForm.tokenEndpoint.trim()
        && configForm.userinfoEndpoint.trim(),
      )
    : Boolean(configForm.issuer.trim())

  return Boolean(
    configForm.enabled
    && hasProviderConfig
    && configForm.clientId.trim()
    && hasClientSecret
    && configForm.redirectUri.trim(),
  )
})

function setError(message: string) {
  errorText.value = message
}

function setSuccess(message: string) {
  successText.value = message
}

function clearFeedback() {
  errorText.value = ''
  successText.value = ''
}

function resetSecretInputs() {
  configForm.clientSecretMode = 'keep'
  configForm.clientSecret = ''
}

function fillConfigForm(payload: CasdoorIntegrationConfig) {
  configForm.enabled = Boolean(payload.enabled)
  configForm.displayName = payload.displayName || '第三方 OAuth'
  configForm.protocolMode = payload.protocolMode || 'oidc_discovery'
  configForm.issuer = payload.issuer || ''
  configForm.authorizeEndpoint = payload.authorizeEndpoint || ''
  configForm.tokenEndpoint = payload.tokenEndpoint || ''
  configForm.userinfoEndpoint = payload.userinfoEndpoint || ''
  configForm.clientId = payload.clientId || ''
  configForm.scope = payload.scope || 'openid profile email'
  configForm.redirectUri = payload.redirectUri || ''
  resetSecretInputs()
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

async function loadConfig() {
  if (!canManageConfig.value) {
    config.value = null
    return
  }

  loadingConfig.value = true
  try {
    const data = await requestApi<CasdoorIntegrationConfig>(endpoint('/admin/integrations/oauth/config'), {}, 'OAuth / OIDC 集成配置加载失败。')
    config.value = data
    fillConfigForm(data)
  }
  catch (error: any) {
    config.value = null
    setError(String(error?.data?.message || 'OAuth / OIDC 集成配置加载失败。'))
  }
  finally {
    loadingConfig.value = false
  }
}

async function initializePage() {
  clearFeedback()
  await loadPermissions()
  if (!canManageConfig.value)
    return
  await loadConfig()
}

async function saveConfig() {
  clearFeedback()
  savingConfig.value = true
  try {
    const data = await requestApi<CasdoorIntegrationConfig>(
      endpoint('/admin/integrations/oauth/config'),
      {
        method: 'PATCH',
        body: {
          enabled: Boolean(configForm.enabled),
          displayName: configForm.displayName.trim() || '第三方 OAuth',
          protocolMode: configForm.protocolMode,
          issuer: configForm.issuer.trim(),
          authorizeEndpoint: configForm.authorizeEndpoint.trim(),
          tokenEndpoint: configForm.tokenEndpoint.trim(),
          userinfoEndpoint: configForm.userinfoEndpoint.trim(),
          clientId: configForm.clientId.trim(),
          scope: configForm.scope.trim() || 'openid profile email',
          redirectUri: configForm.redirectUri.trim(),
          clientSecretMode: configForm.clientSecretMode,
          clientSecret: configForm.clientSecret,
        },
      },
      'OAuth / OIDC 集成配置保存失败。',
    )
    config.value = data
    fillConfigForm(data)
    setSuccess('OAuth / OIDC 集成配置已保存。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || 'OAuth / OIDC 集成配置保存失败。'))
  }
  finally {
    savingConfig.value = false
  }
}

onMounted(initializePage)
</script>

<template>
  <div class="text-[11px] space-y-3">
    <section class="p-3 border border-slate-200 bg-white flex gap-3 items-center justify-between">
      <div>
        <NuxtLink to="/admin/integrations" class="text-[10px] text-slate-500 hover:text-slate-700">
          返回集成中心
        </NuxtLink>
        <h1 class="text-[13px] text-slate-900 tracking-tight font-bold mt-1 uppercase">
          OAuth / OIDC 集成
        </h1>
        <p class="text-[11px] text-slate-500 mt-1">
          统一在后台维护第三方 OAuth / OIDC 登录参数。支持 OIDC discovery 和手动填写 OAuth2 端点两种模式。
        </p>
      </div>

      <div class="flex gap-2 items-center">
        <a-button size="small" type="outline" :loading="loadingConfig" @click="loadConfig">
          刷新
        </a-button>
        <a-button size="small" type="primary" :loading="savingConfig" :disabled="!canManageConfig" @click="saveConfig">
          保存
        </a-button>
      </div>
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
      <section v-if="successText" class="text-emerald-700 p-3 border border-emerald-200 bg-emerald-50">
        {{ successText }}
      </section>
      <section v-if="!canManageConfig" class="text-rose-600 p-3 border border-rose-200 bg-rose-50">
        403：当前账号无 OAuth / OIDC 集成配置权限。需要 `role.assign`。
      </section>

      <template v-else>
        <section class="p-3 border border-slate-200 bg-white space-y-3">
          <div class="flex gap-3 items-center justify-between">
            <h2 class="text-[12px] text-slate-900 font-bold m-0">
              基础配置
            </h2>
            <a-tag size="small" :color="configReady ? 'green' : 'gray'">
              {{ configReady ? '已就绪' : '未完成' }}
            </a-tag>
          </div>

          <div class="gap-3 grid md:grid-cols-2">
            <label class="block space-y-1">
              <span class="text-[11px] text-slate-600">启用登录</span>
              <a-switch v-model="configForm.enabled" size="small" />
            </label>

            <label class="block space-y-1">
              <span class="text-[11px] text-slate-600">显示名称</span>
              <a-input v-model="configForm.displayName" allow-clear size="small" placeholder="第三方 OAuth" />
            </label>

            <label class="block space-y-1">
              <span class="text-[11px] text-slate-600">协议模式</span>
              <a-select v-model="configForm.protocolMode" size="small">
                <a-option v-for="item in protocolModeOptions" :key="item.value" :value="item.value">
                  {{ item.label }}
                </a-option>
              </a-select>
            </label>

            <div class="text-[11px] text-slate-600">
              client secret 状态：
              <span class="text-slate-900 font-semibold">{{ config?.clientSecretConfigured ? '已配置' : '未配置' }}</span>
            </div>

            <label v-if="!isManualProtocolMode" class="block space-y-1">
              <span class="text-[11px] text-slate-600">Issuer</span>
              <a-input v-model="configForm.issuer" allow-clear size="small" placeholder="https://sso.example.com" />
            </label>

            <label v-if="isManualProtocolMode" class="block space-y-1">
              <span class="text-[11px] text-slate-600">Authorize Endpoint</span>
              <a-input v-model="configForm.authorizeEndpoint" allow-clear size="small" placeholder="https://accounts.example.com/oauth2/authorize" />
            </label>

            <label v-if="isManualProtocolMode" class="block space-y-1">
              <span class="text-[11px] text-slate-600">Token Endpoint</span>
              <a-input v-model="configForm.tokenEndpoint" allow-clear size="small" placeholder="https://accounts.example.com/oauth2/token" />
            </label>

            <label v-if="isManualProtocolMode" class="block space-y-1">
              <span class="text-[11px] text-slate-600">Userinfo Endpoint</span>
              <a-input v-model="configForm.userinfoEndpoint" allow-clear size="small" placeholder="https://accounts.example.com/oauth2/userinfo" />
            </label>

            <label class="block space-y-1">
              <span class="text-[11px] text-slate-600">Client ID</span>
              <a-input v-model="configForm.clientId" allow-clear size="small" placeholder="winloop-client" />
            </label>

            <label class="block space-y-1">
              <span class="text-[11px] text-slate-600">Scope</span>
              <a-input v-model="configForm.scope" allow-clear size="small" placeholder="openid profile email" />
            </label>

            <label class="block space-y-1">
              <span class="text-[11px] text-slate-600">Redirect URI</span>
              <a-input v-model="configForm.redirectUri" allow-clear size="small" placeholder="https://domain/api/auth/oauth/callback" />
            </label>
          </div>

          <p class="text-[11px] text-slate-500 m-0">
            <template v-if="isManualProtocolMode">
              手动端点模式适用于只提供标准 OAuth2 地址的第三方平台，需要分别填写 authorize、token、userinfo 三个端点。
            </template>
            <template v-else>
              OIDC discovery 模式会通过 issuer 获取标准 metadata，并优先使用 metadata 中的授权端点。
            </template>
          </p>

          <p class="text-[11px] text-slate-500 m-0">
            Redirect URI 请填写第三方 OAuth 应用中登记的回调地址，例如 `https://你的域名/api/auth/oauth/callback`。
          </p>
        </section>

        <section class="p-3 border border-slate-200 bg-white space-y-3">
          <h2 class="text-[12px] text-slate-900 font-bold m-0">
            Client Secret
          </h2>

          <div class="flex gap-4 items-center">
            <label class="inline-flex gap-2 items-center">
              <input v-model="configForm.clientSecretMode" type="radio" value="keep">
              <span>保留</span>
            </label>
            <label class="inline-flex gap-2 items-center">
              <input v-model="configForm.clientSecretMode" type="radio" value="replace">
              <span>替换</span>
            </label>
            <label class="inline-flex gap-2 items-center">
              <input v-model="configForm.clientSecretMode" type="radio" value="clear">
              <span>清空</span>
            </label>
          </div>

          <label v-if="configForm.clientSecretMode === 'replace'" class="block space-y-1">
            <span class="text-[11px] text-slate-600">新的 Client Secret</span>
            <a-input-password v-model="configForm.clientSecret" size="small" placeholder="输入新的 client secret" />
          </label>

          <p class="text-[11px] text-slate-500 m-0">
            替换密钥需要 `WINLOOP_CONFIG_MASTER_KEY`，保存后将按现有加密策略入库。
          </p>
        </section>

        <section class="p-3 border border-slate-200 bg-white">
          <p class="text-[11px] text-slate-600 m-0">
            最近更新：{{ config?.updatedAt || '-' }} · 更新人：{{ config?.updatedByUserId || '-' }}
          </p>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  CasdoorIntegrationConfig,
  PlatformPermission,
} from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

type SecretMode = 'keep' | 'replace' | 'clear'

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const loadingPermissions = ref(true)
const loadingConfig = ref(false)
const savingConfig = ref(false)
const permissions = ref<PlatformPermission[]>([])
const config = ref<CasdoorIntegrationConfig | null>(null)

const errorText = ref('')
const successText = ref('')

const configForm = reactive({
  enabled: false,
  issuer: '',
  clientId: '',
  scope: 'openid profile email',
  redirectUri: '',
  clientSecretMode: 'keep' as SecretMode,
  clientSecret: '',
})

const canManageConfig = computed(() => permissions.value.includes('role.assign'))
const loadingAny = computed(() => loadingPermissions.value || loadingConfig.value)
const configReady = computed(() => {
  const hasClientSecret = configForm.clientSecretMode === 'replace'
    ? Boolean(configForm.clientSecret.trim())
    : configForm.clientSecretMode === 'clear'
      ? false
      : Boolean(config.value?.clientSecretConfigured)

  return Boolean(
    configForm.enabled
    && configForm.issuer.trim()
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
  configForm.issuer = payload.issuer || ''
  configForm.clientId = payload.clientId || ''
  configForm.scope = payload.scope || 'openid profile email'
  configForm.redirectUri = payload.redirectUri || ''
  resetSecretInputs()
}

async function loadPermissions() {
  loadingPermissions.value = true
  try {
    const response = await $fetch<ApiResponse<AuthMeResult>>(endpoint('/auth/me'))
    permissions.value = response.data.user.platformPermissions || []
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
    const response = await $fetch<ApiResponse<CasdoorIntegrationConfig>>(endpoint('/admin/integrations/casdoor/config'))
    config.value = response.data
    fillConfigForm(response.data)
  }
  catch (error: any) {
    config.value = null
    setError(String(error?.data?.message || 'Casdoor 集成配置加载失败。'))
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
    const response = await $fetch<ApiResponse<CasdoorIntegrationConfig>>(endpoint('/admin/integrations/casdoor/config'), {
      method: 'PATCH',
      body: {
        enabled: Boolean(configForm.enabled),
        issuer: configForm.issuer.trim(),
        clientId: configForm.clientId.trim(),
        scope: configForm.scope.trim() || 'openid profile email',
        redirectUri: configForm.redirectUri.trim(),
        clientSecretMode: configForm.clientSecretMode,
        clientSecret: configForm.clientSecret,
      },
    })
    config.value = response.data
    fillConfigForm(response.data)
    setSuccess('Casdoor 集成配置已保存。')
  }
  catch (error: any) {
    setError(String(error?.data?.message || 'Casdoor 集成配置保存失败。'))
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
          Casdoor 集成
        </h1>
        <p class="text-[11px] text-slate-500 mt-1">
          统一在后台维护 Casdoor 登录参数，不再读取专用环境变量。这里保存的是 Casdoor 单点登录所需的 issuer、client 和回调地址。
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
        403：当前账号无 Casdoor 集成配置权限。需要 `role.assign`。
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

            <div class="text-[11px] text-slate-600">
              client secret 状态：
              <span class="text-slate-900 font-semibold">{{ config?.clientSecretConfigured ? '已配置' : '未配置' }}</span>
            </div>

            <label class="block space-y-1">
              <span class="text-[11px] text-slate-600">Issuer</span>
              <a-input v-model="configForm.issuer" allow-clear size="small" placeholder="https://casdoor.example.com" />
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
              <a-input v-model="configForm.redirectUri" allow-clear size="small" placeholder="https://domain/api/auth/casdoor/callback" />
            </label>
          </div>

          <p class="text-[11px] text-slate-500 m-0">
            Redirect URI 请填写 Casdoor 应用中登记的回调地址，例如 `https://你的域名/api/auth/casdoor/callback`。启用状态以“开关开启 + 必填项完整”为准。
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

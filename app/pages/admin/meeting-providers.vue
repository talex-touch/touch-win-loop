<script setup lang="ts">
import type { ApiResponse } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

type SecretMode = 'keep' | 'replace' | 'clear'

interface MeetingProvidersPayload {
  rtc: {
    provider: string
    serverUrl: string
    embedBaseUrl: string
    roomPrefix: string
    apiKeyConfigured: boolean
    apiSecretConfigured: boolean
    webhookSecretConfigured: boolean
  }
  asr: {
    provider: string
    serviceUrl: string
    apiKeyConfigured: boolean
    webhookSecretConfigured: boolean
  }
  worker: {
    enabled: boolean
    intervalMs: number
    batchSize: number
    maxAttempts: number
  }
  health: {
    ready: boolean
    rtcIssues: string[]
    asrIssues: string[]
    issues: string[]
  }
  masterKeyReady: boolean
  overrideState: {
    rtcApiKeyOverridden: boolean
    rtcApiSecretOverridden: boolean
    rtcWebhookSecretOverridden: boolean
    asrApiKeyOverridden: boolean
    asrWebhookSecretOverridden: boolean
    updatedAt: string
    updatedByUserId: string
  }
  configSource: {
    rtc: 'env' | 'override'
    asr: 'env' | 'override'
    worker: 'env' | 'override'
  }
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const loading = ref(true)
const saving = ref(false)
const errorText = ref('')
const successText = ref('')
const payload = ref<MeetingProvidersPayload | null>(null)

const form = reactive({
  rtcProvider: '',
  rtcServerUrl: '',
  rtcEmbedBaseUrl: '',
  rtcRoomPrefix: 'winloop',
  rtcApiKeyMode: 'keep' as SecretMode,
  rtcApiKey: '',
  rtcApiSecretMode: 'keep' as SecretMode,
  rtcApiSecret: '',
  rtcWebhookSecretMode: 'keep' as SecretMode,
  rtcWebhookSecret: '',
  asrProvider: '',
  asrServiceUrl: '',
  asrApiKeyMode: 'keep' as SecretMode,
  asrApiKey: '',
  asrWebhookSecretMode: 'keep' as SecretMode,
  asrWebhookSecret: '',
  workerEnabled: true,
  workerIntervalMs: 5000,
  workerBatchSize: 6,
  workerMaxAttempts: 5,
})

function formatTime(raw: string): string {
  const text = String(raw || '').trim()
  if (!text)
    return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime()))
    return text
  return date.toLocaleString('zh-CN', { hour12: false })
}

function configSourceLabel(value: 'env' | 'override' | ''): string {
  return value === 'override' ? '后台覆盖' : '环境默认'
}

function applyPayload(nextPayload: MeetingProvidersPayload): void {
  payload.value = nextPayload

  form.rtcProvider = nextPayload.rtc.provider || ''
  form.rtcServerUrl = nextPayload.rtc.serverUrl || ''
  form.rtcEmbedBaseUrl = nextPayload.rtc.embedBaseUrl || ''
  form.rtcRoomPrefix = nextPayload.rtc.roomPrefix || 'winloop'
  form.rtcApiKeyMode = 'keep'
  form.rtcApiKey = ''
  form.rtcApiSecretMode = 'keep'
  form.rtcApiSecret = ''
  form.rtcWebhookSecretMode = 'keep'
  form.rtcWebhookSecret = ''

  form.asrProvider = nextPayload.asr.provider || ''
  form.asrServiceUrl = nextPayload.asr.serviceUrl || ''
  form.asrApiKeyMode = 'keep'
  form.asrApiKey = ''
  form.asrWebhookSecretMode = 'keep'
  form.asrWebhookSecret = ''

  form.workerEnabled = Boolean(nextPayload.worker.enabled)
  form.workerIntervalMs = Number(nextPayload.worker.intervalMs || 5000)
  form.workerBatchSize = Number(nextPayload.worker.batchSize || 6)
  form.workerMaxAttempts = Number(nextPayload.worker.maxAttempts || 5)
}

async function loadSettings(showLoading = false) {
  if (showLoading)
    loading.value = true
  errorText.value = ''
  successText.value = ''

  try {
    const response = await fetch(endpoint('/admin/meeting/providers'), {
      credentials: 'include',
    })
    const result = await response.json().catch(() => null) as ApiResponse<MeetingProvidersPayload> | null
    if (!response.ok || !result || result.code !== 0)
      throw new Error(String(result?.message || '会议服务配置加载失败。'))
    applyPayload(result.data)
  }
  catch (error: any) {
    payload.value = null
    errorText.value = String(error?.data?.message || error?.message || '会议服务配置加载失败。')
  }
  finally {
    loading.value = false
  }
}

async function saveSettings() {
  saving.value = true
  errorText.value = ''
  successText.value = ''

  try {
    const response = await fetch(endpoint('/admin/meeting/providers'), {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rtc: {
          provider: form.rtcProvider,
          serverUrl: form.rtcServerUrl,
          embedBaseUrl: form.rtcEmbedBaseUrl,
          roomPrefix: form.rtcRoomPrefix,
          apiKeyMode: form.rtcApiKeyMode,
          apiKey: form.rtcApiKey,
          apiSecretMode: form.rtcApiSecretMode,
          apiSecret: form.rtcApiSecret,
          webhookSecretMode: form.rtcWebhookSecretMode,
          webhookSecret: form.rtcWebhookSecret,
        },
        asr: {
          provider: form.asrProvider,
          serviceUrl: form.asrServiceUrl,
          apiKeyMode: form.asrApiKeyMode,
          apiKey: form.asrApiKey,
          webhookSecretMode: form.asrWebhookSecretMode,
          webhookSecret: form.asrWebhookSecret,
        },
        worker: {
          enabled: Boolean(form.workerEnabled),
          intervalMs: Number(form.workerIntervalMs || 5000),
          batchSize: Number(form.workerBatchSize || 6),
          maxAttempts: Number(form.workerMaxAttempts || 5),
        },
      }),
    })
    const result = await response.json().catch(() => null) as ApiResponse<MeetingProvidersPayload> | null
    if (!response.ok || !result || result.code !== 0)
      throw new Error(String(result?.message || '会议服务配置保存失败。'))
    applyPayload(result.data)
    successText.value = '会议服务配置已保存。后续新建 / 启动 / 加入会议会直接使用后台生效配置。'
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || error?.message || '会议服务配置保存失败。')
  }
  finally {
    saving.value = false
  }
}

onMounted(async () => {
  await loadSettings(true)
})
</script>

<template>
  <div class="text-[11px] space-y-3">
    <section class="p-3 border border-slate-200 bg-white">
      <div class="flex gap-3 items-center justify-between">
        <div>
          <h1 class="text-[13px] text-slate-900 tracking-tight font-bold m-0 uppercase">
            会议服务配置
          </h1>
          <p class="text-[11px] text-slate-500 mb-0 mt-1">
            会议业务配置改为后台维护；不再默认回退 mock。仅 `WINLOOP_CONFIG_MASTER_KEY` 继续作为密钥加密根密钥保留在环境变量中。
          </p>
        </div>
        <div class="flex gap-2 items-center">
          <a-button size="small" type="outline" :loading="loading" @click="loadSettings(false)">
            刷新
          </a-button>
          <a-button size="small" type="primary" :loading="saving" @click="saveSettings">
            保存
          </a-button>
        </div>
      </div>
    </section>

    <section v-if="loading" class="p-3 border border-slate-200 bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="10" />
      </a-skeleton>
    </section>

    <section v-else-if="errorText" class="text-rose-600 p-3 border border-rose-200 bg-rose-50">
      {{ errorText }}
    </section>

    <template v-else-if="payload">
      <section v-if="successText" class="text-emerald-700 p-3 border border-emerald-200 bg-emerald-50">
        {{ successText }}
      </section>

      <section
        class="p-3 border"
        :class="payload.health.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'"
      >
        <p class="font-semibold m-0">
          {{ payload.health.ready ? '会议链路已就绪' : '会议链路未就绪' }}
        </p>
        <p class="m-0 mt-1">
          {{
            payload.health.ready
              ? '现在新建会议会直接走 LiveKit / ASR 真配置。'
              : '如果此时发起会议，系统会直接返回配置错误，不再回退 mock。'
          }}
        </p>
        <ul v-if="payload.health.issues.length > 0" class="mt-2 pl-4 list-disc space-y-1">
          <li v-for="issue in payload.health.issues" :key="issue">
            {{ issue }}
          </li>
        </ul>
      </section>

      <section v-if="!payload.masterKeyReady" class="text-amber-800 p-3 border border-amber-200 bg-amber-50">
        未检测到 `WINLOOP_CONFIG_MASTER_KEY`。当前仍可保存非密钥字段，但不能替换 RTC / ASR 的 secret。
      </section>

      <section class="p-3 border border-slate-200 bg-white space-y-3">
        <div class="flex gap-3 items-center justify-between">
          <h2 class="text-[12px] text-slate-900 font-bold m-0">
            RTC（LiveKit）
          </h2>
          <a-tag size="small" :color="payload.configSource.rtc === 'override' ? 'green' : 'gray'">
            {{ configSourceLabel(payload.configSource.rtc) }}
          </a-tag>
        </div>
        <div class="gap-3 grid md:grid-cols-2">
          <label class="block space-y-1">
            <span class="text-slate-600">Provider</span>
            <input v-model="form.rtcProvider" class="admin-input" placeholder="livekit">
          </label>
          <label class="block space-y-1">
            <span class="text-slate-600">Room Prefix</span>
            <input v-model="form.rtcRoomPrefix" class="admin-input" placeholder="winloop">
          </label>
          <label class="block space-y-1 md:col-span-2">
            <span class="text-slate-600">Server URL</span>
            <input v-model="form.rtcServerUrl" class="admin-input" placeholder="https://livekit.example.com">
          </label>
          <label class="block space-y-1 md:col-span-2">
            <span class="text-slate-600">Embed Base URL（可选）</span>
            <input v-model="form.rtcEmbedBaseUrl" class="admin-input" placeholder="https://app.example.com/meeting/embed">
          </label>
        </div>
        <div class="gap-3 grid md:grid-cols-3">
          <label class="block space-y-1">
            <span class="text-slate-600">API Key</span>
            <select v-model="form.rtcApiKeyMode" class="admin-select">
              <option value="keep">保持</option>
              <option value="replace">替换</option>
              <option value="clear">清空</option>
            </select>
            <input v-model="form.rtcApiKey" class="admin-input" :disabled="form.rtcApiKeyMode !== 'replace'" placeholder="仅在替换时填写">
            <span class="text-[10px] text-slate-500">已配置：{{ payload.rtc.apiKeyConfigured ? '是' : '否' }}</span>
          </label>
          <label class="block space-y-1">
            <span class="text-slate-600">API Secret</span>
            <select v-model="form.rtcApiSecretMode" class="admin-select">
              <option value="keep">保持</option>
              <option value="replace">替换</option>
              <option value="clear">清空</option>
            </select>
            <input v-model="form.rtcApiSecret" class="admin-input" :disabled="form.rtcApiSecretMode !== 'replace'" placeholder="仅在替换时填写">
            <span class="text-[10px] text-slate-500">已配置：{{ payload.rtc.apiSecretConfigured ? '是' : '否' }}</span>
          </label>
          <label class="block space-y-1">
            <span class="text-slate-600">Webhook Secret</span>
            <select v-model="form.rtcWebhookSecretMode" class="admin-select">
              <option value="keep">保持</option>
              <option value="replace">替换</option>
              <option value="clear">清空</option>
            </select>
            <input v-model="form.rtcWebhookSecret" class="admin-input" :disabled="form.rtcWebhookSecretMode !== 'replace'" placeholder="仅在替换时填写">
            <span class="text-[10px] text-slate-500">已配置：{{ payload.rtc.webhookSecretConfigured ? '是' : '否' }}</span>
          </label>
        </div>
      </section>

      <section class="p-3 border border-slate-200 bg-white space-y-3">
        <div class="flex gap-3 items-center justify-between">
          <h2 class="text-[12px] text-slate-900 font-bold m-0">
            转写服务（ASR）
          </h2>
          <a-tag size="small" :color="payload.configSource.asr === 'override' ? 'green' : 'gray'">
            {{ configSourceLabel(payload.configSource.asr) }}
          </a-tag>
        </div>
        <div class="gap-3 grid md:grid-cols-2">
          <label class="block space-y-1">
            <span class="text-slate-600">Provider</span>
            <input v-model="form.asrProvider" class="admin-input" placeholder="http">
          </label>
          <label class="block space-y-1">
            <span class="text-slate-600">Service URL</span>
            <input v-model="form.asrServiceUrl" class="admin-input" placeholder="http://127.0.0.1:8090">
          </label>
        </div>
        <div class="gap-3 grid md:grid-cols-2">
          <label class="block space-y-1">
            <span class="text-slate-600">API Key</span>
            <select v-model="form.asrApiKeyMode" class="admin-select">
              <option value="keep">保持</option>
              <option value="replace">替换</option>
              <option value="clear">清空</option>
            </select>
            <input v-model="form.asrApiKey" class="admin-input" :disabled="form.asrApiKeyMode !== 'replace'" placeholder="仅在替换时填写">
            <span class="text-[10px] text-slate-500">已配置：{{ payload.asr.apiKeyConfigured ? '是' : '否' }}</span>
          </label>
          <label class="block space-y-1">
            <span class="text-slate-600">Webhook Secret</span>
            <select v-model="form.asrWebhookSecretMode" class="admin-select">
              <option value="keep">保持</option>
              <option value="replace">替换</option>
              <option value="clear">清空</option>
            </select>
            <input v-model="form.asrWebhookSecret" class="admin-input" :disabled="form.asrWebhookSecretMode !== 'replace'" placeholder="仅在替换时填写">
            <span class="text-[10px] text-slate-500">已配置：{{ payload.asr.webhookSecretConfigured ? '是' : '否' }}</span>
          </label>
        </div>
      </section>

      <section class="p-3 border border-slate-200 bg-white space-y-3">
        <div class="flex gap-3 items-center justify-between">
          <h2 class="text-[12px] text-slate-900 font-bold m-0">
            会议 Worker
          </h2>
          <a-tag size="small" :color="payload.configSource.worker === 'override' ? 'green' : 'gray'">
            {{ configSourceLabel(payload.configSource.worker) }}
          </a-tag>
        </div>
        <div class="gap-3 grid md:grid-cols-4">
          <label class="block space-y-1">
            <span class="text-slate-600">启用</span>
            <a-switch v-model="form.workerEnabled" size="small" />
          </label>
          <label class="block space-y-1">
            <span class="text-slate-600">轮询间隔(ms)</span>
            <a-input-number v-model="form.workerIntervalMs" :min="1000" :max="60000" size="small" />
          </label>
          <label class="block space-y-1">
            <span class="text-slate-600">批次大小</span>
            <a-input-number v-model="form.workerBatchSize" :min="1" :max="50" size="small" />
          </label>
          <label class="block space-y-1">
            <span class="text-slate-600">最大重试</span>
            <a-input-number v-model="form.workerMaxAttempts" :min="1" :max="20" size="small" />
          </label>
        </div>
      </section>

      <section class="p-3 border border-slate-200 bg-white">
        <p class="text-[12px] text-slate-900 font-bold m-0">
          覆盖状态
        </p>
        <p class="text-[11px] text-slate-600 mb-0 mt-2">
          最近更新：{{ formatTime(payload.overrideState.updatedAt) }}；操作人：{{ payload.overrideState.updatedByUserId || '-' }}
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.admin-input,
.admin-select {
  width: 100%;
  min-height: 34px;
  border: 1px solid #cbd5e1;
  border-radius: 0.5rem;
  background: #fff;
  padding: 0.45rem 0.7rem;
  color: #0f172a;
}

.admin-input:disabled,
.admin-select:disabled {
  background: #f8fafc;
  color: #94a3b8;
}
</style>

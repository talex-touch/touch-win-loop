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
    rtc: 'default' | 'override'
    asr: 'default' | 'override'
    worker: 'default' | 'override'
  }
}

interface MeetingProvidersTestProbe {
  provider: string
  endpoint: string
  configured: boolean
  ok: boolean
  statusCode?: number
  latencyMs: number
  detail: string
}

interface MeetingProvidersTestPayload {
  ready: boolean
  testedAt: string
  rtc: MeetingProvidersTestProbe
  asr: MeetingProvidersTestProbe
}

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const errorText = ref('')
const successText = ref('')
const payload = ref<MeetingProvidersPayload | null>(null)
const testErrorText = ref('')
const testResult = ref<MeetingProvidersTestPayload | null>(null)

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

const rtcProviderOptions = [
  { value: '', label: '请选择' },
  { value: 'livekit', label: 'livekit' },
] as const

const asrProviderOptions = [
  { value: '', label: '请选择' },
  { value: 'http', label: 'http' },
  { value: 'openai-compatible', label: 'openai-compatible / Coze / 百炼' },
] as const

const secretModeOptions = [
  { value: 'keep', label: '保持' },
  { value: 'replace', label: '替换' },
  { value: 'clear', label: '清空' },
] as const

function formatTime(raw: string): string {
  const text = String(raw || '').trim()
  if (!text)
    return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime()))
    return text
  return date.toLocaleString('zh-CN', { hour12: false })
}

function configSourceLabel(value: 'default' | 'override' | ''): string {
  return value === 'override' ? '后台已配置' : '内置默认'
}

function applyLocalLiveKitPreset(): void {
  form.rtcProvider = 'livekit'
  form.rtcServerUrl = 'http://127.0.0.1:7880'
  form.rtcRoomPrefix = form.rtcRoomPrefix || 'winloop'
}

function applyLocalAsrBridgePreset(): void {
  form.asrProvider = 'http'
  form.asrServiceUrl = 'http://127.0.0.1:8790'
}

function applyOpenAiCompatibleAsrPreset(): void {
  form.asrProvider = 'openai-compatible'
  form.asrServiceUrl = ''
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

function resetTestState(): void {
  testErrorText.value = ''
  testResult.value = null
}

function buildRequestBody() {
  return {
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
  }
}

async function loadSettings(showLoading = false) {
  if (showLoading)
    loading.value = true
  errorText.value = ''
  successText.value = ''
  resetTestState()

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
  testErrorText.value = ''

  try {
    const response = await fetch(endpoint('/admin/meeting/providers'), {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildRequestBody()),
    })
    const result = await response.json().catch(() => null) as ApiResponse<MeetingProvidersPayload> | null
    if (!response.ok || !result || result.code !== 0)
      throw new Error(String(result?.message || '会议服务配置保存失败。'))
    applyPayload(result.data)
    testResult.value = null
    successText.value = '会议服务配置已保存。后续新建 / 启动 / 加入会议会直接使用后台生效配置。'
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || error?.message || '会议服务配置保存失败。')
  }
  finally {
    saving.value = false
  }
}

async function runConnectivityTest() {
  testing.value = true
  errorText.value = ''
  successText.value = ''
  testErrorText.value = ''

  try {
    const response = await fetch(endpoint('/admin/meeting/providers/test'), {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildRequestBody()),
    })
    const result = await response.json().catch(() => null) as ApiResponse<MeetingProvidersTestPayload> | null
    if (!response.ok || !result || result.code !== 0)
      throw new Error(String(result?.message || '会议服务连通性测试失败。'))
    testResult.value = result.data
  }
  catch (error: any) {
    testResult.value = null
    testErrorText.value = String(error?.data?.message || error?.message || '会议服务连通性测试失败。')
  }
  finally {
    testing.value = false
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
          <a-button size="small" type="outline" :loading="testing" @click="runConnectivityTest">
            测试连通性
          </a-button>
          <a-button size="small" type="primary" :loading="saving" @click="saveSettings">
            保存
          </a-button>
        </div>
      </div>
    </section>

    <section class="p-3 border border-slate-200 bg-slate-50 space-y-3">
      <div class="gap-3 grid md:grid-cols-2">
        <article class="p-3 border border-slate-200 rounded-lg bg-white">
          <p class="text-[12px] text-slate-900 font-bold m-0">
            当前方案摘要
          </p>
          <ul class="text-[11px] text-slate-700 mb-0 mt-2 pl-4 list-disc space-y-1">
            <li>会议运行时配置以后台为唯一来源，不再默认回退 `mock`。</li>
            <li>站内 Web 客户端 v1 正式只支持 `livekit` 真媒体链路。</li>
            <li>ASR 当前支持 `http` 与 `openai-compatible` 两条接法，Coze / 百炼通过 AI 场景 `meeting_asr` 绑定进入。</li>
            <li>会后固定通过 `transcript_finalize / meeting_summary / recording_finalize` 生成纪要与录制资源。</li>
          </ul>
        </article>

        <article class="p-3 border border-slate-200 rounded-lg bg-white">
          <p class="text-[12px] text-slate-900 font-bold m-0">
            管理员操作顺序
          </p>
          <ol class="text-[11px] text-slate-700 mb-0 mt-2 pl-4 list-decimal space-y-1">
            <li>先准备 LiveKit 基础设施，再选择 ASR 路线。</li>
            <li>在本页保存 RTC / ASR / worker 配置。</li>
            <li>点击“测试连通性”，确保 RTC 与 ASR 探针都通过。</li>
            <li>回到项目页验证创建、加入、结束会议。</li>
            <li>结束后确认录制资源与纪要资源自动补齐。</li>
          </ol>
        </article>
      </div>
      <p class="text-[11px] text-slate-500 m-0">
        当前已在本地 sandbox 验证：会议可稳定加入站内 Web 客户端，结束后能自动完成纪要与录制资源沉淀。若你使用的是纯 `http` bridge 协议模式，仍可能只有音频帧上行而没有真实字幕，这时需要再接真实转写后端，或切换到 `openai-compatible` 并在 `meeting_asr` 绑定 OpenAI 兼容、Coze 语音或百炼 ASR Provider。
      </p>
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

      <section v-if="testErrorText" class="text-rose-600 p-3 border border-rose-200 bg-rose-50">
        {{ testErrorText }}
      </section>

      <section
        v-if="testResult"
        class="p-3 border"
        :class="testResult.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'"
      >
        <div class="flex gap-3 items-center justify-between">
          <div>
            <p class="font-semibold m-0">
              {{ testResult.ready ? '会议服务联通测试通过' : '会议服务联通测试未通过' }}
            </p>
            <p class="m-0 mt-1">
              最近测试时间：{{ formatTime(testResult.testedAt) }}
            </p>
          </div>
          <a-tag size="small" :color="testResult.ready ? 'green' : 'orange'">
            {{ testResult.ready ? 'READY' : 'CHECK REQUIRED' }}
          </a-tag>
        </div>
        <div class="mt-3 gap-3 grid md:grid-cols-2">
          <article class="text-slate-800 p-3 border border-current/10 rounded-lg bg-white/70">
            <div class="flex gap-3 items-center justify-between">
              <p class="font-semibold m-0">
                RTC / {{ testResult.rtc.provider || '未配置' }}
              </p>
              <a-tag size="small" :color="testResult.rtc.ok ? 'green' : (testResult.rtc.configured ? 'orange' : 'red')">
                {{ testResult.rtc.ok ? 'PASS' : (testResult.rtc.configured ? 'FAIL' : 'CONFIG') }}
              </a-tag>
            </div>
            <p class="text-[11px] text-slate-500 m-0 mt-2 break-all">
              {{ testResult.rtc.endpoint || '未提供探针地址' }}
            </p>
            <p class="text-[11px] text-slate-700 m-0 mt-2">
              {{ testResult.rtc.detail }}
            </p>
            <p class="text-[10px] text-slate-500 m-0 mt-2">
              延迟 {{ testResult.rtc.latencyMs }} ms<span v-if="testResult.rtc.statusCode"> / HTTP {{ testResult.rtc.statusCode }}</span>
            </p>
          </article>

          <article class="text-slate-800 p-3 border border-current/10 rounded-lg bg-white/70">
            <div class="flex gap-3 items-center justify-between">
              <p class="font-semibold m-0">
                ASR / {{ testResult.asr.provider || '未配置' }}
              </p>
              <a-tag size="small" :color="testResult.asr.ok ? 'green' : (testResult.asr.configured ? 'orange' : 'red')">
                {{ testResult.asr.ok ? 'PASS' : (testResult.asr.configured ? 'FAIL' : 'CONFIG') }}
              </a-tag>
            </div>
            <p class="text-[11px] text-slate-500 m-0 mt-2 break-all">
              {{ testResult.asr.endpoint || '未提供探针地址' }}
            </p>
            <p class="text-[11px] text-slate-700 m-0 mt-2">
              {{ testResult.asr.detail }}
            </p>
            <p class="text-[10px] text-slate-500 m-0 mt-2">
              延迟 {{ testResult.asr.latencyMs }} ms<span v-if="testResult.asr.statusCode"> / HTTP {{ testResult.asr.statusCode }}</span>
            </p>
          </article>
        </div>
      </section>

      <section v-if="!payload.masterKeyReady" class="text-amber-800 p-3 border border-amber-200 bg-amber-50">
        未检测到 `WINLOOP_CONFIG_MASTER_KEY`。当前保存的 RTC / ASR secret 将以明文形式托管，建议后续补齐根密钥后再重新保存一次完成加密。
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
        <div class="flex flex-wrap gap-2">
          <a-button size="small" type="outline" @click="applyLocalLiveKitPreset">
            填入本机 LiveKit
          </a-button>
        </div>
        <div class="gap-3 grid md:grid-cols-2">
          <label class="block space-y-1">
            <span class="text-slate-600">Provider</span>
            <UiSelect v-model="form.rtcProvider" :options="rtcProviderOptions" size="sm" aria-label="RTC Provider" class="w-full" />
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
            <UiSelect v-model="form.rtcApiKeyMode" :options="secretModeOptions" size="sm" aria-label="RTC API Key 模式" class="w-full" />
            <input v-model="form.rtcApiKey" class="admin-input" :disabled="form.rtcApiKeyMode !== 'replace'" placeholder="仅在替换时填写">
            <span class="text-[10px] text-slate-500">已配置：{{ payload.rtc.apiKeyConfigured ? '是' : '否' }}</span>
          </label>
          <label class="block space-y-1">
            <span class="text-slate-600">API Secret</span>
            <UiSelect v-model="form.rtcApiSecretMode" :options="secretModeOptions" size="sm" aria-label="RTC API Secret 模式" class="w-full" />
            <input v-model="form.rtcApiSecret" class="admin-input" :disabled="form.rtcApiSecretMode !== 'replace'" placeholder="仅在替换时填写">
            <span class="text-[10px] text-slate-500">已配置：{{ payload.rtc.apiSecretConfigured ? '是' : '否' }}</span>
          </label>
          <label class="block space-y-1">
            <span class="text-slate-600">Webhook Secret</span>
            <UiSelect v-model="form.rtcWebhookSecretMode" :options="secretModeOptions" size="sm" aria-label="RTC Webhook Secret 模式" class="w-full" />
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
        <div class="flex flex-wrap gap-2">
          <a-button size="small" type="outline" @click="applyLocalAsrBridgePreset">
            填入本机 ASR bridge
          </a-button>
          <a-button size="small" type="outline" @click="applyOpenAiCompatibleAsrPreset">
            填入 OpenAI Compatible ASR
          </a-button>
        </div>
        <div class="gap-3 grid md:grid-cols-2">
          <label class="block space-y-1">
            <span class="text-slate-600">Provider</span>
            <UiSelect v-model="form.asrProvider" :options="asrProviderOptions" size="sm" aria-label="ASR Provider" class="w-full" />
          </label>
          <label class="block space-y-1">
            <span class="text-slate-600">Service URL（仅 http）</span>
            <input v-model="form.asrServiceUrl" class="admin-input" :disabled="form.asrProvider === 'openai-compatible'" placeholder="http://127.0.0.1:8790">
          </label>
        </div>
        <p class="text-[10px] text-slate-500 m-0">
          `http` 表示外部 ASR 网关；`openai-compatible` 表示应用内调用 AI 场景 `meeting_asr` 绑定的 Provider/模型，支持 OpenAI 兼容、Coze 语音与百炼 DashScope ASR，不再从会议配置读取转写 URL、API Key 或默认模型。
        </p>
        <div class="gap-3 grid md:grid-cols-2">
          <label class="block space-y-1">
            <span class="text-slate-600">API Key（仅 http）</span>
            <UiSelect v-model="form.asrApiKeyMode" :options="secretModeOptions" size="sm" aria-label="ASR API Key 模式" class="w-full" />
            <input v-model="form.asrApiKey" class="admin-input" :disabled="form.asrApiKeyMode !== 'replace' || form.asrProvider === 'openai-compatible'" placeholder="仅在替换时填写">
            <span class="text-[10px] text-slate-500">已配置：{{ payload.asr.apiKeyConfigured ? '是' : '否' }}</span>
          </label>
          <label class="block space-y-1">
            <span class="text-slate-600">Webhook Secret</span>
            <UiSelect v-model="form.asrWebhookSecretMode" :options="secretModeOptions" size="sm" aria-label="ASR Webhook Secret 模式" class="w-full" />
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

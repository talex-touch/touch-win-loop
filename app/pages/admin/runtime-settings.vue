<script setup lang="ts">
import type { ApiResponse } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

interface RuntimeSettingsPayload {
  auth: {
    registrationEnabled: boolean
  }
  feishuScheduler: {
    enabled: boolean
    intervalMs: number
    batchSize: number
    lockTtlMs: number
  }
  resourceRecycle: {
    enabled: boolean
    intervalMs: number
    retentionDays: number
    batchSize: number
  }
  contest: {
    autoSeed: boolean
  }
  overrideState: {
    updatedAt: string
    updatedByUserId: string
  }
  configSource: {
    authRegistration: 'env' | 'override'
    feishuScheduler: 'env' | 'override'
    resourceRecycle: 'env' | 'override'
    contestAutoSeed: 'env' | 'override'
  }
}

type RuntimeConfigSection = keyof RuntimeSettingsPayload['configSource']

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const loading = ref(true)
const saving = ref(false)
const errorText = ref('')
const successText = ref('')
const payload = ref<RuntimeSettingsPayload | null>(null)

const form = reactive({
  auth: {
    registrationEnabled: true,
  },
  feishuScheduler: {
    enabled: true,
    intervalMs: 60_000,
    batchSize: 20,
    lockTtlMs: 600_000,
  },
  resourceRecycle: {
    enabled: true,
    intervalMs: 1_800_000,
    retentionDays: 30,
    batchSize: 200,
  },
  contest: {
    autoSeed: false,
  },
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

function applyPayload(nextPayload: RuntimeSettingsPayload): void {
  form.auth.registrationEnabled = Boolean(nextPayload.auth.registrationEnabled)

  form.feishuScheduler.enabled = Boolean(nextPayload.feishuScheduler.enabled)
  form.feishuScheduler.intervalMs = Number(nextPayload.feishuScheduler.intervalMs || 60_000)
  form.feishuScheduler.batchSize = Number(nextPayload.feishuScheduler.batchSize || 20)
  form.feishuScheduler.lockTtlMs = Number(nextPayload.feishuScheduler.lockTtlMs || 600_000)

  form.resourceRecycle.enabled = Boolean(nextPayload.resourceRecycle.enabled)
  form.resourceRecycle.intervalMs = Number(nextPayload.resourceRecycle.intervalMs || 1_800_000)
  form.resourceRecycle.retentionDays = Number(nextPayload.resourceRecycle.retentionDays || 30)
  form.resourceRecycle.batchSize = Number(nextPayload.resourceRecycle.batchSize || 200)

  form.contest.autoSeed = Boolean(nextPayload.contest.autoSeed)
}

function displayConfigSource(section: RuntimeConfigSection, value?: RuntimeSettingsPayload['configSource'][RuntimeConfigSection]): string {
  if (value === 'override')
    return 'override'

  if (section === 'contestAutoSeed' || section === 'authRegistration')
    return 'env'

  return 'default'
}

async function loadSettings(showLoading = false) {
  if (showLoading)
    loading.value = true
  errorText.value = ''
  successText.value = ''
  try {
    const response = await fetch(endpoint('/admin/runtime-settings'), {
      credentials: 'include',
    })
    const result = await response.json().catch(() => null) as ApiResponse<RuntimeSettingsPayload> | null
    if (!response.ok || !result || result.code !== 0)
      throw new Error(String(result?.message || '运行设置加载失败。'))
    payload.value = result.data
    applyPayload(result.data)
  }
  catch (error: any) {
    payload.value = null
    errorText.value = String(error?.data?.message || '运行设置加载失败。')
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
    const response = await fetch(endpoint('/admin/runtime-settings'), {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth: {
          registrationEnabled: Boolean(form.auth.registrationEnabled),
        },
        feishuScheduler: {
          enabled: Boolean(form.feishuScheduler.enabled),
          intervalMs: Number(form.feishuScheduler.intervalMs || 60_000),
          batchSize: Number(form.feishuScheduler.batchSize || 20),
          lockTtlMs: Number(form.feishuScheduler.lockTtlMs || 600_000),
        },
        resourceRecycle: {
          enabled: Boolean(form.resourceRecycle.enabled),
          intervalMs: Number(form.resourceRecycle.intervalMs || 1_800_000),
          retentionDays: Number(form.resourceRecycle.retentionDays || 30),
          batchSize: Number(form.resourceRecycle.batchSize || 200),
        },
        contest: {
          autoSeed: Boolean(form.contest.autoSeed),
        },
      }),
    })
    const result = await response.json().catch(() => null) as ApiResponse<RuntimeSettingsPayload> | null
    if (!response.ok || !result || result.code !== 0)
      throw new Error(String(result?.message || '运行设置保存失败。'))
    payload.value = result.data
    applyPayload(result.data)
    successText.value = '运行设置已保存，新的 worker 参数将自动生效。'
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '运行设置保存失败。')
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
            运行设置
          </h1>
          <p class="text-[11px] text-slate-500 mb-0 mt-1">
            worker 参数默认使用内置值，UI 保存后立即覆盖生效。当前页不管理 PG/Redis/Storage/域名端口等基础设施变量。
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
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <section v-else-if="errorText" class="text-rose-600 p-3 border border-rose-200 bg-rose-50">
      {{ errorText }}
    </section>

    <template v-else>
      <section v-if="successText" class="text-emerald-700 p-3 border border-emerald-200 bg-emerald-50">
        {{ successText }}
      </section>

      <section class="p-3 border border-slate-200 bg-white space-y-3">
        <div class="flex gap-3 items-center justify-between">
          <h2 class="text-[12px] text-slate-900 font-bold m-0">
            认证参数（auth）
          </h2>
          <a-tag size="small" :color="payload?.configSource?.authRegistration === 'override' ? 'green' : 'gray'">
            {{ displayConfigSource('authRegistration', payload?.configSource?.authRegistration) }}
          </a-tag>
        </div>
        <label class="inline-flex gap-2 items-center">
          <a-switch v-model="form.auth.registrationEnabled" size="small" />
          <span class="text-[11px] text-slate-700">允许首次登录自动注册本地账号（auth.registrationEnabled）</span>
        </label>
      </section>

      <section class="p-3 border border-slate-200 bg-white space-y-3">
        <div class="flex gap-3 items-center justify-between">
          <h2 class="text-[12px] text-slate-900 font-bold m-0">
            飞书调度（feishuScheduler）
          </h2>
          <a-tag size="small" :color="payload?.configSource?.feishuScheduler === 'override' ? 'green' : 'gray'">
            {{ displayConfigSource('feishuScheduler', payload?.configSource?.feishuScheduler) }}
          </a-tag>
        </div>
        <div class="gap-2 grid md:grid-cols-4">
          <label class="block space-y-1">
            <span class="text-[11px] text-slate-600">启用</span>
            <a-switch v-model="form.feishuScheduler.enabled" size="small" />
          </label>
          <label class="block space-y-1">
            <span class="text-[11px] text-slate-600">周期(ms)</span>
            <a-input-number v-model="form.feishuScheduler.intervalMs" :min="15000" :max="86400000" size="small" />
          </label>
          <label class="block space-y-1">
            <span class="text-[11px] text-slate-600">批次上限</span>
            <a-input-number v-model="form.feishuScheduler.batchSize" :min="1" :max="200" size="small" />
          </label>
          <label class="block space-y-1">
            <span class="text-[11px] text-slate-600">锁 TTL(ms)</span>
            <a-input-number v-model="form.feishuScheduler.lockTtlMs" :min="60000" :max="86400000" size="small" />
          </label>
        </div>
      </section>

      <section class="p-3 border border-slate-200 bg-white space-y-3">
        <div class="flex gap-3 items-center justify-between">
          <h2 class="text-[12px] text-slate-900 font-bold m-0">
            资源回收（resourceRecycle）
          </h2>
          <a-tag size="small" :color="payload?.configSource?.resourceRecycle === 'override' ? 'green' : 'gray'">
            {{ displayConfigSource('resourceRecycle', payload?.configSource?.resourceRecycle) }}
          </a-tag>
        </div>
        <div class="gap-2 grid md:grid-cols-4">
          <label class="block space-y-1">
            <span class="text-[11px] text-slate-600">启用</span>
            <a-switch v-model="form.resourceRecycle.enabled" size="small" />
          </label>
          <label class="block space-y-1">
            <span class="text-[11px] text-slate-600">周期(ms)</span>
            <a-input-number v-model="form.resourceRecycle.intervalMs" :min="60000" :max="86400000" size="small" />
          </label>
          <label class="block space-y-1">
            <span class="text-[11px] text-slate-600">保留天数</span>
            <a-input-number v-model="form.resourceRecycle.retentionDays" :min="1" :max="365" size="small" />
          </label>
          <label class="block space-y-1">
            <span class="text-[11px] text-slate-600">批次上限</span>
            <a-input-number v-model="form.resourceRecycle.batchSize" :min="20" :max="1000" size="small" />
          </label>
        </div>
      </section>

      <section class="p-3 border border-slate-200 bg-white space-y-3">
        <div class="flex gap-3 items-center justify-between">
          <h2 class="text-[12px] text-slate-900 font-bold m-0">
            赛事参数（contest）
          </h2>
          <a-tag size="small" :color="payload?.configSource?.contestAutoSeed === 'override' ? 'green' : 'gray'">
            {{ displayConfigSource('contestAutoSeed', payload?.configSource?.contestAutoSeed) }}
          </a-tag>
        </div>
        <label class="inline-flex gap-2 items-center">
          <a-switch v-model="form.contest.autoSeed" size="small" />
          <span class="text-[11px] text-slate-700">自动注入 catalog 赛事（contest.autoSeed）</span>
        </label>
      </section>

      <section class="p-3 border border-slate-200 bg-white">
        <p class="text-[11px] text-slate-600 m-0">
          最近更新：{{ formatTime(payload?.overrideState?.updatedAt || '') }} · 更新人：{{ payload?.overrideState?.updatedByUserId || '-' }}
        </p>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { ApiResponse, Resource, Track } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

type PromptTarget = 'contest_filter' | 'project_chat' | 'topic_proposal' | 'review' | 'defense'
type PromptScope = 'contest' | 'track'

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

const loading = ref(false)
const saving = ref(false)
const errorText = ref('')
const successText = ref('')
const tracks = ref<Track[]>([])
const promptResources = ref<Resource[]>([])
const activeResourceId = ref('')

const form = reactive<{
  title: string
  prompt: string
  target: PromptTarget
  scope: PromptScope
  trackId: string
  priority: number
  enabled: boolean
  status: 'active' | 'archived'
}>({
  title: '',
  prompt: '',
  target: 'project_chat',
  scope: 'contest',
  trackId: '',
  priority: 0,
  enabled: true,
  status: 'active',
})

const targetOptions: Array<{ value: PromptTarget, label: string }> = [
  { value: 'contest_filter', label: '选赛过滤' },
  { value: 'project_chat', label: '项目聊天' },
  { value: 'topic_proposal', label: '选题建议' },
  { value: 'review', label: '评审建议' },
  { value: 'defense', label: '答辩模拟' },
]

function resetForm() {
  form.title = ''
  form.prompt = ''
  form.target = 'project_chat'
  form.scope = 'contest'
  form.trackId = ''
  form.priority = 0
  form.enabled = true
  form.status = 'active'
}

function applyResource(item: Resource) {
  const metadata = (item.metadata || {}) as Record<string, unknown>
  activeResourceId.value = item.id
  form.title = item.title || ''
  form.prompt = String(metadata.prompt || item.content || item.summary || '')
  form.target = String(metadata.target || 'project_chat') as PromptTarget
  form.scope = String(metadata.scope || 'contest') as PromptScope
  form.trackId = String(metadata.trackId || metadata.track_id || '')
  form.priority = Number(metadata.priority || 0)
  form.enabled = metadata.enabled !== false
  form.status = (item.status === 'archived' ? 'archived' : 'active')
}

function buildMetadata(): Record<string, unknown> {
  return {
    target: form.target,
    scope: form.scope,
    trackId: form.scope === 'track' ? form.trackId : '',
    priority: Number(form.priority || 0),
    enabled: form.enabled,
    prompt: form.prompt.trim(),
  }
}

async function loadData() {
  loading.value = true
  errorText.value = ''
  try {
    const [resourceRes, trackRes] = await Promise.all([
      $fetch<ApiResponse<Resource[]>>(endpoint(`/admin/contests/${contestId.value}/resources`), {
        query: {
          category: 'ai_prompts',
        },
      }),
      $fetch<ApiResponse<Track[]>>(endpoint(`/admin/contests/${contestId.value}/tracks`)),
    ])
    promptResources.value = resourceRes.data
    tracks.value = trackRes.data
    if (promptResources.value.length > 0) {
      const initial = promptResources.value[0]
      if (initial)
        applyResource(initial)
    }
    else {
      resetForm()
      activeResourceId.value = ''
    }
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || 'AI 提示词加载失败。')
  }
  finally {
    loading.value = false
  }
}

function createDraft() {
  activeResourceId.value = ''
  resetForm()
}

async function save() {
  if (!form.title.trim() || !form.prompt.trim()) {
    errorText.value = '标题与提示词正文不能为空。'
    return
  }
  if (form.scope === 'track' && !form.trackId) {
    errorText.value = '赛道级提示词必须选择赛道。'
    return
  }

  saving.value = true
  errorText.value = ''
  successText.value = ''

  const payload = {
    category: 'ai_prompts',
    title: form.title.trim(),
    year: new Date().getFullYear(),
    url: '',
    accessLevel: 'public',
    sourceType: 'internal_prompt',
    summary: form.prompt.trim().slice(0, 120),
    content: form.prompt.trim(),
    metadata: buildMetadata(),
    copyrightNote: '',
    status: form.status,
  }

  try {
    if (activeResourceId.value) {
      await $fetch(endpoint(`/admin/contests/${contestId.value}/resources`), {
        method: 'PATCH',
        body: {
          resourceId: activeResourceId.value,
          ...payload,
        },
      })
    }
    else {
      await $fetch(endpoint(`/admin/contests/${contestId.value}/resources`), {
        method: 'POST',
        body: payload,
      })
    }
    successText.value = 'AI 提示词已保存。'
    await loadData()
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || 'AI 提示词保存失败。')
  }
  finally {
    saving.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex gap-2 items-center justify-between">
        <div>
          <h1 class="text-lg text-slate-900 font-semibold">
            AI 提示词
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            赛事 ID：{{ contestId }} · 可注入 5 条 AI 链路
          </p>
        </div>
        <div class="flex gap-2 items-center">
          <button class="dense-btn" @click="createDraft">
            新建提示词
          </button>
          <a-button type="primary" size="small" :loading="saving" @click="save">
            保存
          </a-button>
        </div>
      </div>
    </section>

    <section v-if="loading" class="p-4 border border-slate-200 rounded-lg bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <section v-else class="gap-3 grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside class="p-3 border border-slate-200 rounded-lg bg-white">
        <p class="text-xs text-slate-700 font-semibold">
          已配置提示词（{{ promptResources.length }}）
        </p>
        <div class="mt-2 space-y-2">
          <button
            v-for="item in promptResources"
            :key="item.id"
            class="text-xs px-2 py-2 text-left border rounded w-full"
            :class="activeResourceId === item.id ? 'border-slate-800 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'"
            @click="applyResource(item)"
          >
            <p class="font-semibold truncate">
              {{ item.title }}
            </p>
            <p class="mt-1 opacity-80 truncate">
              {{ ((item.metadata || {}).target as string) || 'project_chat' }} · {{ ((item.metadata || {}).scope as string) || 'contest' }}
            </p>
          </button>
        </div>
      </aside>

      <section class="p-4 border border-slate-200 rounded-lg bg-white">
        <div class="gap-2 grid md:grid-cols-2">
          <a-input v-model="form.title" size="small" placeholder="提示词标题" />
          <a-select v-model="form.target" size="small" placeholder="目标链路">
            <a-option v-for="item in targetOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </a-option>
          </a-select>
          <a-select v-model="form.scope" size="small" placeholder="作用域">
            <a-option value="contest">
              contest
            </a-option>
            <a-option value="track">
              track
            </a-option>
          </a-select>
          <a-select v-model="form.trackId" size="small" :disabled="form.scope !== 'track'" placeholder="赛道（track 作用域必选）">
            <a-option value="">
              请选择赛道
            </a-option>
            <a-option v-for="item in tracks" :key="item.id" :value="item.id">
              {{ item.name }}
            </a-option>
          </a-select>
          <a-input-number v-model="form.priority" size="small" :min="-1000" :max="1000" placeholder="优先级" />
          <a-select v-model="form.status" size="small" placeholder="状态">
            <a-option value="active">
              active
            </a-option>
            <a-option value="archived">
              archived
            </a-option>
          </a-select>
        </div>

        <div class="text-xs text-slate-600 mt-3 flex gap-2 items-center">
          <a-checkbox v-model="form.enabled">
            启用（metadata.enabled）
          </a-checkbox>
        </div>

        <a-textarea
          v-model="form.prompt"
          class="mt-3"
          :auto-size="{ minRows: 10, maxRows: 18 }"
          placeholder="请输入提示词正文"
        />
      </section>
    </section>

    <section v-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>
    <section v-if="successText" class="text-sm text-emerald-700 p-4 border border-emerald-200 rounded-lg bg-emerald-50">
      {{ successText }}
    </section>
  </div>
</template>

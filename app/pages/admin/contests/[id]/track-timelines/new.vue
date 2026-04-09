<script setup lang="ts">
import type { ApiResponse, TimelineNodeType, Track } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const route = useRoute()

function fromDatetimeLocal(value: string): string | null {
  const text = value.trim()
  if (!text)
    return null
  const timestamp = new Date(`${text}:00+08:00`).getTime()
  if (Number.isNaN(timestamp))
    return null
  return new Date(timestamp).toISOString()
}

function toDatetimeLocal(value: unknown): string {
  const text = String(value || '').trim()
  if (!text)
    return ''
  const date = new Date(text)
  if (Number.isNaN(date.getTime()))
    return ''
  const local = date.toLocaleString('sv-SE', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
  return local.replace(' ', 'T').slice(0, 16)
}

const contestId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.id
  return Array.isArray(value) ? (value[0] || '') : (value || '')
})

const isEmbedMode = computed(() => {
  const value = route.query.embed
  if (Array.isArray(value))
    return value[0] === '1'
  return value === '1'
})

function withEmbed(path: string): string | { path: string, query: { embed: string } } {
  if (isEmbedMode.value)
    return { path, query: { embed: '1' } }
  return path
}

const loadingTracks = ref(false)
const saving = ref(false)
const errorText = ref('')
const draftText = ref('')
const tracks = ref<Track[]>([])
const draftBridge = useAdminAgentDraft()

const form = reactive<{
  trackId: string
  year: number
  nodeType: TimelineNodeType
  startAt: string
  endAt: string
  note: string
  sourceLink: string
}>({
  trackId: '',
  year: new Date().getFullYear(),
  nodeType: 'registration',
  startAt: '',
  endAt: '',
  note: '',
  sourceLink: '',
})

const moduleDraft = computed(() => draftBridge.getDraft(contestId.value, 'track_timelines'))
const draftUpdatedAt = computed(() => {
  const value = moduleDraft.value?.updatedAt
  if (!value)
    return ''
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
})

function applyAiDraft() {
  const payload = moduleDraft.value?.payload || {}
  form.trackId = String(payload.trackId || payload.track_id || form.trackId)
  form.year = Number(payload.year || new Date().getFullYear())

  const nodeType = String(payload.nodeType || '').trim()
  if (['registration', 'submission', 'preliminary', 'final', 'other'].includes(nodeType))
    form.nodeType = nodeType as TimelineNodeType

  form.startAt = toDatetimeLocal(payload.startAt)
  form.endAt = toDatetimeLocal(payload.endAt)
  form.note = String(payload.note || '')
  form.sourceLink = String(payload.sourceLink || '')
  draftText.value = 'AI 草稿已应用到表单，请点击“保存”。'
}

function clearAiDraft() {
  draftBridge.clearDraft(contestId.value, 'track_timelines')
  draftText.value = ''
}

async function loadTracks() {
  loadingTracks.value = true
  try {
    const response = await unsafeFetch<ApiResponse<Track[]>>(endpoint(`/admin/contests/${contestId.value}/tracks`))
    tracks.value = response.data
    if (!form.trackId && tracks.value.length > 0)
      form.trackId = tracks.value[0]!.id
  }
  catch {
    tracks.value = []
  }
  finally {
    loadingTracks.value = false
  }
}

async function save() {
  if (!form.trackId) {
    errorText.value = '请选择赛道。'
    return
  }

  saving.value = true
  errorText.value = ''
  try {
    await unsafeFetch(endpoint(`/admin/contests/${contestId.value}/track-timelines`), {
      method: 'POST',
      body: {
        trackId: form.trackId,
        year: Number(form.year || new Date().getFullYear()),
        nodeType: form.nodeType,
        startAt: fromDatetimeLocal(form.startAt),
        endAt: fromDatetimeLocal(form.endAt),
        note: form.note.trim(),
        sourceLink: form.sourceLink.trim(),
      },
    })
    await navigateTo(withEmbed(`/admin/contests/${contestId.value}/track-timelines`))
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '新增赛道时间线失败。')
  }
  finally {
    saving.value = false
  }
}

onMounted(loadTracks)
</script>

<template>
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 class="text-lg text-slate-900 font-semibold">
            新增赛道时间线
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            赛事 ID：{{ contestId }}
          </p>
        </div>
        <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/track-timelines`)">
          返回赛道时间线列表
        </NuxtLink>
      </div>
    </section>

    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div v-if="moduleDraft" class="text-xs text-emerald-700 mb-3 p-3 border border-emerald-200 rounded bg-emerald-50">
        <p class="font-semibold">
          检测到 AI 草稿：{{ moduleDraft.title || '赛道时间线草稿' }}
        </p>
        <p class="mt-1">
          更新时间：{{ draftUpdatedAt }}。应用后仍需手动保存。
        </p>
        <div class="mt-2 flex gap-2 items-center">
          <a-button size="mini" type="outline" @click="applyAiDraft">
            应用到表单
          </a-button>
          <a-button size="mini" status="danger" @click="clearAiDraft">
            清除草稿
          </a-button>
        </div>
      </div>

      <div class="gap-2 grid grid-cols-2">
        <a-select v-model="form.trackId" size="small" :loading="loadingTracks" placeholder="赛道">
          <a-option v-for="item in tracks" :key="item.id" :value="item.id">
            {{ item.name }}
          </a-option>
        </a-select>
        <a-input-number v-model="form.year" size="small" :min="2000" :max="2100" placeholder="年份" />
        <a-select v-model="form.nodeType" size="small" placeholder="节点类型">
          <a-option value="registration">
            registration
          </a-option>
          <a-option value="submission">
            submission
          </a-option>
          <a-option value="preliminary">
            preliminary
          </a-option>
          <a-option value="final">
            final
          </a-option>
          <a-option value="other">
            other
          </a-option>
        </a-select>
        <div />
        <a-date-picker
          v-model="form.startAt"
          size="small"
          show-time
          format="YYYY-MM-DD HH:mm"
          value-format="YYYY-MM-DDTHH:mm"
          placeholder="开始时间"
        />
        <a-date-picker
          v-model="form.endAt"
          size="small"
          show-time
          format="YYYY-MM-DD HH:mm"
          value-format="YYYY-MM-DDTHH:mm"
          placeholder="结束时间"
        />
        <a-input v-model="form.note" size="small" class="col-span-2" placeholder="备注" />
        <a-input v-model="form.sourceLink" size="small" class="col-span-2" placeholder="来源链接" />
      </div>
      <a-button type="primary" size="small" class="mt-3" :loading="saving" @click="save">
        {{ saving ? '保存中...' : '保存' }}
      </a-button>
    </section>

    <section v-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>

    <section v-if="draftText" class="text-sm text-emerald-700 p-4 border border-emerald-200 rounded-lg bg-emerald-50">
      {{ draftText }}
    </section>
  </div>
</template>

<script setup lang="ts">
import type { ApiResponse, TimelineNodeType, Track } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const { contestId, withEmbed } = useAdminContestRoute()

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
  <PageShell size="compact">
    <PageHeader title="新增赛道时间线" :meta="`赛事 ID：${contestId}`">
      <template #actions>
        <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/track-timelines`)">
          返回赛道时间线列表
        </NuxtLink>
      </template>
    </PageHeader>

    <AdminTimelineForm
      :form="form"
      :tracks="tracks"
      include-track
      :loading="loadingTracks"
      :saving="saving"
      :error-text="errorText"
      :draft-text="draftText"
      :draft-title="moduleDraft?.title || (moduleDraft ? '赛道时间线草稿' : '')"
      :draft-updated-at="draftUpdatedAt"
      @submit="save"
      @apply-draft="applyAiDraft"
      @clear-draft="clearAiDraft"
    />
  </PageShell>
</template>

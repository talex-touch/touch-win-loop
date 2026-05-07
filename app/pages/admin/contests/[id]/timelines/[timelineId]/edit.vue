<script setup lang="ts">
import type { ApiResponse, ContestTimeline, TimelineNodeType } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const { contestId, timelineId, isEmbedMode, withEmbed } = useAdminContestRoute()

const loading = ref(true)
const saving = ref(false)
const errorText = ref('')
const notFoundText = ref('')
const draftText = ref('')
const draftBridge = useAdminAgentDraft()
let loadRequestId = 0

const form = reactive<{
  year: number
  nodeType: TimelineNodeType
  startAt: string
  endAt: string
  note: string
  sourceLink: string
}>({
  year: new Date().getFullYear(),
  nodeType: 'registration',
  startAt: '',
  endAt: '',
  note: '',
  sourceLink: '',
})

const moduleDraft = computed(() => draftBridge.getDraft(contestId.value, 'timelines'))
const listPath = computed(() => `/admin/contests/${contestId.value}/timelines`)
const listRoute = computed(() => withEmbed(listPath.value))
const draftUpdatedAt = computed(() => {
  const value = moduleDraft.value?.updatedAt
  if (!value)
    return ''
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
})

function resolveListRoute(targetContestId = contestId.value, embed = isEmbedMode.value): string | { path: string, query: { embed: string } } {
  const path = `/admin/contests/${targetContestId}/timelines`
  if (embed)
    return { path, query: { embed: '1' } }
  return path
}

function isAvailableTimeline(item: ContestTimeline): boolean {
  const state = item as ContestTimeline & { deletedAt?: string | null, status?: string | null }
  return !state.deletedAt && state.status !== 'deleted' && state.status !== 'archived'
}

function applyAiDraft() {
  const payload = moduleDraft.value?.payload || {}
  form.year = Number(payload.year || new Date().getFullYear())

  const nodeType = String(payload.nodeType || '').trim()
  if (['registration', 'submission', 'preliminary', 'final', 'other'].includes(nodeType))
    form.nodeType = nodeType as TimelineNodeType

  form.startAt = toDatetimeLocal(String(payload.startAt || ''))
  form.endAt = toDatetimeLocal(String(payload.endAt || ''))
  form.note = String(payload.note || '')
  form.sourceLink = String(payload.sourceLink || '')
  draftText.value = 'AI 草稿已应用到表单，请点击“保存”。'
}

function clearAiDraft() {
  draftBridge.clearDraft(contestId.value, 'timelines')
  draftText.value = ''
}

async function loadTimeline() {
  const requestId = ++loadRequestId
  const targetContestId = contestId.value
  const targetTimelineId = timelineId.value

  errorText.value = ''
  notFoundText.value = ''

  if (!targetContestId || !targetTimelineId) {
    loading.value = false
    notFoundText.value = '时间节点不存在或已被删除，请返回列表刷新后再操作。'
    return
  }

  loading.value = true
  try {
    const response = await unsafeFetch<ApiResponse<ContestTimeline[]>>(endpoint(`/admin/contests/${targetContestId}/timelines`))
    if (requestId !== loadRequestId)
      return

    const item = response.data.find(timeline =>
      timeline.id === targetTimelineId
      && timeline.contestId === targetContestId
      && isAvailableTimeline(timeline),
    )
    if (!item) {
      notFoundText.value = '时间节点不存在或已被删除，请返回列表刷新后再操作。'
      return
    }

    form.year = Number(item.year || new Date().getFullYear())
    form.nodeType = item.nodeType || 'registration'
    form.startAt = toDatetimeLocal(item.startAt)
    form.endAt = toDatetimeLocal(item.endAt)
    form.note = item.note || ''
    form.sourceLink = item.sourceLink || ''
  }
  catch (error: any) {
    if (requestId !== loadRequestId)
      return
    errorText.value = String(error?.data?.message || '时间节点加载失败。')
  }
  finally {
    if (requestId === loadRequestId)
      loading.value = false
  }
}

async function save() {
  const targetContestId = contestId.value
  const targetTimelineId = timelineId.value
  const targetEmbedMode = isEmbedMode.value

  if (!targetContestId || !targetTimelineId || notFoundText.value) {
    errorText.value = '时间节点不存在或已被删除，请返回列表刷新后再操作。'
    return
  }

  saving.value = true
  errorText.value = ''
  try {
    await unsafeFetch(endpoint(`/admin/contests/${targetContestId}/timelines`), {
      method: 'PATCH',
      body: {
        timelineId: targetTimelineId,
        year: Number(form.year || new Date().getFullYear()),
        nodeType: form.nodeType,
        startAt: fromDatetimeLocal(form.startAt),
        endAt: fromDatetimeLocal(form.endAt),
        note: form.note.trim(),
        sourceLink: form.sourceLink.trim(),
      },
    })
    await navigateTo(resolveListRoute(targetContestId, targetEmbedMode), { replace: true })
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '时间节点更新失败。')
  }
  finally {
    saving.value = false
  }
}

watch(
  () => [contestId.value, timelineId.value],
  () => {
    void loadTimeline()
  },
  { immediate: true },
)
</script>

<template>
  <PageShell size="compact">
    <PageHeader title="编辑时间节点" :meta="`timeline_id：${timelineId}`">
      <template #actions>
        <NuxtLink class="dense-btn" :to="listRoute">
          返回时间节点列表
        </NuxtLink>
      </template>
    </PageHeader>

    <StateBlock
      v-if="notFoundText && !loading"
      tone="warning"
      title="时间节点不可用"
      :description="notFoundText"
    >
      <div class="mt-3 flex flex-wrap gap-2">
        <button class="dense-btn" type="button" @click="loadTimeline">
          重新检查
        </button>
        <NuxtLink class="dense-btn" :to="listRoute">
          返回列表
        </NuxtLink>
      </div>
    </StateBlock>

    <AdminTimelineForm
      v-else
      :form="form"
      :loading="loading"
      :saving="saving"
      :error-text="errorText"
      :draft-text="draftText"
      :draft-title="moduleDraft?.title || (moduleDraft ? '时间节点草稿' : '')"
      :draft-updated-at="draftUpdatedAt"
      @submit="save"
      @apply-draft="applyAiDraft"
      @clear-draft="clearAiDraft"
    />
  </PageShell>
</template>

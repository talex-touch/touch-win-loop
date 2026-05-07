<script setup lang="ts">
import type { TimelineNodeType } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const { contestId, withEmbed } = useAdminContestRoute()

const saving = ref(false)
const errorText = ref('')
const draftText = ref('')
const draftBridge = useAdminAgentDraft()

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

async function save() {
  saving.value = true
  errorText.value = ''
  try {
    await unsafeFetch(endpoint(`/admin/contests/${contestId.value}/timelines`), {
      method: 'POST',
      body: {
        year: Number(form.year || new Date().getFullYear()),
        nodeType: form.nodeType,
        startAt: fromDatetimeLocal(form.startAt),
        endAt: fromDatetimeLocal(form.endAt),
        note: form.note.trim(),
        sourceLink: form.sourceLink.trim(),
      },
    })
    await navigateTo(withEmbed(`/admin/contests/${contestId.value}/timelines`))
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '新增时间节点失败。')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <PageShell size="compact">
    <PageHeader title="新增时间节点" :meta="`赛事 ID：${contestId}`">
      <template #actions>
        <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/timelines`)">
          返回时间节点列表
        </NuxtLink>
      </template>
    </PageHeader>

    <AdminTimelineForm
      :form="form"
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

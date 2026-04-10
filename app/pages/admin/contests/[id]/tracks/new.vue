<script setup lang="ts">
import type { ContestStatus } from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const { contestId, withEmbed } = useAdminContestRoute()

function splitCsv(value: string): string[] {
  return value
    .split(/[\n,，、;]/g)
    .map(item => item.trim())
    .filter(Boolean)
}

function toCsv(values: unknown): string {
  if (!Array.isArray(values))
    return ''
  return values.map(item => String(item || '').trim()).filter(Boolean).join(', ')
}

const saving = ref(false)
const errorText = ref('')
const draftText = ref('')
const draftBridge = useAdminAgentDraft()

const form = reactive<{
  name: string
  summary: string
  coverImageUrl: string
  location: string
  organizer: string
  undertaker: string
  participantRequirements: string
  teamRule: string
  awardRatio: string
  suitableMajorsCsv: string
  deliverableTypesCsv: string
  rubricId: string
  sortOrder: number
  status: ContestStatus
}>({
  name: '',
  summary: '',
  coverImageUrl: '',
  location: '',
  organizer: '',
  undertaker: '',
  participantRequirements: '',
  teamRule: '',
  awardRatio: '',
  suitableMajorsCsv: '',
  deliverableTypesCsv: '',
  rubricId: '',
  sortOrder: 0,
  status: 'draft',
})

const moduleDraft = computed(() => draftBridge.getDraft(contestId.value, 'tracks'))
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
  form.name = String(payload.name || '')
  form.summary = String(payload.summary || '')
  form.coverImageUrl = String(payload.coverImageUrl || '')
  form.location = String(payload.location || '')
  form.organizer = String(payload.organizer || '')
  form.undertaker = String(payload.undertaker || '')
  form.participantRequirements = String(payload.participantRequirements || '')
  form.teamRule = String(payload.teamRule || '')
  form.awardRatio = String(payload.awardRatio || '')
  form.suitableMajorsCsv = toCsv(payload.suitableMajors)
  form.deliverableTypesCsv = toCsv(payload.deliverableTypes)
  form.rubricId = String(payload.rubricId || '')
  form.sortOrder = Number(payload.sortOrder || 0)

  const status = String(payload.status || '').trim()
  if (status === 'draft' || status === 'published' || status === 'archived')
    form.status = status

  draftText.value = 'AI 草稿已应用到表单，请点击“保存”。'
}

function clearAiDraft() {
  draftBridge.clearDraft(contestId.value, 'tracks')
  draftText.value = ''
}

async function save() {
  if (!form.name.trim()) {
    errorText.value = '赛道名称不能为空。'
    return
  }

  saving.value = true
  errorText.value = ''
  try {
    await $fetch(endpoint(`/admin/contests/${contestId.value}/tracks`), {
      method: 'POST',
      body: {
        name: form.name.trim(),
        summary: form.summary.trim(),
        coverImageUrl: form.coverImageUrl.trim(),
        location: form.location.trim(),
        organizer: form.organizer.trim(),
        undertaker: form.undertaker.trim(),
        participantRequirements: form.participantRequirements.trim(),
        teamRule: form.teamRule.trim(),
        awardRatio: form.awardRatio.trim(),
        suitableMajors: splitCsv(form.suitableMajorsCsv),
        deliverableTypes: splitCsv(form.deliverableTypesCsv),
        rubricId: form.rubricId.trim() || null,
        sortOrder: Number(form.sortOrder || 0),
        status: form.status,
      },
    })
    await navigateTo(withEmbed(`/admin/contests/${contestId.value}/tracks`))
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '新增赛道失败。')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <PageShell size="compact">
    <PageHeader title="新增赛道" :meta="`赛事 ID：${contestId}`">
      <template #actions>
        <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/tracks`)">
          返回赛道列表
        </NuxtLink>
      </template>
    </PageHeader>

    <AdminTrackForm
      :form="form"
      :saving="saving"
      :error-text="errorText"
      :draft-text="draftText"
      :draft-title="moduleDraft?.title || (moduleDraft ? '赛道草稿' : '')"
      :draft-updated-at="draftUpdatedAt"
      @submit="save"
      @apply-draft="applyAiDraft"
      @clear-draft="clearAiDraft"
    />
  </PageShell>
</template>

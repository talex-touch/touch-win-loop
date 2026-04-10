<script setup lang="ts">
import type {
  ApiResponse,
  Resource,
  ResourceAvailability,
  ResourceCategory,
  ResourceDocument,
  ResourceDocumentTask,
  ResourceStatus,
} from '~~/shared/types/domain'
import {
  adminResourceCategoryOptions,
  isAdminResourceAvailability,
  isAdminResourceCategory,
  isAdminResourceStatus,
} from '~/utils/admin-resource-form'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const { contestId, resourceId, withEmbed } = useAdminContestRoute()

const loading = ref(false)
const saving = ref(false)
const reparseLoading = ref(false)
const errorText = ref('')
const draftText = ref('')
const documentInfo = ref<(ResourceDocument & {
  latestTask: ResourceDocumentTask | null
  previewUrl: string
}) | null>(null)
const draftBridge = useAdminAgentDraft()

const form = reactive<{
  category: ResourceCategory
  title: string
  year: number
  url: string
  accessLevel: ResourceAvailability
  sourceType: string
  summary: string
  content: string
  metadataText: string
  copyrightNote: string
  status: ResourceStatus
}>({
  category: 'basic_info',
  title: '',
  year: new Date().getFullYear(),
  url: '',
  accessLevel: 'public',
  sourceType: 'official',
  summary: '',
  content: '',
  metadataText: '{}',
  copyrightNote: '',
  status: 'active',
})

const moduleDraft = computed(() => draftBridge.getDraft(contestId.value, 'resources'))
const draftUpdatedAt = computed(() => {
  const value = moduleDraft.value?.updatedAt
  if (!value)
    return ''
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
})

function parseMetadataText(input: string): Record<string, unknown> {
  const text = String(input || '').trim()
  if (!text)
    return {}
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    return parsed as Record<string, unknown>
  }
  catch {
    throw new Error('metadata 必须是合法 JSON 对象。')
  }
}

function applyAiDraft() {
  const payload = moduleDraft.value?.payload || {}

  const category = String(payload.category || '').trim()
  if (isAdminResourceCategory(category))
    form.category = category

  const accessLevel = String(payload.accessLevel || '').trim()
  if (isAdminResourceAvailability(accessLevel))
    form.accessLevel = accessLevel

  const status = String(payload.status || '').trim()
  if (isAdminResourceStatus(status))
    form.status = status

  form.title = String(payload.title || '')
  form.year = Number(payload.year || new Date().getFullYear())
  form.url = String(payload.url || '')
  form.sourceType = String(payload.sourceType || form.sourceType)
  form.summary = String(payload.summary || '')
  form.content = String(payload.content || '')
  form.copyrightNote = String(payload.copyrightNote || '')

  if (payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata))
    form.metadataText = JSON.stringify(payload.metadata, null, 2)

  draftText.value = 'AI 草稿已应用到表单，请点击“保存”。'
}

function clearAiDraft() {
  draftBridge.clearDraft(contestId.value, 'resources')
  draftText.value = ''
}

async function loadResource() {
  loading.value = true
  errorText.value = ''
  try {
    const [resourceResponse, docResponse] = await Promise.all([
      $fetch<ApiResponse<Resource[]>>(endpoint(`/admin/contests/${contestId.value}/resources`)),
      $fetch<ApiResponse<(ResourceDocument & {
        latestTask: ResourceDocumentTask | null
        previewUrl: string
      })>>(endpoint(`/admin/contests/${contestId.value}/resources/${resourceId.value}/document`)).catch(() => null),
    ])
    const response = resourceResponse
    const item = response.data.find(resource => resource.id === resourceId.value)
    if (!item) {
      errorText.value = '未找到该资料。'
      return
    }

    documentInfo.value = docResponse?.data || null

    form.category = item.category || 'basic_info'
    form.title = item.title || ''
    form.year = Number(item.year || new Date().getFullYear())
    form.url = item.sourceLink || ''
    form.accessLevel = item.availability || 'public'
    form.sourceType = item.sourceType || 'official'
    form.summary = item.summary || ''
    form.content = item.content || ''
    form.metadataText = JSON.stringify(item.metadata || {}, null, 2)
    form.copyrightNote = item.copyrightNote || ''
    form.status = item.status || 'active'
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '资料加载失败。')
  }
  finally {
    loading.value = false
  }
}

async function save() {
  if (!form.category || !form.title.trim()) {
    errorText.value = '请填写分类、标题。'
    return
  }
  if (!form.url.trim() && !form.content.trim()) {
    errorText.value = '链接 URL 与正文内容至少填写一个。'
    return
  }

  saving.value = true
  errorText.value = ''
  try {
    const metadata = parseMetadataText(form.metadataText)
    await $fetch(endpoint(`/admin/contests/${contestId.value}/resources`), {
      method: 'PATCH',
      body: {
        resourceId: resourceId.value,
        category: form.category,
        title: form.title.trim(),
        year: Number(form.year || new Date().getFullYear()),
        url: form.url.trim(),
        accessLevel: form.accessLevel,
        sourceType: form.sourceType.trim(),
        summary: form.summary.trim(),
        content: form.content.trim(),
        metadata,
        copyrightNote: form.copyrightNote.trim(),
        status: form.status,
      },
    })
    await navigateTo(withEmbed(`/admin/contests/${contestId.value}/resources`))
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || error?.message || '资料更新失败。')
  }
  finally {
    saving.value = false
  }
}

async function reparse() {
  if (!documentInfo.value)
    return
  reparseLoading.value = true
  errorText.value = ''
  try {
    await $fetch(endpoint(`/admin/documents/${documentInfo.value.id}/reparse`), {
      method: 'POST',
    })
    await loadResource()
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '重试解析失败。')
  }
  finally {
    reparseLoading.value = false
  }
}

onMounted(loadResource)
</script>

<template>
  <PageShell size="compact">
    <PageHeader title="编辑资料" :meta="`resource_id：${resourceId}`">
      <template #actions>
        <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/resources`)">
          返回资料列表
        </NuxtLink>
      </template>
    </PageHeader>

    <AdminResourceForm
      :form="form"
      :category-options="adminResourceCategoryOptions"
      :loading="loading"
      :saving="saving"
      :error-text="errorText"
      :draft-text="draftText"
      :draft-title="moduleDraft?.title || (moduleDraft ? '资料草稿' : '')"
      :draft-updated-at="draftUpdatedAt"
      :document-info="documentInfo"
      :reparse-loading="reparseLoading"
      @submit="save"
      @apply-draft="applyAiDraft"
      @clear-draft="clearAiDraft"
      @reparse="reparse"
    >
      <template #documentActions>
        <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/resources/${resourceId}/annotate`)">
          标注编辑
        </NuxtLink>
      </template>
    </AdminResourceForm>
  </PageShell>
</template>

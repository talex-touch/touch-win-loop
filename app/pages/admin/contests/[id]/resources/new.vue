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
const { contestId, withEmbed } = useAdminContestRoute()

const saving = ref(false)
const errorText = ref('')
const draftText = ref('')
const selectedFile = ref<File | null>(null)
const createMode = ref<'manual' | 'pdf'>('manual')
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
  category: 'templates',
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

  draftText.value = 'AI 草稿已应用到表单，请确认后保存。'
}

function clearAiDraft() {
  draftBridge.clearDraft(contestId.value, 'resources')
  draftText.value = ''
}

function onSelectFile(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] || null
  selectedFile.value = file
  if (file && !form.title.trim()) {
    form.title = file.name.replace(/\.(pdf|docx?)$/i, '')
  }
}

const selectedFileMeta = computed(() => {
  if (!selectedFile.value)
    return null
  return {
    name: selectedFile.value.name,
    sizeKb: Math.ceil(selectedFile.value.size / 1024),
  }
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

async function saveManual() {
  if (!form.category || !form.title.trim())
    throw new Error('请填写分类和标题。')
  if (!form.url.trim() && !form.content.trim())
    throw new Error('链接 URL 与正文内容至少填写一个。')

  const metadata = parseMetadataText(form.metadataText)
  const response = await unsafeFetch<ApiResponse<Resource>>(endpoint(`/admin/contests/${contestId.value}/resources`), {
    method: 'POST',
    body: {
      category: form.category,
      title: form.title.trim(),
      year: Number(form.year || new Date().getFullYear()),
      url: form.url.trim(),
      accessLevel: form.accessLevel,
      sourceType: form.sourceType.trim() || 'manual',
      summary: form.summary.trim(),
      content: form.content.trim(),
      metadata,
      copyrightNote: form.copyrightNote.trim(),
      status: form.status,
    },
  })

  await navigateTo(withEmbed(`/admin/contests/${contestId.value}/resources/${response.data.id}/edit`))
}

function isSupportedDocumentFile(file: File): boolean {
  const lowerName = file.name.toLowerCase()
  return lowerName.endsWith('.pdf')
    || lowerName.endsWith('.doc')
    || lowerName.endsWith('.docx')
}

async function saveDocument() {
  if (!selectedFile.value) {
    throw new Error('请先选择文档文件。')
  }

  if (!isSupportedDocumentFile(selectedFile.value))
    throw new Error('仅支持上传 PDF/DOC/DOCX 文件。')

  const formData = new FormData()
  formData.append('file', selectedFile.value)
  formData.append('category', form.category)
  formData.append('title', form.title.trim())
  formData.append('year', String(Number(form.year || new Date().getFullYear())))
  formData.append('accessLevel', form.accessLevel)
  formData.append('sourceType', form.sourceType.trim() || 'upload-document')
  formData.append('summary', form.summary.trim())
  formData.append('copyrightNote', form.copyrightNote.trim())
  formData.append('status', form.status)

  const response = await unsafeFetch<ApiResponse<{
    resource: { id: string }
    document: ResourceDocument
    task: ResourceDocumentTask
  }>>(endpoint(`/admin/contests/${contestId.value}/resources/document`), {
    method: 'POST',
    body: formData,
  })

  await navigateTo(withEmbed(`/admin/contests/${contestId.value}/resources/${response.data.resource.id}/edit`))
}

async function save() {
  saving.value = true
  errorText.value = ''
  try {
    if (createMode.value === 'manual')
      await saveManual()
    else
      await saveDocument()
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || error?.message || '保存失败。')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <PageShell size="compact">
    <PageHeader
      title="新增资料"
      description="支持结构化录入与文档上传解析两种方式。"
      :meta="`赛事 ID：${contestId}`"
    >
      <template #actions>
        <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/resources`)">
          返回资料列表
        </NuxtLink>
      </template>
    </PageHeader>

    <AdminResourceForm
      :form="form"
      :category-options="adminResourceCategoryOptions"
      :saving="saving"
      :error-text="errorText"
      :draft-text="draftText"
      :draft-title="moduleDraft?.title || (moduleDraft ? '资料草稿' : '')"
      :draft-updated-at="draftUpdatedAt"
      :create-mode="createMode"
      :show-create-mode="true"
      :selected-file="selectedFileMeta"
      :submit-label="createMode === 'manual' ? '保存资料' : '上传并解析'"
      :saving-label="createMode === 'manual' ? '保存中...' : '上传中...'"
      @submit="save"
      @apply-draft="applyAiDraft"
      @clear-draft="clearAiDraft"
      @update:create-mode="createMode = $event"
      @select-file="onSelectFile"
    />
  </PageShell>
</template>

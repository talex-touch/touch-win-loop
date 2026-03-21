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

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'
const route = useRoute()

const categoryOptions: Array<{ value: ResourceCategory, label: string }> = [
  { value: 'basic_info', label: '基本信息' },
  { value: 'timeline', label: '时间轴' },
  { value: 'tracks', label: '赛道设置' },
  { value: 'scoring', label: '评分标准' },
  { value: 'past_questions', label: '往届真题' },
  { value: 'awarded_works', label: '获奖作品' },
  { value: 'templates', label: '模板资料' },
  { value: 'faq', label: 'FAQ' },
  { value: 'judge_guidelines', label: '评委细则' },
  { value: 'track_details', label: '赛道详解' },
  { value: 'ai_prompts', label: 'AI 提示词' },
  { value: 'submission_examples', label: '材料示例' },
  { value: 'policy_notice', label: '政策通知' },
  { value: 'compliance', label: '合规与版权' },
]

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
  if (categoryOptions.some(item => item.value === category))
    form.category = category as ResourceCategory

  const accessLevel = String(payload.accessLevel || '').trim()
  if (accessLevel === 'public' || accessLevel === 'login_required' || accessLevel === 'unavailable')
    form.accessLevel = accessLevel as ResourceAvailability

  const status = String(payload.status || '').trim()
  if (status === 'active' || status === 'pending_verify' || status === 'invalid' || status === 'archived')
    form.status = status as ResourceStatus

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
  const response = await $fetch<ApiResponse<Resource>>(endpoint(`/admin/contests/${contestId.value}/resources`), {
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

  const response = await $fetch<ApiResponse<{
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
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 class="text-lg text-slate-900 font-semibold">
            新增资料
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            赛事 ID：{{ contestId }}。支持结构化录入与文档上传解析两种方式。
          </p>
        </div>
        <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/resources`)">
          返回资料列表
        </NuxtLink>
      </div>
    </section>

    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="text-xs mb-3 flex flex-wrap gap-2 items-center">
        <button
          class="px-3 py-1.5 border rounded transition-colors"
          :class="createMode === 'manual' ? 'border-slate-800 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'"
          @click="createMode = 'manual'"
        >
          结构化录入
        </button>
        <button
          class="px-3 py-1.5 border rounded transition-colors"
          :class="createMode === 'pdf' ? 'border-slate-800 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'"
          @click="createMode = 'pdf'"
        >
          文档上传解析
        </button>
      </div>

      <div v-if="moduleDraft" class="text-xs text-emerald-700 mb-3 p-3 border border-emerald-200 rounded bg-emerald-50">
        <p class="font-semibold">
          检测到 AI 草稿：{{ moduleDraft.title || '资料草稿' }}
        </p>
        <p class="mt-1">
          更新时间：{{ draftUpdatedAt }}。应用后仍需手动确认并保存。
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

      <div v-if="createMode === 'pdf'" class="space-y-2">
        <label class="text-xs text-slate-700 font-medium block">文档文件</label>
        <input
          type="file"
          accept="application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          class="dense-input w-full block"
          @change="onSelectFile"
        >
        <p class="text-xs text-slate-500">
          {{ selectedFile ? `已选择：${selectedFile.name} (${Math.ceil(selectedFile.size / 1024)} KB)` : '请上传 PDF/DOC/DOCX。' }}
        </p>
      </div>

      <div class="mt-3 gap-2 grid md:grid-cols-3">
        <a-select v-model="form.category" size="small" placeholder="分类">
          <a-option v-for="item in categoryOptions" :key="item.value" :value="item.value">
            {{ item.label }}
          </a-option>
        </a-select>
        <a-input v-model="form.title" size="small" placeholder="标题" />
        <a-input-number v-model="form.year" size="small" :min="2000" :max="2100" placeholder="年份" />
        <a-select v-model="form.accessLevel" size="small" placeholder="可访问性">
          <a-option value="public">
            public
          </a-option>
          <a-option value="login_required">
            login_required
          </a-option>
          <a-option value="unavailable">
            unavailable
          </a-option>
        </a-select>
        <a-input v-model="form.sourceType" size="small" placeholder="来源类型（如 manual / upload-document）" />
        <a-select v-model="form.status" size="small" placeholder="状态">
          <a-option value="active">
            active
          </a-option>
          <a-option value="pending_verify">
            pending_verify
          </a-option>
          <a-option value="invalid">
            invalid
          </a-option>
          <a-option value="archived">
            archived
          </a-option>
        </a-select>
      </div>

      <a-input
        v-if="createMode === 'manual'"
        v-model="form.url"
        size="small"
        class="mt-2"
        placeholder="链接 URL（可留空）"
      />
      <a-textarea
        v-model="form.summary"
        class="mt-2"
        :auto-size="{ minRows: 3, maxRows: 5 }"
        placeholder="摘要"
      />
      <a-textarea
        v-if="createMode === 'manual'"
        v-model="form.content"
        class="mt-2"
        :auto-size="{ minRows: 6, maxRows: 12 }"
        placeholder="正文内容（内部知识条目可直接填写）"
      />
      <a-textarea
        v-if="createMode === 'manual'"
        v-model="form.metadataText"
        class="mt-2"
        :auto-size="{ minRows: 4, maxRows: 8 }"
        placeholder="metadata JSON（例如 AI 提示词目标、作用域、优先级）"
      />
      <a-textarea
        v-model="form.copyrightNote"
        class="mt-2"
        :auto-size="{ minRows: 3, maxRows: 5 }"
        placeholder="版权说明"
      />

      <a-button type="primary" size="small" class="mt-3" :loading="saving" @click="save">
        {{ saving ? (createMode === 'manual' ? '保存中...' : '上传中...') : (createMode === 'manual' ? '保存资料' : '上传并解析') }}
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

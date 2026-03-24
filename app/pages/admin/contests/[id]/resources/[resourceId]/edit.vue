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
const { endpoint } = useApiEndpoint(runtime)
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

const contestId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.id
  return Array.isArray(value) ? (value[0] || '') : (value || '')
})

const resourceId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.resourceId
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
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 class="text-lg text-slate-900 font-semibold">
            编辑资料
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            resource_id：{{ resourceId }}
          </p>
        </div>
        <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/resources`)">
          返回资料列表
        </NuxtLink>
      </div>
    </section>

    <section v-if="loading" class="p-4 border border-slate-200 rounded-lg bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="6" />
      </a-skeleton>
    </section>

    <section v-else class="p-4 border border-slate-200 rounded-lg bg-white">
      <div v-if="moduleDraft" class="text-xs text-emerald-700 mb-4 p-3 border border-emerald-200 rounded bg-emerald-50">
        <p class="font-semibold">
          检测到 AI 草稿：{{ moduleDraft.title || '资料草稿' }}
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

      <div
        v-if="documentInfo"
        class="text-xs text-slate-700 mb-4 p-3 border border-slate-200 rounded-lg bg-slate-50"
      >
        <div class="flex flex-wrap gap-2 items-center justify-between">
          <div class="space-y-1">
            <p>文档状态：<span class="font-semibold">{{ documentInfo.parseStatus }}</span></p>
            <p>页数：{{ documentInfo.pageCount || '-' }}；解析模型：{{ documentInfo.parserProvider || '-' }} / {{ documentInfo.parserModel || '-' }}</p>
            <p v-if="documentInfo.parseError" class="text-rose-600">
              错误：{{ documentInfo.parseError }}
            </p>
          </div>
          <div class="flex gap-2 items-center">
            <a
              :href="documentInfo.previewUrl"
              target="_blank"
              class="dense-btn"
            >
              预览 PDF
            </a>
            <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/resources/${resourceId}/annotate`)">
              标注编辑
            </NuxtLink>
            <a-button size="small" :loading="reparseLoading" @click="reparse">
              {{ reparseLoading ? '提交中...' : '重试解析' }}
            </a-button>
          </div>
        </div>
      </div>

      <div class="gap-2 grid md:grid-cols-3">
        <a-select v-model="form.category" size="small" placeholder="分类">
          <a-option v-for="item in categoryOptions" :key="item.value" :value="item.value">
            {{ item.label }}
          </a-option>
        </a-select>
        <a-input v-model="form.title" size="small" placeholder="标题" />
        <a-input-number v-model="form.year" size="small" :min="2000" :max="2100" placeholder="年份" />
        <a-input v-model="form.url" size="small" class="md:col-span-3" placeholder="链接 URL" />
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
        <a-input v-model="form.sourceType" size="small" placeholder="来源类型（如 official）" />
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

      <a-textarea
        v-model="form.summary"
        class="mt-2"
        :auto-size="{ minRows: 3, maxRows: 5 }"
        placeholder="摘要"
      />
      <a-textarea
        v-model="form.content"
        class="mt-2"
        :auto-size="{ minRows: 6, maxRows: 12 }"
        placeholder="正文内容（内部知识条目可直接填写）"
      />
      <a-textarea
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

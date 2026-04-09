<script setup lang="ts">
import type {
  ApiResponse,
  ContestDetailPayload,
  ContestLevel,
  ContestVisibility,
  DisciplineDictionaryItem,
} from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const route = useRoute()

type ApiRequestError = Error & {
  data?: {
    message?: string
  }
}

function createApiRequestError(message: string): ApiRequestError {
  const error = new Error(message) as ApiRequestError
  error.data = { message }
  return error
}

async function requestApi<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    body?: unknown
  } = {},
  fallbackMessage = '请求失败。',
): Promise<T> {
  const headers = new Headers()
  let body: BodyInit | undefined
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(options.body)
  }

  const response = await fetch(path, {
    method: options.method || 'GET',
    credentials: 'include',
    headers,
    body,
  })
  const payload = await response.json().catch(() => null) as ApiResponse<T> | null
  if (!response.ok || !payload || payload.code !== 0)
    throw createApiRequestError(String(payload?.message || fallbackMessage))
  return payload.data
}

function splitCsv(value: string): string[] {
  return value
    .split(/[\n,，、;]/g)
    .map(item => item.trim())
    .filter(Boolean)
}

function toCsv(values?: string[]): string {
  return (values || []).join(', ')
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
const draftText = ref('')
const disciplineOptions = ref<DisciplineDictionaryItem[]>([])
const draftBridge = useAdminAgentDraft()

const form = reactive<{
  name: string
  level: ContestLevel
  organizer: string
  coOrganizer: string
  officialUrl: string
  summary: string
  participantRequirements: string
  teamRule: string
  currentSeason: string
  aliasesCsv: string
  keywordsCsv: string
  recommendedForCsv: string
  hotScore: number
  visibility: ContestVisibility
  disciplines: string[]
}>({
  name: '',
  level: 'national',
  organizer: '',
  coOrganizer: '',
  officialUrl: '',
  summary: '',
  participantRequirements: '',
  teamRule: '',
  currentSeason: '',
  aliasesCsv: '',
  keywordsCsv: '',
  recommendedForCsv: '',
  hotScore: 0,
  visibility: 'internal',
  disciplines: [],
})

const moduleDraft = computed(() => draftBridge.getDraft(contestId.value, 'overview'))
const draftUpdatedAt = computed(() => {
  const value = moduleDraft.value?.updatedAt
  if (!value)
    return ''
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
})

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value.map(item => String(item || '').trim()).filter(Boolean)
}

function applyAiDraft() {
  const payload = moduleDraft.value?.payload || {}

  const level = String(payload.level || '').trim()
  if (['national', 'provincial', 'school', 'industry'].includes(level))
    form.level = level as ContestLevel

  const visibility = String(payload.visibility || '').trim()
  if (visibility === 'internal' || visibility === 'public')
    form.visibility = visibility as ContestVisibility

  form.name = String(payload.name || '')
  form.organizer = String(payload.organizer || '')
  form.coOrganizer = String(payload.coOrganizer || '')
  form.officialUrl = String(payload.officialUrl || '')
  form.summary = String(payload.summary || '')
  form.participantRequirements = String(payload.participantRequirements || '')
  form.teamRule = String(payload.teamRule || '')
  form.currentSeason = String(payload.currentSeason || '')
  form.aliasesCsv = toCsv(toStringArray(payload.aliases))
  form.keywordsCsv = toCsv(toStringArray(payload.keywords))
  form.recommendedForCsv = toCsv(toStringArray(payload.recommendedFor))
  form.hotScore = Number(payload.hotScore || 0)
  form.disciplines = toStringArray(payload.disciplines)

  draftText.value = 'AI 草稿已应用到表单，请点击页面顶部“保存”提交。'
}

function clearAiDraft() {
  draftBridge.clearDraft(contestId.value, 'overview')
  draftText.value = ''
}

function toggleDiscipline(value: string) {
  if (form.disciplines.includes(value))
    form.disciplines = form.disciplines.filter(item => item !== value)
  else
    form.disciplines = [...form.disciplines, value]
}

async function loadData() {
  if (!contestId.value)
    return

  loading.value = true
  errorText.value = ''
  try {
    const [detailData, disciplineData] = await Promise.all([
      requestApi<ContestDetailPayload>(endpoint(`/contests/${contestId.value}`), {}, '基础信息加载失败。'),
      requestApi<DisciplineDictionaryItem[]>(endpoint('/admin/dictionaries/disciplines'), {}, '基础信息加载失败。'),
    ])

    const contest = detailData.contest
    disciplineOptions.value = disciplineData

    form.name = contest.name || ''
    form.level = contest.level
    form.organizer = contest.organizer || ''
    form.coOrganizer = contest.coOrganizer || ''
    form.officialUrl = contest.officialUrl || ''
    form.summary = contest.summary || ''
    form.participantRequirements = contest.participantRequirements || ''
    form.teamRule = contest.teamRule || ''
    form.currentSeason = contest.currentSeason || ''
    form.aliasesCsv = toCsv(contest.aliases)
    form.keywordsCsv = toCsv(contest.keywords)
    form.recommendedForCsv = toCsv(contest.recommendedFor)
    form.hotScore = Number(contest.hotScore || 0)
    form.visibility = contest.visibility || 'internal'
    form.disciplines = contest.disciplines || []
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '基础信息加载失败。')
  }
  finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await requestApi<unknown>(
      endpoint(`/admin/contests/${contestId.value}`),
      {
        method: 'PATCH',
        body: {
          name: form.name.trim(),
          level: form.level,
          organizer: form.organizer.trim(),
          coOrganizer: form.coOrganizer.trim(),
          officialUrl: form.officialUrl.trim(),
          summary: form.summary.trim(),
          participantRequirements: form.participantRequirements.trim(),
          teamRule: form.teamRule.trim(),
          currentSeason: form.currentSeason.trim(),
          disciplines: form.disciplines,
          aliases: splitCsv(form.aliasesCsv),
          keywords: splitCsv(form.keywordsCsv),
          recommendedFor: splitCsv(form.recommendedForCsv),
          hotScore: Number(form.hotScore || 0),
          visibility: form.visibility,
        },
      },
      '基础信息保存失败。',
    )
    successText.value = '基础信息已保存。'
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '保存失败。')
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
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 class="text-lg text-slate-900 font-semibold">
            基础信息编辑
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            赛事 ID：{{ contestId }}
          </p>
        </div>
        <div class="flex gap-2 items-center">
          <a-button type="primary" size="small" :loading="saving" @click="save">
            保存
          </a-button>
        </div>
      </div>
    </section>

    <section v-if="loading" class="p-4 border border-slate-200 rounded-lg bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="7" />
      </a-skeleton>
    </section>

    <section v-else class="p-4 border border-slate-200 rounded-lg bg-white">
      <div v-if="moduleDraft" class="text-xs text-emerald-700 mb-3 p-3 border border-emerald-200 rounded bg-emerald-50">
        <p class="font-semibold">
          检测到 AI 草稿：{{ moduleDraft.title || '基础信息草稿' }}
        </p>
        <p class="mt-1">
          更新时间：{{ draftUpdatedAt }}。应用后不会自动写库，需要手动点击“保存”。
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

      <div class="gap-2 grid md:grid-cols-3">
        <a-input v-model="form.name" size="small" placeholder="赛事名称" />
        <a-select v-model="form.level" size="small" placeholder="级别">
          <a-option value="national">
            国家级
          </a-option>
          <a-option value="provincial">
            省级
          </a-option>
          <a-option value="school">
            校级
          </a-option>
          <a-option value="industry">
            行业级
          </a-option>
        </a-select>
        <a-select v-model="form.visibility" size="small" placeholder="可见性">
          <a-option value="internal">
            internal
          </a-option>
          <a-option value="public">
            public
          </a-option>
        </a-select>
        <a-input v-model="form.organizer" size="small" placeholder="主办方（支持多个，逗号分隔）" />
        <a-input v-model="form.coOrganizer" size="small" placeholder="承办/协办单位（支持多个，逗号分隔）" />
        <a-input v-model="form.currentSeason" size="small" placeholder="当前届次" />
        <a-input v-model="form.officialUrl" size="small" class="md:col-span-3" placeholder="官网链接" />
        <a-input-number v-model="form.hotScore" size="small" :min="0" :max="1000" placeholder="热度分" />
        <a-input v-model="form.aliasesCsv" size="small" class="md:col-span-2" placeholder="别名（逗号分隔）" />
        <a-input v-model="form.keywordsCsv" size="small" class="md:col-span-3" placeholder="关键词（逗号分隔）" />
        <a-input v-model="form.recommendedForCsv" size="small" class="md:col-span-3" placeholder="适配人群（逗号分隔）" />
      </div>

      <div class="mt-3 p-3 border border-slate-200 rounded">
        <p class="text-xs text-slate-700 font-semibold">
          学科门类（13 大类）
        </p>
        <div class="mt-2 gap-2 grid md:grid-cols-3">
          <div
            v-for="item in disciplineOptions"
            :key="item.code"
            class="text-xs px-2 py-1 border border-slate-200 rounded flex gap-2 items-center"
          >
            <a-checkbox :model-value="form.disciplines.includes(item.label)" @change="() => toggleDiscipline(item.label)">
              {{ item.label }}
            </a-checkbox>
          </div>
        </div>
      </div>

      <a-textarea
        v-model="form.summary"
        class="mt-3"
        :auto-size="{ minRows: 4, maxRows: 6 }"
        placeholder="竞赛简介"
      />
      <a-textarea
        v-model="form.participantRequirements"
        class="mt-2"
        :auto-size="{ minRows: 3, maxRows: 5 }"
        placeholder="参赛对象/限制"
      />
      <a-textarea
        v-model="form.teamRule"
        class="mt-2"
        :auto-size="{ minRows: 3, maxRows: 5 }"
        placeholder="组队规则"
      />
    </section>

    <section v-if="errorText" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-lg bg-rose-50">
      {{ errorText }}
    </section>

    <section v-if="successText" class="text-sm text-emerald-700 p-4 border border-emerald-200 rounded-lg bg-emerald-50">
      {{ successText }}
    </section>

    <section v-if="draftText" class="text-sm text-emerald-700 p-4 border border-emerald-200 rounded-lg bg-emerald-50">
      {{ draftText }}
    </section>
  </div>
</template>

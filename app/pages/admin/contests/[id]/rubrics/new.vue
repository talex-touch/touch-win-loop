<script setup lang="ts">
import type {
  ApiResponse,
  ContestStatus,
  RubricDimension,
  RubricScoringMode,
  Track,
} from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

interface RubricDimensionInput {
  key: string
  name: string
  weightText: string
  description: string
  scoringPoint: string
  deductionPoint: string
  evidenceRequirement: string
}

const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'
const route = useRoute()

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

function splitCsv(value: string): string[] {
  return value
    .split(/[\n,，、;]/g)
    .map(item => item.trim())
    .filter(Boolean)
}

function toLines(value: unknown): string {
  if (!Array.isArray(value))
    return ''
  return value.map(item => String(item || '').trim()).filter(Boolean).join('\n')
}

function createEmptyDimension(index: number): RubricDimensionInput {
  return {
    key: `dim-${index + 1}`,
    name: '',
    weightText: '',
    description: '',
    scoringPoint: '',
    deductionPoint: '',
    evidenceRequirement: '',
  }
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

const loading = ref(false)
const saving = ref(false)
const errorText = ref('')
const draftText = ref('')
const tracks = ref<Track[]>([])
const draftBridge = useAdminAgentDraft()

const form = reactive<{
  trackId: string
  scoringMode: RubricScoringMode
  version: number
  status: ContestStatus
  scoringPointsText: string
  deductionItemsText: string
  evidenceRequirementsText: string
}>({
  trackId: '',
  scoringMode: 'weighted',
  version: 1,
  status: 'draft',
  scoringPointsText: '',
  deductionItemsText: '',
  evidenceRequirementsText: '',
})

const dimensions = ref<RubricDimensionInput[]>([createEmptyDimension(0)])

const moduleDraft = computed(() => draftBridge.getDraft(contestId.value, 'rubrics'))
const draftUpdatedAt = computed(() => {
  const value = moduleDraft.value?.updatedAt
  if (!value)
    return ''
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai',
  })
})

function addDimension() {
  dimensions.value = [...dimensions.value, createEmptyDimension(dimensions.value.length)]
}

function removeDimension(index: number) {
  const next = dimensions.value.filter((_, idx) => idx !== index)
  dimensions.value = next.length > 0 ? next : [createEmptyDimension(0)]
}

function buildDimensions(): { value: RubricDimension[] | null, error: string } {
  if (dimensions.value.length === 0)
    return { value: null, error: '至少需要 1 个评分维度。' }

  const result: RubricDimension[] = []
  let totalWeight = 0

  for (let index = 0; index < dimensions.value.length; index += 1) {
    const item = dimensions.value[index]
    if (!item)
      continue
    const name = item.name.trim()
    if (!name)
      return { value: null, error: `第 ${index + 1} 行维度名称不能为空。` }

    const key = item.key.trim() || `dim-${index + 1}`
    const weightText = item.weightText.trim()
    let weight: number | undefined

    if (form.scoringMode === 'weighted') {
      if (!weightText)
        return { value: null, error: `第 ${index + 1} 行权重不能为空。` }
      const parsed = Number(weightText)
      if (!Number.isFinite(parsed) || parsed <= 0)
        return { value: null, error: `第 ${index + 1} 行权重必须大于 0。` }
      weight = parsed
      totalWeight += parsed
    }
    else if (weightText) {
      const parsed = Number(weightText)
      if (!Number.isFinite(parsed) || parsed < 0)
        return { value: null, error: `第 ${index + 1} 行权重必须为非负数。` }
      weight = parsed
    }

    result.push({
      key,
      name,
      weight,
      description: item.description.trim(),
      scoringPoint: item.scoringPoint.trim(),
      deductionPoint: item.deductionPoint.trim(),
      evidenceRequirement: item.evidenceRequirement.trim(),
    })
  }

  if (form.scoringMode === 'weighted' && Math.round(totalWeight) !== 100)
    return { value: null, error: `加权模式下总权重必须为 100，当前为 ${totalWeight}。` }

  return { value: result, error: '' }
}

function toDraftDimensionInput(items: unknown): RubricDimensionInput[] {
  if (!Array.isArray(items))
    return []

  return items
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        return null
      const source = item as Record<string, unknown>
      return {
        key: String(source.key || `dim-${index + 1}`).trim() || `dim-${index + 1}`,
        name: String(source.name || '').trim(),
        weightText: source.weight === undefined || source.weight === null ? '' : String(source.weight),
        description: String(source.description || ''),
        scoringPoint: String(source.scoringPoint || ''),
        deductionPoint: String(source.deductionPoint || ''),
        evidenceRequirement: String(source.evidenceRequirement || ''),
      } satisfies RubricDimensionInput
    })
    .filter(Boolean) as RubricDimensionInput[]
}

function applyAiDraft() {
  const payload = moduleDraft.value?.payload || {}

  const trackValue = String(payload.trackId || '').trim()
  if (trackValue)
    form.trackId = trackValue

  const scoringMode = String(payload.scoringMode || '').trim()
  if (scoringMode === 'weighted' || scoringMode === 'checklist')
    form.scoringMode = scoringMode

  const status = String(payload.status || '').trim()
  if (status === 'draft' || status === 'published' || status === 'archived')
    form.status = status

  form.version = Number(payload.version || 1)
  form.scoringPointsText = toLines(payload.scoringPoints)
  form.deductionItemsText = toLines(payload.deductionItems)
  form.evidenceRequirementsText = toLines(payload.evidenceRequirements)

  const parsedDimensions = toDraftDimensionInput(payload.dimensions)
  dimensions.value = parsedDimensions.length > 0 ? parsedDimensions : [createEmptyDimension(0)]
  draftText.value = 'AI 草稿已应用到表单，请点击“保存”。'
}

function clearAiDraft() {
  draftBridge.clearDraft(contestId.value, 'rubrics')
  draftText.value = ''
}

async function loadTracks() {
  loading.value = true
  errorText.value = ''
  try {
    const response = await $fetch<ApiResponse<Track[]>>(endpoint(`/admin/contests/${contestId.value}/tracks`))
    tracks.value = response.data
    if (!form.trackId && tracks.value.length > 0)
      form.trackId = tracks.value[0]!.id
  }
  catch (error: any) {
    tracks.value = []
    errorText.value = String(error?.data?.message || '赛道加载失败。')
  }
  finally {
    loading.value = false
  }
}

async function save() {
  if (!form.trackId) {
    errorText.value = '请选择赛道。'
    return
  }

  const dimensionResult = buildDimensions()
  if (!dimensionResult.value) {
    errorText.value = dimensionResult.error
    return
  }

  saving.value = true
  errorText.value = ''
  try {
    await $fetch(endpoint(`/admin/contests/${contestId.value}/rubrics`), {
      method: 'POST',
      body: {
        trackId: form.trackId,
        scoringMode: form.scoringMode,
        version: Number(form.version || 1),
        dimensions: dimensionResult.value,
        scoringPoints: splitCsv(form.scoringPointsText),
        deductionItems: splitCsv(form.deductionItemsText),
        evidenceRequirements: splitCsv(form.evidenceRequirementsText),
        status: form.status,
      },
    })
    await navigateTo(withEmbed(`/admin/contests/${contestId.value}/rubrics`))
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '新增评分规则失败。')
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
            新增评分规则
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            赛事 ID：{{ contestId }}
          </p>
        </div>
        <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/rubrics`)">
          返回评分规则列表
        </NuxtLink>
      </div>
    </section>

    <section v-if="loading" class="p-4 border border-slate-200 rounded-lg bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="6" />
      </a-skeleton>
    </section>

    <section v-else class="p-4 border border-slate-200 rounded-lg bg-white space-y-3">
      <div v-if="moduleDraft" class="text-xs text-emerald-700 p-3 border border-emerald-200 rounded bg-emerald-50">
        <p class="font-semibold">
          检测到 AI 草稿：{{ moduleDraft.title || '评分规则草稿' }}
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

      <div class="gap-2 grid md:grid-cols-4">
        <a-select v-model="form.trackId" size="small" placeholder="请选择赛道">
          <a-option value="">
            请选择赛道
          </a-option>
          <a-option v-for="item in tracks" :key="item.id" :value="item.id">
            {{ item.name }}
          </a-option>
        </a-select>
        <a-select v-model="form.scoringMode" size="small" placeholder="评分模式">
          <a-option value="weighted">
            weighted
          </a-option>
          <a-option value="checklist">
            checklist
          </a-option>
        </a-select>
        <a-input-number v-model="form.version" size="small" :min="1" :max="999" placeholder="版本" />
        <a-select v-model="form.status" size="small" placeholder="状态">
          <a-option value="draft">
            draft
          </a-option>
          <a-option value="published">
            published
          </a-option>
          <a-option value="archived">
            archived
          </a-option>
        </a-select>
      </div>

      <div class="gap-2 grid md:grid-cols-3">
        <a-textarea
          v-model="form.scoringPointsText"
          :auto-size="{ minRows: 3, maxRows: 5 }"
          placeholder="评分要点（逗号或换行分隔）"
        />
        <a-textarea
          v-model="form.deductionItemsText"
          :auto-size="{ minRows: 3, maxRows: 5 }"
          placeholder="扣分项（逗号或换行分隔）"
        />
        <a-textarea
          v-model="form.evidenceRequirementsText"
          :auto-size="{ minRows: 3, maxRows: 5 }"
          placeholder="佐证要求（逗号或换行分隔）"
        />
      </div>

      <div class="p-3 border border-slate-200 rounded">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-xs text-slate-700 font-semibold">
            评分维度表（{{ form.scoringMode }}）
          </p>
          <a-button size="mini" type="outline" @click="addDimension">
            新增维度
          </a-button>
        </div>
        <div class="overflow-x-auto">
          <table class="text-xs min-w-[980px] w-full">
            <thead>
              <tr class="text-slate-600 text-left border-b border-slate-200 bg-slate-50">
                <th class="px-2 py-2">
                  名称
                </th>
                <th class="px-2 py-2">
                  权重
                </th>
                <th class="px-2 py-2">
                  说明
                </th>
                <th class="px-2 py-2">
                  评分点
                </th>
                <th class="px-2 py-2">
                  扣分点
                </th>
                <th class="px-2 py-2">
                  佐证要求
                </th>
                <th class="px-2 py-2">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in dimensions" :key="`${item.key}-${index}`" class="border-b border-slate-100">
                <td class="px-2 py-2">
                  <a-input v-model="item.name" size="small" placeholder="维度名称" />
                </td>
                <td class="px-2 py-2">
                  <a-input
                    v-model="item.weightText"
                    size="small"
                    :placeholder="form.scoringMode === 'weighted' ? '必填' : '可空'"
                  />
                </td>
                <td class="px-2 py-2">
                  <a-input v-model="item.description" size="small" placeholder="说明" />
                </td>
                <td class="px-2 py-2">
                  <a-input v-model="item.scoringPoint" size="small" placeholder="评分点" />
                </td>
                <td class="px-2 py-2">
                  <a-input v-model="item.deductionPoint" size="small" placeholder="扣分点" />
                </td>
                <td class="px-2 py-2">
                  <a-input v-model="item.evidenceRequirement" size="small" placeholder="佐证要求" />
                </td>
                <td class="px-2 py-2">
                  <a-button size="mini" status="danger" @click="removeDimension(index)">
                    删除
                  </a-button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <a-button type="primary" size="small" :loading="saving" @click="save">
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

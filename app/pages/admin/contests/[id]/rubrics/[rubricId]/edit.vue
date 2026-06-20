<script setup lang="ts">
import type {
  ApiResponse,
  ContestStatus,
  Rubric,
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
const { endpoint } = useApiEndpoint(runtime)
const { contestId, rubricId, withEmbed } = useAdminContestRoute()

function splitCsv(value: string): string[] {
  return value
    .split(/[\n,，、;]/g)
    .map(item => item.trim())
    .filter(Boolean)
}

function toCsv(values?: string[]): string {
  return (values || []).join('\n')
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

function toDimensionInput(item: RubricDimension, index: number): RubricDimensionInput {
  return {
    key: String(item.key || `dim-${index + 1}`),
    name: String(item.name || ''),
    weightText: item.weight === undefined || item.weight === null ? '' : String(item.weight),
    description: String(item.description || ''),
    scoringPoint: String(item.scoringPoint || ''),
    deductionPoint: String(item.deductionPoint || ''),
    evidenceRequirement: String(item.evidenceRequirement || ''),
  }
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

async function loadRubric() {
  loading.value = true
  errorText.value = ''
  try {
    const [rubricsRes, tracksRes] = await Promise.all([
      unsafeFetch<ApiResponse<Rubric[]>>(endpoint(`/admin/contests/${contestId.value}/rubrics`)),
      unsafeFetch<ApiResponse<Track[]>>(endpoint(`/admin/contests/${contestId.value}/tracks`)),
    ])
    tracks.value = tracksRes.data
    const item = rubricsRes.data.find(rubric => rubric.id === rubricId.value)
    if (!item) {
      errorText.value = '未找到该评分规则。'
      return
    }

    form.trackId = item.trackId
    form.scoringMode = item.scoringMode || 'weighted'
    form.version = Number(item.version || 1)
    form.status = item.status || 'draft'
    form.scoringPointsText = toCsv(item.scoringPoints)
    form.deductionItemsText = toCsv(item.deductionItems)
    form.evidenceRequirementsText = toCsv(item.evidenceRequirements)
    dimensions.value = (item.dimensions || []).length > 0
      ? (item.dimensions || []).map((dimension, index) => toDimensionInput(dimension, index))
      : [createEmptyDimension(0)]
  }
  catch (error: any) {
    tracks.value = []
    dimensions.value = [createEmptyDimension(0)]
    errorText.value = String(error?.data?.message || '评分规则加载失败。')
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
    await unsafeFetch(endpoint(`/admin/contests/${contestId.value}/rubrics`), {
      method: 'PATCH',
      body: {
        rubricId: rubricId.value,
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
    errorText.value = String(error?.data?.message || '评分规则更新失败。')
  }
  finally {
    saving.value = false
  }
}

onMounted(loadRubric)
</script>

<template>
  <PageShell size="compact">
    <PageHeader title="编辑评分规则" :meta="`rubric_id：${rubricId}`">
      <template #actions>
        <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/rubrics`)">
          返回评分规则列表
        </NuxtLink>
      </template>
    </PageHeader>

    <AdminRubricForm
      :form="form"
      :dimensions="dimensions"
      :tracks="tracks"
      :loading="loading"
      :saving="saving"
      :error-text="errorText"
      :draft-text="draftText"
      :draft-title="moduleDraft?.title || (moduleDraft ? '评分规则草稿' : '')"
      :draft-updated-at="draftUpdatedAt"
      @submit="save"
      @apply-draft="applyAiDraft"
      @clear-draft="clearAiDraft"
      @add-dimension="addDimension"
      @remove-dimension="removeDimension"
    />
  </PageShell>
</template>

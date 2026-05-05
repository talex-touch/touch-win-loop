<script setup lang="ts">
interface FilterPreset {
  id: string
  title: string
  level: string
  trackType: string
  topK: number
}

const props = withDefaults(defineProps<{
  major?: string
  discipline?: string
  level?: string
  trackType?: string
  topK?: number
  aiFiltering?: boolean
  selectedContestId?: string
  aiReasoning?: string
  selectedResourcesCount?: number
}>(), {
  major: '',
  discipline: '',
  level: '',
  trackType: '',
  topK: 6,
  aiFiltering: false,
  selectedContestId: '',
  aiReasoning: '',
  selectedResourcesCount: 0,
})

const emit = defineEmits<{
  updateMajor: [value: string]
  updateDiscipline: [value: string]
  updateLevel: [value: string]
  updateTrackType: [value: string]
  updateTopK: [value: number]
  runAiFilter: []
}>()

const levelLabels: Record<string, string> = {
  national: '国赛',
  provincial: '省赛',
  school: '校赛',
  industry: '行业赛',
}

const levelOptions = [
  { value: '', label: '级别（全部）' },
  { value: 'national', label: 'national' },
  { value: 'provincial', label: 'provincial' },
  { value: 'school', label: 'school' },
  { value: 'industry', label: 'industry' },
] as const

const filterPresets: FilterPreset[] = [
  {
    id: 'national-ai',
    title: '国赛 + AI',
    level: 'national',
    trackType: 'AI',
    topK: 6,
  },
  {
    id: 'industry-practice',
    title: '行业实战',
    level: 'industry',
    trackType: '工程落地',
    topK: 8,
  },
  {
    id: 'school-sprint',
    title: '校赛冲刺',
    level: 'school',
    trackType: '',
    topK: 5,
  },
]

const hasReasoning = computed(() => Boolean(props.aiReasoning.trim()))

const analysisSuggestions = computed(() => {
  const suggestions: string[] = []

  if (!props.selectedContestId)
    suggestions.push('先在“竞赛分析”中锁定至少 1 个目标竞赛与赛道。')

  if (!hasReasoning.value)
    suggestions.push('执行一次 AI 筛选，系统会输出可解释排序与推荐理由。')

  if (hasReasoning.value)
    suggestions.push('已得到 AI 分析结果，下一步建议进入“项目设置”补全项目底座与竞赛适配稿。')

  if (props.selectedResourcesCount === 0)
    suggestions.push('资料池当前为空，建议先在资源管理器补齐规则文档和往届样例。')

  if (suggestions.length === 0)
    suggestions.push('当前信息较完整，可直接进入 Dashboard 推进提交与终审准备。')

  return suggestions.slice(0, 4)
})

function onTopKInput(event: Event) {
  const target = event.target as HTMLInputElement
  const value = Number(target.value)
  emit('updateTopK', Number.isNaN(value) ? 1 : value)
}

function applyFilterPreset(preset: FilterPreset) {
  emit('updateLevel', preset.level)
  emit('updateTrackType', preset.trackType)
  emit('updateTopK', preset.topK)
}
</script>

<template>
  <div class="workspace-left-panel__feature">
    <div class="workspace-left-panel__body no-scrollbar">
      <section class="workspace-card">
        <h3>项目分析</h3>
        <ul class="workspace-suggestion-list">
          <li
            v-for="(item, index) in analysisSuggestions"
            :key="`suggestion-${index}-${item}`"
          >
            {{ item }}
          </li>
        </ul>
      </section>

      <section class="workspace-card">
        <h3>分析参数</h3>
        <div class="workspace-form-grid">
          <input
            :value="props.major"
            class="workspace-input"
            placeholder="专业"
            @input="emit('updateMajor', ($event.target as HTMLInputElement).value)"
          >
          <input
            :value="props.discipline"
            class="workspace-input"
            placeholder="学科/方向"
            @input="emit('updateDiscipline', ($event.target as HTMLInputElement).value)"
          >
          <UiSelect
            :model-value="props.level"
            :options="levelOptions"
            aria-label="级别"
            @change="value => emit('updateLevel', String(value))"
          />
          <input
            :value="props.trackType"
            class="workspace-input"
            placeholder="赛道偏好"
            @input="emit('updateTrackType', ($event.target as HTMLInputElement).value)"
          >
        </div>

        <div class="workspace-topk-row">
          <label>返回条数</label>
          <input
            :value="props.topK"
            class="workspace-input workspace-input--small"
            max="20"
            min="1"
            type="number"
            @input="onTopKInput"
          >
        </div>
      </section>

      <section class="workspace-card">
        <h3>快速配置模板</h3>
        <div class="workspace-preset-list">
          <button
            v-for="preset in filterPresets"
            :key="preset.id"
            class="workspace-preset-item"
            type="button"
            @click="applyFilterPreset(preset)"
          >
            {{ preset.title }}：{{ levelLabels[preset.level] || preset.level }} / {{ preset.topK }} 条
          </button>
        </div>
        <button
          class="workspace-btn workspace-btn--primary"
          :disabled="props.aiFiltering"
          @click="emit('runAiFilter')"
        >
          以当前配置执行 AI 分析
        </button>
      </section>
    </div>
  </div>
</template>

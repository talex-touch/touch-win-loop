<script setup lang="ts">
import type { Contest } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  naturalQuery?: string
  major?: string
  discipline?: string
  level?: string
  trackType?: string
  topK?: number
  selectedContestId?: string
  contests?: Contest[]
  aiReasoning?: string
  normalizedInfo?: string
  statusLine?: string
  listLoading?: boolean
  aiFiltering?: boolean
  isAdminView?: boolean
}>(), {
  naturalQuery: '',
  major: '',
  discipline: '',
  level: '',
  trackType: '',
  topK: 6,
  selectedContestId: '',
  contests: () => [],
  aiReasoning: '',
  normalizedInfo: '',
  statusLine: '',
  listLoading: false,
  aiFiltering: false,
  isAdminView: false,
})

const emit = defineEmits<{
  updateNaturalQuery: [value: string]
  updateSelectedContestId: [value: string]
  loadContests: []
  runAiFilter: []
}>()

const levelLabels: Record<string, string> = {
  national: '国赛',
  provincial: '省赛',
  school: '校赛',
  industry: '行业赛',
}

const showReason = ref(false)
const showAdminDetails = ref(false)

const hasReasoning = computed(() => Boolean(props.aiReasoning.trim()))

const analysisStateLabel = computed(() => {
  if (props.aiFiltering)
    return '分析中'
  if (hasReasoning.value)
    return '分析完成'
  return '等待分析'
})

const configSummary = computed(() => {
  const chunks: string[] = []
  if (props.major.trim())
    chunks.push(`专业：${props.major.trim()}`)
  if (props.discipline.trim())
    chunks.push(`方向：${props.discipline.trim()}`)
  if (props.level.trim())
    chunks.push(`级别：${levelLabels[props.level] || props.level}`)
  if (props.trackType.trim())
    chunks.push(`赛道：${props.trackType.trim()}`)
  chunks.push(`返回：${props.topK}`)
  return chunks.join(' · ')
})

const compactHint = computed(() => {
  if (props.aiFiltering)
    return '正在执行筛选，请稍候。'

  const status = props.statusLine.trim()
  if (status.includes('失败') || status.includes('不可用'))
    return status

  if (hasReasoning.value)
    return '点击“展开原因”查看本次筛选依据。'

  return '点击“AI筛选竞赛”后可查看分析结果。'
})

watch(() => props.aiFiltering, (next) => {
  if (!next)
    return
  showReason.value = false
  showAdminDetails.value = false
})

watch(hasReasoning, (next) => {
  if (next)
    return
  showReason.value = false
})
</script>

<template>
  <div class="workspace-left-panel__feature">
    <div class="workspace-left-panel__body no-scrollbar">
      <section class="workspace-card">
        <h3>AI 竞赛分析</h3>
        <textarea
          :value="props.naturalQuery"
          class="workspace-textarea"
          placeholder="例：计算机专业，偏 AI + 工程落地，优先国赛。"
          @input="emit('updateNaturalQuery', ($event.target as HTMLTextAreaElement).value)"
        />

        <div class="workspace-config-summary">
          {{ configSummary }}
        </div>

        <div class="workspace-action-row">
          <button
            class="workspace-btn workspace-btn--ghost"
            :disabled="props.listLoading"
            @click="emit('loadContests')"
          >
            {{ props.listLoading ? '加载中...' : '结构化筛选' }}
          </button>

          <button
            class="workspace-btn workspace-btn--primary"
            :disabled="props.aiFiltering"
            @click="emit('runAiFilter')"
          >
            {{ props.aiFiltering ? 'AI处理中...' : 'AI筛选竞赛' }}
          </button>
        </div>

        <div class="workspace-analysis-status">
          <div class="workspace-analysis-status__head">
            <span>分析状态</span>
            <span class="workspace-pill" :class="{ 'workspace-pill--done': hasReasoning && !props.aiFiltering }">
              {{ analysisStateLabel }}
            </span>
          </div>
          <p>{{ compactHint }}</p>

          <button
            v-if="hasReasoning"
            class="workspace-inline-action"
            type="button"
            @click="showReason = !showReason"
          >
            {{ showReason ? '收起原因' : '展开原因' }}
          </button>

          <pre v-if="showReason" class="workspace-log-text">{{ props.aiReasoning }}</pre>

          <template v-if="props.isAdminView">
            <button
              class="workspace-inline-action workspace-inline-action--dark"
              type="button"
              @click="showAdminDetails = !showAdminDetails"
            >
              {{ showAdminDetails ? '收起详情' : '查看详情' }}
            </button>

            <div v-if="showAdminDetails" class="workspace-admin-detail">
              <div>
                <div class="workspace-admin-detail__label">
                  运行状态
                </div>
                <div>{{ props.statusLine || '-' }}</div>
              </div>
              <div>
                <div class="workspace-admin-detail__label">
                  标准化筛选参数
                </div>
                <pre>{{ props.normalizedInfo || '{ }' }}</pre>
              </div>
            </div>
          </template>
        </div>
      </section>

      <section class="workspace-card">
        <h3>竞赛清单（{{ props.contests.length }}）</h3>
        <div class="workspace-contest-list no-scrollbar">
          <button
            v-for="contest in props.contests"
            :key="contest.id"
            class="workspace-contest-item"
            :class="{ 'workspace-contest-item--active': contest.id === props.selectedContestId }"
            type="button"
            @click="emit('updateSelectedContestId', contest.id)"
          >
            <div class="workspace-contest-item__name">
              {{ contest.name }}
            </div>
            <div class="workspace-contest-item__meta">
              {{ levelLabels[contest.level] || contest.level }} · {{ contest.registrationWindow }}
            </div>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

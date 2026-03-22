<script setup lang="ts">
import type { Contest, WorkspaceWithQuota } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  naturalQuery: string
  major: string
  discipline: string
  level: string
  trackType: string
  topK: number
  selectedContestId: string
  contests: Contest[]
  activeWorkspaceId: string
  workspaceOptions?: WorkspaceWithQuota[]
  username?: string
  aiReasoning: string
  normalizedInfo?: string
  statusLine: string
  listLoading: boolean
  aiFiltering: boolean
  isAdminView?: boolean
}>(), {
  workspaceOptions: () => [],
  username: '',
  normalizedInfo: '',
  isAdminView: false,
})

const emit = defineEmits<{
  'update:naturalQuery': [value: string]
  'update:major': [value: string]
  'update:discipline': [value: string]
  'update:level': [value: string]
  'update:trackType': [value: string]
  'update:topK': [value: number]
  'update:selectedContestId': [value: string]
  'update:activeWorkspaceId': [value: string]
  'loadContests': []
  'runAiFilter': []
}>()

const levelLabels: Record<string, string> = {
  national: '国赛',
  provincial: '省赛',
  school: '校赛',
  industry: '行业赛',
}

function onTopKInput(event: Event) {
  const target = event.target as HTMLInputElement
  const value = Number(target.value)
  emit('update:topK', Number.isNaN(value) ? 1 : value)
}

const showReason = ref(false)
const showAdminDetails = ref(false)

const hasReasoning = computed(() => Boolean(props.aiReasoning?.trim()))

const analysisStateLabel = computed(() => {
  if (props.aiFiltering)
    return '分析中'
  if (hasReasoning.value)
    return '分析完成'
  return '等待分析'
})

const analysisStateClass = computed(() => {
  if (props.aiFiltering)
    return 'bg-blue-100 text-blue-700'
  if (hasReasoning.value)
    return 'bg-emerald-100 text-emerald-700'
  return 'bg-slate-100 text-slate-600'
})

const compactHint = computed(() => {
  if (props.aiFiltering)
    return '正在执行筛选，请稍候。'

  const status = props.statusLine?.trim() || ''
  if (status.includes('失败') || status.includes('不可用'))
    return status

  if (hasReasoning.value)
    return '点击“展开原因”查看本次筛选依据。'

  return '点击“AI筛选竞赛”后可查看分析结果。'
})

watch(() => props.aiFiltering, (next) => {
  if (next) {
    showReason.value = false
    showAdminDetails.value = false
  }
})

watch(hasReasoning, (next) => {
  if (!next)
    showReason.value = false
})
</script>

<template>
  <aside class="border-r border-slate-200 bg-slate-50 flex shrink-0 flex-col w-full xl:w-68">
    <div class="px-4 py-3 border-b border-slate-200 bg-white/70 flex items-center justify-between">
      <span class="text-[10px] text-slate-500 tracking-widest font-bold uppercase">项目资源管理器</span>
      <span class="material-symbols-outlined text-sm text-slate-400">unfold_less</span>
    </div>
    <div class="no-scrollbar px-3 py-3 flex-1 overflow-y-auto space-y-3">
      <div class="space-y-1">
        <div class="text-blue-600 px-2 py-1.5 rounded bg-blue-50 flex gap-2 items-center">
          <span class="material-symbols-outlined text-lg">account_tree</span>
          <span class="text-xs font-semibold">分析大纲</span>
        </div>
        <div class="text-slate-600 px-2 py-1.5 rounded flex gap-2 items-center hover:bg-slate-200/60">
          <span class="material-symbols-outlined text-lg">description</span>
          <span class="text-xs">规则库</span>
        </div>
        <div class="text-slate-600 px-2 py-1.5 rounded flex gap-2 items-center hover:bg-slate-200/60">
          <span class="material-symbols-outlined text-lg">history_edu</span>
          <span class="text-xs">历史案例</span>
        </div>
      </div>

      <div class="p-3 border border-slate-200 rounded-lg bg-white space-y-2">
        <div class="text-[11px] text-slate-700 font-semibold">
          AI 结构化筛选
        </div>
        <textarea
          :value="naturalQuery"
          class="text-xs p-2 outline-none border border-slate-200 rounded bg-slate-50 min-h-20 w-full focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          placeholder="例：计算机专业，偏 AI + 工程落地，优先国赛。"
          @input="emit('update:naturalQuery', ($event.target as HTMLTextAreaElement).value)"
        />
        <div class="gap-2 grid grid-cols-2">
          <input
            :value="major"
            class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 focus:border-blue-500"
            placeholder="专业"
            @input="emit('update:major', ($event.target as HTMLInputElement).value)"
          >
          <input
            :value="discipline"
            class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 focus:border-blue-500"
            placeholder="学科/方向"
            @input="emit('update:discipline', ($event.target as HTMLInputElement).value)"
          >
          <select
            :value="level"
            class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 focus:border-blue-500"
            @change="emit('update:level', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">
              级别（全部）
            </option>
            <option value="national">
              national
            </option>
            <option value="provincial">
              provincial
            </option>
            <option value="school">
              school
            </option>
            <option value="industry">
              industry
            </option>
          </select>
          <input
            :value="trackType"
            class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 focus:border-blue-500"
            placeholder="赛道偏好"
            @input="emit('update:trackType', ($event.target as HTMLInputElement).value)"
          >
        </div>
        <div class="flex gap-2 items-center">
          <label class="text-[11px] text-slate-500">返回条数</label>
          <input
            :value="topK"
            class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-20 focus:border-blue-500"
            max="20"
            min="1"
            type="number"
            @input="onTopKInput"
          >
        </div>
        <div class="gap-2 grid grid-cols-2">
          <button
            class="text-xs font-semibold border border-slate-300 rounded h-8 hover:bg-slate-100 disabled:opacity-60"
            :disabled="listLoading"
            @click="emit('loadContests')"
          >
            <span v-if="listLoading" class="mx-auto align-middle rounded bg-slate-300 h-3 w-14 inline-block animate-pulse" />
            <span v-else>结构化筛选</span>
          </button>
          <button
            class="text-xs text-white font-semibold rounded bg-blue-600 h-8 hover:bg-blue-500 disabled:opacity-60"
            :disabled="aiFiltering"
            @click="emit('runAiFilter')"
          >
            {{ aiFiltering ? 'AI处理中...' : 'AI筛选竞赛' }}
          </button>
        </div>
        <div class="p-2 border border-slate-200 rounded bg-slate-50 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-[11px] text-slate-600">分析状态</span>
            <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" :class="analysisStateClass">
              {{ analysisStateLabel }}
            </span>
          </div>

          <p class="text-[11px] text-slate-500 m-0 min-h-4">
            {{ compactHint }}
          </p>

          <button
            v-if="hasReasoning"
            class="text-[11px] text-blue-700 font-semibold hover:text-blue-600"
            @click="showReason = !showReason"
          >
            {{ showReason ? '收起原因' : '展开原因' }}
          </button>

          <div
            v-if="showReason"
            class="text-[11px] text-slate-700 p-2 border border-slate-200 rounded bg-white whitespace-pre-wrap"
          >
            {{ aiReasoning }}
          </div>

          <template v-if="isAdminView">
            <button
              class="text-[11px] text-slate-700 font-semibold hover:text-slate-900"
              @click="showAdminDetails = !showAdminDetails"
            >
              {{ showAdminDetails ? '收起详情' : '点击详情' }}
            </button>
            <div
              v-if="showAdminDetails"
              class="text-[11px] text-slate-700 p-2 border border-slate-200 rounded bg-white space-y-2"
            >
              <div>
                <div class="text-[10px] text-slate-500 mb-1">
                  运行状态
                </div>
                <div class="whitespace-pre-wrap">
                  {{ statusLine || '-' }}
                </div>
              </div>
              <div>
                <div class="text-[10px] text-slate-500 mb-1">
                  标准化筛选参数
                </div>
                <pre class="text-[10px] text-slate-600 m-0 whitespace-pre-wrap">{{ normalizedInfo || '{ }' }}</pre>
              </div>
            </div>
          </template>
        </div>
      </div>

      <div class="space-y-1">
        <div class="text-[10px] text-slate-400 tracking-wider font-bold px-1 uppercase">
          竞赛清单（{{ contests.length }}）
        </div>
        <button
          v-for="contest in contests"
          :key="contest.id"
          class="px-2.5 py-2 text-left border rounded w-full transition-colors"
          :class="contest.id === selectedContestId ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'"
          @click="emit('update:selectedContestId', contest.id)"
        >
          <div class="text-xs text-slate-800 leading-tight font-semibold">
            {{ contest.name }}
          </div>
          <div class="text-[10px] text-slate-500 mt-1 flex flex-wrap gap-1">
            <span class="px-1.5 py-0.5 rounded-full bg-slate-100">{{ levelLabels[contest.level] || contest.level }}</span>
            <span class="px-1.5 py-0.5 rounded-full bg-slate-100">{{ contest.registrationWindow }}</span>
            <span class="px-1.5 py-0.5 rounded-full bg-slate-100">{{ contest.tracks.length }} 个赛道</span>
          </div>
        </button>
      </div>
    </div>
    <div class="p-3 border-t border-slate-200 bg-white/70 space-y-3">
      <div class="space-y-1">
        <div class="text-[10px] text-slate-500 font-semibold">
          账号
        </div>
        <div class="text-xs text-slate-700 truncate">
          {{ username || '-' }}
        </div>
      </div>

      <WorkspaceSwitchEntry
        mode="select"
        label="工作区"
        :model-value="activeWorkspaceId"
        :workspace-options="workspaceOptions"
        :show-quota="true"
        @update:model-value="emit('update:activeWorkspaceId', $event)"
      />
    </div>
  </aside>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>

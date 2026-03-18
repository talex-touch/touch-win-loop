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
  statusLine: string
  listLoading: boolean
  aiFiltering: boolean
  tokenBalance?: number
}>(), {
  workspaceOptions: () => [],
  username: '',
  tokenBalance: 14204,
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

const currentWorkspace = computed(() => {
  return props.workspaceOptions.find(item => item.workspace.id === props.activeWorkspaceId) || null
})
</script>

<template>
  <aside class="w-full xl:w-68 border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
    <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white/70">
      <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">项目资源管理器</span>
      <span class="material-symbols-outlined text-sm text-slate-400">unfold_less</span>
    </div>
    <div class="flex-1 overflow-y-auto no-scrollbar px-3 py-3 space-y-3">
      <div class="space-y-1">
        <div class="flex items-center gap-2 px-2 py-1.5 text-blue-600 bg-blue-50 rounded">
          <span class="material-symbols-outlined text-lg">account_tree</span>
          <span class="text-xs font-semibold">分析大纲</span>
        </div>
        <div class="flex items-center gap-2 px-2 py-1.5 text-slate-600 hover:bg-slate-200/60 rounded">
          <span class="material-symbols-outlined text-lg">description</span>
          <span class="text-xs">规则库</span>
        </div>
        <div class="flex items-center gap-2 px-2 py-1.5 text-slate-600 hover:bg-slate-200/60 rounded">
          <span class="material-symbols-outlined text-lg">history_edu</span>
          <span class="text-xs">历史案例</span>
        </div>
      </div>

      <div class="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
        <div class="text-[11px] font-semibold text-slate-700">
          AI 结构化筛选
        </div>
        <textarea
          :value="naturalQuery"
          class="w-full rounded border border-slate-200 bg-slate-50 p-2 text-xs outline-none min-h-20 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          placeholder="例：计算机专业，偏 AI + 工程落地，优先国赛。"
          @input="emit('update:naturalQuery', ($event.target as HTMLTextAreaElement).value)"
        />
        <div class="grid grid-cols-2 gap-2">
          <input
            :value="major"
            class="h-8 rounded border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-500"
            placeholder="专业"
            @input="emit('update:major', ($event.target as HTMLInputElement).value)"
          >
          <input
            :value="discipline"
            class="h-8 rounded border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-500"
            placeholder="学科/方向"
            @input="emit('update:discipline', ($event.target as HTMLInputElement).value)"
          >
          <select
            :value="level"
            class="h-8 rounded border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-500"
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
            class="h-8 rounded border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-500"
            placeholder="赛道偏好"
            @input="emit('update:trackType', ($event.target as HTMLInputElement).value)"
          >
        </div>
        <div class="flex items-center gap-2">
          <label class="text-[11px] text-slate-500">返回条数</label>
          <input
            :value="topK"
            class="h-8 w-20 rounded border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-500"
            max="20"
            min="1"
            type="number"
            @input="onTopKInput"
          >
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button
            class="h-8 rounded border border-slate-300 text-xs font-semibold hover:bg-slate-100 disabled:opacity-60"
            :disabled="listLoading"
            @click="emit('loadContests')"
          >
            {{ listLoading ? '加载中...' : '结构化筛选' }}
          </button>
          <button
            class="h-8 rounded bg-blue-600 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
            :disabled="aiFiltering"
            @click="emit('runAiFilter')"
          >
            {{ aiFiltering ? 'AI处理中...' : 'AI筛选竞赛' }}
          </button>
        </div>
        <div class="text-[11px] text-slate-500 min-h-4">
          {{ statusLine || '等待筛选指令...' }}
        </div>
        <div class="rounded border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600 whitespace-pre-wrap min-h-16">
          {{ aiReasoning || '等待 AI 返回筛选解释...' }}
        </div>
      </div>

      <div class="space-y-1">
        <div class="px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          竞赛清单（{{ contests.length }}）
        </div>
        <button
          v-for="contest in contests"
          :key="contest.id"
          class="w-full rounded border px-2.5 py-2 text-left transition-colors"
          :class="contest.id === selectedContestId ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'"
          @click="emit('update:selectedContestId', contest.id)"
        >
          <div class="text-xs font-semibold text-slate-800 leading-tight">
            {{ contest.name }}
          </div>
          <div class="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-500">
            <span class="rounded-full bg-slate-100 px-1.5 py-0.5">{{ levelLabels[contest.level] || contest.level }}</span>
            <span class="rounded-full bg-slate-100 px-1.5 py-0.5">{{ contest.registrationWindow }}</span>
            <span class="rounded-full bg-slate-100 px-1.5 py-0.5">{{ contest.tracks.length }} 个赛道</span>
          </div>
        </button>
      </div>
    </div>
    <div class="p-3 border-t border-slate-200 bg-white/70 space-y-3">
      <div class="space-y-1">
        <div class="text-[10px] font-semibold text-slate-500">
          账号
        </div>
        <div class="text-xs text-slate-700 truncate">
          {{ username || '-' }}
        </div>
      </div>

      <div class="space-y-1">
        <div class="text-[10px] font-semibold text-slate-500">
          工作区
        </div>
        <select
          :value="activeWorkspaceId"
          class="w-full h-8 rounded border border-slate-300 bg-white px-2 text-xs outline-none focus:border-blue-500"
          @change="emit('update:activeWorkspaceId', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="item in workspaceOptions" :key="item.workspace.id" :value="item.workspace.id">
            {{ item.workspace.name }}（{{ item.workspace.type }}）
          </option>
        </select>
        <div v-if="currentWorkspace?.quota" class="text-[10px] text-slate-400 leading-relaxed">
          席位 {{ currentWorkspace.quota.seatUsed }}/{{ currentWorkspace.quota.seatLimit }}，
          AI {{ currentWorkspace.quota.aiQuotaUsed }}/{{ currentWorkspace.quota.aiQuotaTotal }}
        </div>
      </div>

      <div class="pt-2 border-t border-slate-200">
        <div class="flex items-center justify-between text-[10px] text-slate-500 mb-2">
          <span>AI 运行状态</span>
          <span class="w-1.5 h-1.5 bg-green-500 rounded-full" />
        </div>
        <div class="text-[10px] text-slate-400 leading-relaxed">
          模型: Analysis-V4-Pro<br>
          Token 余额: {{ tokenBalance.toLocaleString('zh-CN') }}
        </div>
      </div>
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

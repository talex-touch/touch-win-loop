<script setup lang="ts">
import type { Contest, Resource, Track } from '~~/shared/types/domain'
import type {
  MappingTone,
  WorkspaceFormState,
  WorkspaceKeyword,
  WorkspaceMappingRow,
  WorkspaceStatusToneMeta,
} from '~/types/workspace'

interface WorkspaceDashboardContestEntry {
  contest: Contest
  track: Track | null
}

const props = withDefaults(defineProps<{
  selectedContest?: Contest | null
  selectedTrack?: Track | null
  selectedTrackId?: string
  selectedContestId?: string
  mappingRows?: WorkspaceMappingRow[]
  mappingLoading?: boolean
  mappingRefreshing?: boolean
  keywordCloud?: WorkspaceKeyword[]
  trendBars?: number[]
  linkedContestEntries?: WorkspaceDashboardContestEntry[]
  selectedResources?: Resource[]
  materialCoverage?: number
  formState?: WorkspaceFormState
  formSubmitting?: boolean
  workspacePreparing?: boolean
  topicBoardFetching?: boolean
  toneMeta: Record<MappingTone, WorkspaceStatusToneMeta>
}>(), {
  selectedContest: null,
  selectedTrack: null,
  selectedTrackId: '',
  selectedContestId: '',
  mappingRows: () => [],
  mappingLoading: false,
  mappingRefreshing: false,
  keywordCloud: () => [],
  trendBars: () => [],
  linkedContestEntries: () => [],
  selectedResources: () => [],
  materialCoverage: 0,
  formState: () => ({
    source: 'form',
    title: '',
    problemStatement: '',
    innovationPointsText: '',
    techRouteStepsText: '',
    scoringMappingText: '',
    risksText: '',
    deliverablesText: '',
    summary: '',
  }),
  formSubmitting: false,
  workspacePreparing: false,
  topicBoardFetching: false,
})

const emit = defineEmits<{
  updateSelectedTrackId: [value: string]
  useBindingAsCurrentContest: [payload: { contestId: string, trackId: string }]
  updateFormField: [payload: { field: keyof WorkspaceFormState, value: string }]
  submitProjectForContest: [payload: { contestId: string, trackId: string }]
}>()

const dashboardGuide = computed(() => {
  return [
    {
      id: 'contest',
      title: '锁定竞赛与赛道',
      done: Boolean(props.selectedContest && props.selectedTrack),
      doneText: `${props.selectedContest?.name || ''} / ${props.selectedTrack?.name || ''}`,
      todoText: '请先在左侧完成竞赛筛选并选择赛道。',
    },
    {
      id: 'resource',
      title: '补齐申报资料',
      done: props.selectedResources.length > 0,
      doneText: `已归档 ${props.selectedResources.length} 份资料`,
      todoText: '资料池为空，建议先补齐规则文档和样例。',
    },
    {
      id: 'mapping',
      title: '查看核心指标要求',
      done: props.mappingRows.length > 0,
      doneText: `已生成 ${props.mappingRows.length} 条映射指标`,
      todoText: '尚未生成映射指标。',
    },
    {
      id: 'submit',
      title: '按比赛提交草案',
      done: Boolean(props.formState.title.trim()),
      doneText: '草案标题已填写，可进入关联比赛提交。',
      todoText: '请先完善项目草案字段。',
    },
  ]
})

function resolveMappingScoreBarClass(score: number): string {
  if (score >= 80)
    return 'bg-emerald-500'
  if (score >= 60)
    return 'bg-blue-500'
  if (score >= 40)
    return 'bg-amber-400'
  return 'bg-rose-400'
}

function resolveMappingScoreTextClass(score: number): string {
  if (score >= 80)
    return 'text-emerald-700 bg-emerald-50'
  if (score >= 60)
    return 'text-blue-700 bg-blue-50'
  if (score >= 40)
    return 'text-amber-700 bg-amber-50'
  return 'text-rose-700 bg-rose-50'
}
</script>

<template>
  <div class="w-full space-y-4">
    <div class="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex gap-3 items-center">
        <span class="material-symbols-outlined text-xl text-blue-600">space_dashboard</span>
        <div>
          <h2 class="text-sm font-bold">
            WinLoop 仪表盘
          </h2>
          <div class="text-[11px] text-slate-500 mt-0.5">
            以“竞赛锁定 → 指标对标 → 关联比赛提交 → 终审”为主线推进项目落地。
          </div>
        </div>
      </div>

      <ol class="divide-slate-200 divide-y">
        <li
          v-for="(step, index) in dashboardGuide"
          :key="step.id"
          class="p-4 flex gap-3 items-start"
        >
          <span
            class="text-[11px] font-bold rounded-full flex h-5 w-5 items-center justify-center"
            :class="step.done ? 'text-emerald-700 bg-emerald-50' : 'text-blue-600 bg-blue-50'"
          >
            {{ index + 1 }}
          </span>
          <div>
            <div class="text-xs text-slate-800 font-semibold">
              {{ step.title }}
            </div>
            <p class="text-[11px] mt-1" :class="step.done ? 'text-emerald-600' : 'text-amber-600'">
              {{ step.done ? step.doneText : step.todoText }}
            </p>
          </div>
        </li>
      </ol>
    </div>

    <div class="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div class="flex gap-3 items-center">
          <span class="material-symbols-outlined text-xl text-blue-600">account_tree</span>
          <div>
            <h2 class="text-sm font-bold">
              核心指标对标
            </h2>
            <div class="text-[11px] text-slate-500 mt-0.5">
              {{ props.selectedTrack?.summary || '请选择竞赛与赛道，开始对标分析。' }}
            </div>
          </div>
        </div>
        <div class="flex gap-2 items-center">
          <div v-if="props.mappingRefreshing" class="text-[10px] text-slate-500 font-semibold px-2.5 py-1 border border-slate-200 rounded-full bg-white inline-flex gap-1.5 items-center">
            <span class="inline-block rounded-full bg-blue-500 h-1.5 w-1.5 animate-pulse" />
            <span>刷新中</span>
          </div>
          <select
            class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 min-w-46 focus:border-blue-500"
            :value="props.selectedTrackId"
            @change="emit('updateSelectedTrackId', ($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>
              选择赛道
            </option>
            <option v-for="track in props.selectedContest?.tracks || []" :key="track.id" :value="track.id">
              {{ track.name }}
            </option>
          </select>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="text-xs text-left min-w-180 w-full border-collapse">
          <thead>
            <tr class="text-slate-500 bg-slate-50/60">
              <th class="font-semibold px-4 py-2 border-b border-slate-200">
                要求指标 (竞赛要求)
              </th>
              <th class="font-semibold px-4 py-2 text-center border-b border-slate-200">
                关联度
              </th>
              <th class="font-semibold px-4 py-2 border-b border-slate-200">
                对应项目能力点
              </th>
              <th class="font-semibold px-4 py-2 border-b border-slate-200">
                佐证材料状态
              </th>
            </tr>
          </thead>
          <tbody class="divide-slate-200 divide-y">
            <tr v-if="props.workspacePreparing || props.mappingLoading">
              <td colspan="4" class="text-xs text-slate-500 px-4 py-6">
                等待赛道评分规则返回。
              </td>
            </tr>
            <tr v-else-if="props.mappingRows.length === 0">
              <td colspan="4" class="text-xs text-slate-500 px-4 py-6">
                暂无赛道评分规则，待竞赛详情返回后展示真实指标要求。
              </td>
            </tr>
            <template v-else>
              <tr
                v-for="row in props.mappingRows"
                :key="row.id"
                class="transition-colors hover:bg-blue-50/40"
              >
                <td class="px-4 py-3.5">
                  <div class="text-slate-900 font-medium">
                    {{ row.metric }}
                  </div>
                  <div class="text-[10px] text-slate-400 mt-1">
                    {{ row.hint }}
                  </div>
                </td>
                <td class="px-4 py-3.5 text-center">
                  <div class="flex flex-col gap-1 items-center">
                    <span class="rounded-full bg-slate-100 h-1.5 w-20 inline-block overflow-hidden">
                      <span
                        class="h-full block"
                        :class="resolveMappingScoreBarClass(row.score)"
                        :style="{ width: `${row.score}%` }"
                      />
                    </span>
                    <span class="text-[10px] text-slate-600 font-semibold">
                      {{ row.scoreLabel }}
                    </span>
                  </div>
                </td>
                <td class="px-4 py-3.5">
                  <div class="text-slate-700">
                    {{ row.ability }}
                  </div>
                  <div class="text-[10px] text-blue-600 font-medium mt-1">
                    <span v-for="tag in row.tags" :key="`${row.id}-${tag}`" class="mr-2">{{ tag }}</span>
                  </div>
                </td>
                <td class="px-4 py-3.5">
                  <span
                    class="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    :class="resolveMappingScoreTextClass(row.score)"
                  >
                    {{ row.supportingNote }}
                  </span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <div class="gap-4 grid grid-cols-1 md:grid-cols-2">
      <div class="p-4 border border-slate-200 rounded-lg bg-white shadow-sm">
        <div class="mb-4 flex gap-2 items-center">
          <span class="material-symbols-outlined text-sm text-blue-500">hub</span>
          <span class="text-xs text-slate-500 tracking-wider font-bold uppercase">核心词云图</span>
        </div>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="word in props.keywordCloud"
            :key="word.label"
            class="text-[10px] px-2 py-1 rounded"
            :class="word.active ? 'bg-blue-50 text-blue-600 font-bold' : 'bg-slate-50 text-slate-600'"
          >
            {{ word.label }}
          </span>
        </div>
      </div>

      <div class="p-4 border border-slate-200 rounded-lg bg-white shadow-sm">
        <div class="mb-4 flex gap-2 items-center">
          <span class="material-symbols-outlined text-sm text-green-500">show_chart</span>
          <span class="text-xs text-slate-500 tracking-wider font-bold uppercase">竞争力评估趋势</span>
        </div>
        <div class="flex gap-1.5 h-16 items-end">
          <div
            v-for="(height, index) in props.trendBars"
            :key="`trend-${index}`"
            class="rounded-t flex-1 transition-all"
            :class="index === props.trendBars.length - 1 ? 'bg-blue-500 animate-pulse' : 'bg-blue-200'"
            :style="{ height: `${height}%` }"
          />
        </div>
      </div>
    </div>

    <div class="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex gap-3 items-center">
        <span class="material-symbols-outlined text-xl text-indigo-600">checklist</span>
        <div>
          <h2 class="text-sm font-bold">
            关联比赛提交区
          </h2>
          <div class="text-[11px] text-slate-500 mt-0.5">
            规则详情与提交表单按比赛内聚，右侧只保留智能辅助。
          </div>
        </div>
      </div>

      <div class="p-4 space-y-4">
        <article
          v-for="entry in props.linkedContestEntries"
          :key="entry.contest.id"
          class="border border-slate-200 rounded-lg bg-white"
        >
          <div class="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div class="text-xs text-slate-800 font-semibold">
                {{ entry.contest.name }}
              </div>
              <div class="text-[11px] text-slate-500 mt-0.5">
                {{ entry.track?.name || '未匹配赛道' }} · {{ entry.contest.registrationWindow || '报名窗口待补充' }}
              </div>
            </div>
            <button
              class="text-[11px] font-semibold px-2.5 py-1 border rounded transition-colors"
              :class="entry.contest.id === props.selectedContestId ? 'text-blue-700 border-blue-200 bg-blue-50' : 'text-slate-600 border-slate-200 bg-white hover:bg-slate-50'"
              type="button"
              @click="emit('useBindingAsCurrentContest', { contestId: entry.contest.id, trackId: entry.track?.id || '' })"
            >
              {{ entry.contest.id === props.selectedContestId ? '当前比赛' : '设为当前比赛' }}
            </button>
          </div>

          <div class="p-4 space-y-3">
            <div class="gap-3 grid grid-cols-1 md:grid-cols-2">
              <div class="p-3 border border-slate-200 rounded bg-slate-50">
                <div class="text-[11px] text-slate-700 font-semibold">
                  规则详情
                </div>
                <p class="text-[11px] text-slate-600 mt-1">
                  参赛要求：{{ entry.contest.participantRequirements || '暂无明确描述' }}
                </p>
                <p class="text-[11px] text-slate-600 mt-1">
                  组队规则：{{ entry.contest.teamRule || '暂无明确描述' }}
                </p>
                <p class="text-[11px] text-slate-500 mt-1">
                  报名窗口：{{ entry.contest.registrationWindow || '—' }}
                </p>
                <p class="text-[11px] text-slate-500 mt-1">
                  提交截止：{{ entry.contest.submissionDeadline || '—' }}
                </p>
              </div>
              <div class="p-3 border border-slate-200 rounded bg-slate-50">
                <div class="text-[11px] text-slate-700 font-semibold">
                  资料齐备度
                </div>
                <div class="mt-2 rounded-full bg-slate-100 h-2 overflow-hidden">
                  <span
                    class="bg-blue-500 h-full block"
                    :style="{ width: `${props.materialCoverage}%` }"
                  />
                </div>
                <p class="text-[11px] text-slate-500 mt-2">
                  当前进度：{{ props.materialCoverage }}%
                </p>
                <p class="text-[11px] text-slate-500 mt-1">
                  已关联资料：{{ props.selectedResources.length }} 份
                </p>
              </div>
            </div>

            <div class="gap-3 grid grid-cols-1 md:grid-cols-2">
              <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
                <span class="block">项目标题</span>
                <input
                  :value="props.formState.title"
                  class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
                  placeholder="输入项目标题"
                  @input="emit('updateFormField', { field: 'title', value: ($event.target as HTMLInputElement).value })"
                >
              </label>

              <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
                <span class="block">问题陈述</span>
                <textarea
                  :value="props.formState.problemStatement"
                  class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[70px] w-full focus:border-blue-500"
                  @input="emit('updateFormField', { field: 'problemStatement', value: ($event.target as HTMLTextAreaElement).value })"
                />
              </label>

              <label class="text-xs text-slate-600 block space-y-1">
                <span class="block">创新点（每行一条）</span>
                <textarea
                  :value="props.formState.innovationPointsText"
                  class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[90px] w-full focus:border-blue-500"
                  @input="emit('updateFormField', { field: 'innovationPointsText', value: ($event.target as HTMLTextAreaElement).value })"
                />
              </label>

              <label class="text-xs text-slate-600 block space-y-1">
                <span class="block">技术路线（每行一条）</span>
                <textarea
                  :value="props.formState.techRouteStepsText"
                  class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[90px] w-full focus:border-blue-500"
                  @input="emit('updateFormField', { field: 'techRouteStepsText', value: ($event.target as HTMLTextAreaElement).value })"
                />
              </label>

              <label class="text-xs text-slate-600 block space-y-1">
                <span class="block">评分映射（每行一条）</span>
                <textarea
                  :value="props.formState.scoringMappingText"
                  class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[90px] w-full focus:border-blue-500"
                  @input="emit('updateFormField', { field: 'scoringMappingText', value: ($event.target as HTMLTextAreaElement).value })"
                />
              </label>

              <label class="text-xs text-slate-600 block space-y-1">
                <span class="block">风险项（每行一条）</span>
                <textarea
                  :value="props.formState.risksText"
                  class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[90px] w-full focus:border-blue-500"
                  @input="emit('updateFormField', { field: 'risksText', value: ($event.target as HTMLTextAreaElement).value })"
                />
              </label>

              <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
                <span class="block">交付物（每行一条）</span>
                <textarea
                  :value="props.formState.deliverablesText"
                  class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[90px] w-full focus:border-blue-500"
                  @input="emit('updateFormField', { field: 'deliverablesText', value: ($event.target as HTMLTextAreaElement).value })"
                />
              </label>

              <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
                <span class="block">摘要</span>
                <textarea
                  :value="props.formState.summary"
                  class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[70px] w-full focus:border-blue-500"
                  @input="emit('updateFormField', { field: 'summary', value: ($event.target as HTMLTextAreaElement).value })"
                />
              </label>
            </div>

            <button
              class="text-xs text-white font-semibold rounded bg-blue-600 h-9 w-full hover:bg-blue-500 disabled:opacity-60"
              :disabled="!entry.track?.id || props.formSubmitting"
              @click="emit('submitProjectForContest', { contestId: entry.contest.id, trackId: entry.track?.id || '' })"
            >
              {{ props.formSubmitting ? '提交中...' : `提交到 ${entry.contest.name}` }}
            </button>
          </div>
        </article>

        <div v-if="props.linkedContestEntries.length === 0" class="text-[11px] text-slate-500 p-3 border border-slate-200 rounded border-dashed">
          暂无关联比赛，请先在左侧选择比赛，或在“项目设置”中添加竞赛绑定。
        </div>
      </div>
    </div>
  </div>
</template>

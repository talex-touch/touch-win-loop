<script setup lang="ts">
import type { Contest, Project, ProjectResourceShare, Track } from '~~/shared/types/domain'
import type {
  WorkspaceProjectAdaptationForm,
  WorkspaceProjectCommonForm,
  WorkspaceProjectContestBindingForm,
  WorkspaceProjectSaveState,
} from '~/types/workspace'

const props = withDefaults(defineProps<{
  activeProject?: Project | null
  contests?: Contest[]
  projectSettingsLoading?: boolean
  projectSettingsSaveState?: WorkspaceProjectSaveState
  projectSettingsCommon?: WorkspaceProjectCommonForm
  projectSettingsBindings?: WorkspaceProjectContestBindingForm[]
  projectSettingsCurrentContestId?: string
  projectSettingsAdaptation?: WorkspaceProjectAdaptationForm
  projectSettingsHasCurrentContest?: boolean
  projectResourceShares?: ProjectResourceShare[]
  projectResourceSharesLoading?: boolean
  projectSettingsSaveLabel?: string
  projectSettingsSaveBadgeClass?: string
  projectSettingsContestName?: string
  contestTracksByContestId: (contestId: string) => Track[]
  shareVisibilityLabel: (value: string) => string
  shareStatusLabel: (share: ProjectResourceShare) => string
  shareStatusBadgeClass: (share: ProjectResourceShare) => string
  getShareStatus: (share: ProjectResourceShare) => 'active' | 'expired' | 'revoked'
  formatDateTime: (value: string) => string
}>(), {
  activeProject: null,
  contests: () => [],
  projectSettingsLoading: false,
  projectSettingsSaveState: 'idle',
  projectSettingsCommon: () => ({
    title: '',
    summary: '',
    icon: '',
    accentColor: '',
    problemStatement: '',
    innovationPointsText: '',
    techRouteStepsText: '',
    scoringMappingText: '',
    risksText: '',
    deliverablesText: '',
  }),
  projectSettingsBindings: () => [],
  projectSettingsCurrentContestId: '',
  projectSettingsAdaptation: () => ({
    contestId: '',
    trackId: '',
    problemStatement: '',
    innovationPointsText: '',
    techRouteStepsText: '',
    scoringMappingText: '',
    risksText: '',
    deliverablesText: '',
    summary: '',
  }),
  projectSettingsHasCurrentContest: false,
  projectResourceShares: () => [],
  projectResourceSharesLoading: false,
  projectSettingsSaveLabel: '尚未保存',
  projectSettingsSaveBadgeClass: 'text-slate-600 border-slate-200 bg-white',
  projectSettingsContestName: '',
})

const emit = defineEmits<{
  emitProjectSettingsCommon: [value: WorkspaceProjectCommonForm]
  updateProjectSettingsCommonField: [payload: { field: keyof WorkspaceProjectCommonForm, value: string }]
  saveProjectSettings: []
  addProjectSettingsBinding: []
  updateProjectSettingsBindingContest: [payload: { index: number, contestId: string }]
  updateProjectSettingsBindingTrack: [payload: { index: number, trackId: string }]
  useBindingAsCurrentContest: [payload: { contestId: string, trackId: string }]
  removeProjectSettingsBinding: [index: number]
  updateProjectSettingsAdaptationField: [payload: { field: keyof WorkspaceProjectAdaptationForm, value: string }]
  copyProjectResourceShare: [shareId: string]
  revokeProjectResourceShare: [shareId: string]
}>()

const hasActiveProject = computed(() => Boolean(props.activeProject?.id))
</script>

<template>
  <div class="w-full space-y-4">
    <section class="border border-slate-200 rounded-lg bg-white overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div class="flex gap-3 items-center">
          <span class="material-symbols-outlined text-xl text-blue-600">settings</span>
          <div>
            <h2 class="text-sm font-bold">
              项目通用设置
            </h2>
            <div class="text-xs text-slate-500 mt-0.5">
              项目通用信息
            </div>
          </div>
        </div>

        <div class="flex gap-2 items-center">
          <span
            class="text-xs font-medium px-2 py-1 border rounded"
            :class="props.projectSettingsSaveBadgeClass"
          >
            {{ props.projectSettingsSaveLabel }}
          </span>
          <button
            class="text-xs text-white font-semibold px-3 py-1.5 rounded bg-slate-900 transition-colors hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            type="button"
            :disabled="!hasActiveProject || props.projectSettingsLoading"
            @click="emit('saveProjectSettings')"
          >
            立即保存
          </button>
        </div>
      </div>

      <div class="p-4">
        <div v-if="props.projectSettingsLoading" class="text-xs text-slate-500 p-3 border border-slate-200 rounded bg-slate-50">
          正在加载项目设置...
        </div>

        <div v-else-if="!hasActiveProject" class="text-xs text-slate-500 p-3 border border-slate-200 rounded bg-slate-50">
          当前 Team 暂无可编辑项目，请先创建或切换到目标项目。
        </div>

        <div v-else class="space-y-3">
          <ProjectBasicSettingsEditor
            :model-value="props.projectSettingsCommon"
            :project="props.activeProject"
            :disabled="props.projectSettingsLoading"
            @update:model-value="emit('emitProjectSettingsCommon', $event)"
          />

          <div class="gap-3 grid grid-cols-1 md:grid-cols-2">
            <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
              <span class="block">问题陈述</span>
              <textarea
                :value="props.projectSettingsCommon.problemStatement"
                class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[70px] w-full focus:border-blue-500"
                @input="emit('updateProjectSettingsCommonField', { field: 'problemStatement', value: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>

            <label class="text-xs text-slate-600 block space-y-1">
              <span class="block">创新点（每行一条）</span>
              <textarea
                :value="props.projectSettingsCommon.innovationPointsText"
                class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                @input="emit('updateProjectSettingsCommonField', { field: 'innovationPointsText', value: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>
            <label class="text-xs text-slate-600 block space-y-1">
              <span class="block">技术路线（每行一条）</span>
              <textarea
                :value="props.projectSettingsCommon.techRouteStepsText"
                class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                @input="emit('updateProjectSettingsCommonField', { field: 'techRouteStepsText', value: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>
            <label class="text-xs text-slate-600 block space-y-1">
              <span class="block">评分映射（每行一条）</span>
              <textarea
                :value="props.projectSettingsCommon.scoringMappingText"
                class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                @input="emit('updateProjectSettingsCommonField', { field: 'scoringMappingText', value: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>
            <label class="text-xs text-slate-600 block space-y-1">
              <span class="block">风险项（每行一条）</span>
              <textarea
                :value="props.projectSettingsCommon.risksText"
                class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                @input="emit('updateProjectSettingsCommonField', { field: 'risksText', value: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>
            <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
              <span class="block">交付物（每行一条）</span>
              <textarea
                :value="props.projectSettingsCommon.deliverablesText"
                class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
                @input="emit('updateProjectSettingsCommonField', { field: 'deliverablesText', value: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>
          </div>
        </div>
      </div>
    </section>

    <template v-if="!props.projectSettingsLoading && hasActiveProject">
      <section class="p-4 border border-slate-200 rounded-lg bg-white">
        <div class="mb-3 flex gap-2 items-center justify-between">
          <h3 class="text-xs text-slate-700 font-semibold">
            竞赛与赛道绑定
          </h3>
          <button
            class="text-xs font-semibold px-2.5 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            type="button"
            @click="emit('addProjectSettingsBinding')"
          >
            添加竞赛
          </button>
        </div>

        <div class="space-y-2">
          <div
            v-for="(binding, index) in props.projectSettingsBindings"
            :key="`binding-${binding.contestId}-${index}`"
            class="gap-2 grid grid-cols-1 items-center md:grid-cols-[1fr,1fr,auto,auto]"
          >
            <select
              :value="binding.contestId"
              class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
              @change="emit('updateProjectSettingsBindingContest', { index, contestId: ($event.target as HTMLSelectElement).value })"
            >
              <option value="" disabled>
                选择竞赛
              </option>
              <option v-for="contest in props.contests" :key="contest.id" :value="contest.id">
                {{ contest.name }}
              </option>
            </select>

            <select
              :value="binding.trackId"
              class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
              @change="emit('updateProjectSettingsBindingTrack', { index, trackId: ($event.target as HTMLSelectElement).value })"
            >
              <option value="" disabled>
                选择赛道
              </option>
              <option v-for="track in props.contestTracksByContestId(binding.contestId)" :key="track.id" :value="track.id">
                {{ track.name }}
              </option>
            </select>

            <button
              class="text-xs font-semibold px-2.5 py-1 border rounded transition-colors"
              :class="binding.contestId === props.projectSettingsCurrentContestId ? 'text-blue-700 border-blue-200 bg-blue-50' : 'text-slate-600 border-slate-200 bg-white hover:bg-slate-50'"
              type="button"
              @click="emit('useBindingAsCurrentContest', { contestId: binding.contestId, trackId: binding.trackId })"
            >
              {{ binding.contestId === props.projectSettingsCurrentContestId ? '当前竞赛' : '设为当前' }}
            </button>

            <button
              class="text-xs text-rose-600 font-semibold px-2.5 py-1 border border-rose-200 rounded bg-white transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
              type="button"
              :disabled="props.projectSettingsBindings.length <= 1"
              @click="emit('removeProjectSettingsBinding', index)"
            >
              删除
            </button>
          </div>

          <p v-if="props.projectSettingsBindings.length === 0" class="text-xs text-slate-500">
            {{ props.contests.length > 0 ? '暂无竞赛绑定，请先添加至少一个竞赛并指定赛道。' : '暂无可用竞赛，点击“添加竞赛”可在弹窗中刷新并绑定。' }}
          </p>
        </div>
      </section>

      <section v-if="props.projectSettingsHasCurrentContest" class="p-4 border border-slate-200 rounded-lg bg-white">
        <h3 class="text-xs text-slate-700 font-semibold mb-3">
          当前竞赛适配稿
          <span class="text-slate-400 font-normal ml-1">
            {{ props.projectSettingsContestName || props.projectSettingsCurrentContestId }}
          </span>
        </h3>
        <div class="gap-3 grid grid-cols-1 md:grid-cols-2">
          <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
            <span class="block">问题陈述</span>
            <textarea
              :value="props.projectSettingsAdaptation.problemStatement"
              class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[70px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'problemStatement', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>
          <label class="text-xs text-slate-600 block space-y-1">
            <span class="block">创新点（每行一条）</span>
            <textarea
              :value="props.projectSettingsAdaptation.innovationPointsText"
              class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'innovationPointsText', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>
          <label class="text-xs text-slate-600 block space-y-1">
            <span class="block">技术路线（每行一条）</span>
            <textarea
              :value="props.projectSettingsAdaptation.techRouteStepsText"
              class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'techRouteStepsText', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>
          <label class="text-xs text-slate-600 block space-y-1">
            <span class="block">评分映射（每行一条）</span>
            <textarea
              :value="props.projectSettingsAdaptation.scoringMappingText"
              class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'scoringMappingText', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>
          <label class="text-xs text-slate-600 block space-y-1">
            <span class="block">风险项（每行一条）</span>
            <textarea
              :value="props.projectSettingsAdaptation.risksText"
              class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'risksText', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>
          <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
            <span class="block">交付物（每行一条）</span>
            <textarea
              :value="props.projectSettingsAdaptation.deliverablesText"
              class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[96px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'deliverablesText', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>
          <label class="text-xs text-slate-600 block space-y-1 md:col-span-2">
            <span class="block">摘要</span>
            <textarea
              :value="props.projectSettingsAdaptation.summary"
              class="text-xs px-2 py-2 outline-none border border-slate-200 rounded bg-white min-h-[70px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'summary', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>
        </div>
      </section>

      <section class="p-4 border border-slate-200 rounded-lg bg-white">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-xs text-slate-700 font-semibold">
            分享链接管理
          </h3>
          <span class="text-xs text-slate-500">
            共 {{ props.projectResourceShares.length }} 条
          </span>
        </div>

        <div v-if="props.projectResourceSharesLoading" class="text-xs text-slate-500 px-3 py-2 border border-slate-200 rounded bg-slate-50">
          正在加载分享链接...
        </div>

        <div v-else-if="props.projectResourceShares.length === 0" class="text-xs text-slate-500 px-3 py-2 border border-slate-200 rounded bg-slate-50">
          暂无分享链接，可在左侧文件菜单点击“分享链接”创建。
        </div>

        <div v-else class="space-y-2">
          <article
            v-for="share in props.projectResourceShares"
            :key="share.id"
            class="px-3 py-2 border border-slate-200 rounded"
          >
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div class="min-w-0">
                <p class="text-xs text-slate-700 font-semibold truncate">
                  {{ share.resourceTitle || share.resourceId }}
                </p>
                <p class="text-xs text-slate-500 mt-1 break-all">
                  {{ share.shareUrl }}
                </p>
                <p class="text-xs text-slate-500 mt-1">
                  {{ props.shareVisibilityLabel(share.visibility) }} · {{ share.duration }} · 到期 {{ props.formatDateTime(share.expiresAt) }}
                </p>
              </div>
              <div class="flex gap-2 items-center">
                <span
                  class="text-xs font-semibold px-2 py-0.5 border rounded-full"
                  :class="props.shareStatusBadgeClass(share)"
                >
                  {{ props.shareStatusLabel(share) }}
                </span>
                <button
                  class="text-xs font-semibold px-2.5 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50"
                  type="button"
                  @click="emit('copyProjectResourceShare', share.id)"
                >
                  复制链接
                </button>
                <button
                  class="text-xs text-rose-600 font-semibold px-2.5 py-1 border border-rose-200 rounded bg-white transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  type="button"
                  :disabled="props.getShareStatus(share) === 'revoked'"
                  @click="emit('revokeProjectResourceShare', share.id)"
                >
                  失效
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

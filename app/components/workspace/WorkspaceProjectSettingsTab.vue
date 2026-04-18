<script setup lang="ts">
import type {
  Contest,
  Project,
  ProjectResourceShare,
  Track,
  WorkspaceFontSizePreset,
  WorkspaceTabSpacingPreset,
} from '~~/shared/types/domain'
import type {
  WorkspaceProjectAdaptationForm,
  WorkspaceProjectCommonForm,
  WorkspaceProjectContestBindingForm,
  WorkspaceProjectSaveState,
} from '~/types/workspace'

type WorkspaceProjectSettingsSectionId = 'projectOverview' | 'contestBindings' | 'contestAdaptation' | 'resourceShares'

const props = withDefaults(defineProps<{
  activeProject?: Project | null
  activeProjectId?: string
  activeSettingsSectionId?: WorkspaceProjectSettingsSectionId | ''
  fontSizePreset?: WorkspaceFontSizePreset | ''
  tabSpacingPreset?: WorkspaceTabSpacingPreset | ''
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
  activeProjectId: '',
  activeSettingsSectionId: '',
  fontSizePreset: '',
  tabSpacingPreset: '',
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

function shouldShowSection(sectionId: WorkspaceProjectSettingsSectionId): boolean {
  return !props.activeSettingsSectionId || props.activeSettingsSectionId === sectionId
}
</script>

<template>
  <div class="w-full space-y-6">
    <section
      v-show="shouldShowSection('projectOverview')"
      id="workspace-settings-section-project-overview"
      data-testid="workspace-settings-section-project-overview"
      class="border border-slate-200 rounded-2xl bg-white overflow-hidden"
    >
      <div class="px-5 py-4 border-b border-slate-200 bg-slate-50/80">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div class="flex gap-3">
            <span class="material-symbols-outlined text-xl text-blue-600 mt-0.5">settings</span>
            <div>
              <h2 class="text-sm text-slate-900 font-semibold">
                项目基础信息
              </h2>
              <p class="text-xs text-slate-500 leading-5 mt-1">
                维护项目标题、摘要、标识和项目底座描述，保存状态继续与自动草稿链路保持一致。
              </p>
            </div>
          </div>

          <div class="flex flex-wrap gap-2 items-center">
            <span
              class="text-xs font-medium px-2 py-1 border rounded-full"
              :class="props.projectSettingsSaveBadgeClass"
            >
              {{ props.projectSettingsSaveLabel }}
            </span>
            <button
              class="text-xs text-white font-semibold px-3.5 py-2 rounded-full bg-slate-900 transition-colors hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              type="button"
              :disabled="!hasActiveProject || props.projectSettingsLoading"
              @click="emit('saveProjectSettings')"
            >
              立即保存
            </button>
          </div>
        </div>
      </div>

      <div class="px-5 py-5">
        <div v-if="props.projectSettingsLoading" class="text-xs text-slate-500 px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50">
          正在加载项目设置...
        </div>

        <div v-else-if="!hasActiveProject" class="text-xs text-slate-500 px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50">
          当前 Team 暂无可编辑项目，请先创建或切换到目标项目。
        </div>

        <div v-else class="space-y-5">
          <ProjectBasicSettingsEditor
            :model-value="props.projectSettingsCommon"
            :project="props.activeProject"
            :font-size-preset="props.fontSizePreset"
            :tab-spacing-preset="props.tabSpacingPreset"
            :disabled="props.projectSettingsLoading"
            @update:model-value="emit('emitProjectSettingsCommon', $event)"
          />

          <div class="gap-4 grid grid-cols-1 lg:grid-cols-2">
            <label class="text-xs text-slate-600 block space-y-1.5 lg:col-span-2">
              <span class="text-slate-700 font-medium">问题陈述</span>
              <textarea
                :value="props.projectSettingsCommon.problemStatement"
                class="text-xs px-3 py-2 outline-none border border-slate-200 rounded-xl bg-white min-h-[72px] w-full focus:border-blue-500"
                @input="emit('updateProjectSettingsCommonField', { field: 'problemStatement', value: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>

            <label class="text-xs text-slate-600 block space-y-1.5">
              <span class="text-slate-700 font-medium">创新点（每行一条）</span>
              <textarea
                :value="props.projectSettingsCommon.innovationPointsText"
                class="text-xs px-3 py-2 outline-none border border-slate-200 rounded-xl bg-white min-h-[112px] w-full focus:border-blue-500"
                @input="emit('updateProjectSettingsCommonField', { field: 'innovationPointsText', value: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>

            <label class="text-xs text-slate-600 block space-y-1.5">
              <span class="text-slate-700 font-medium">技术路线（每行一条）</span>
              <textarea
                :value="props.projectSettingsCommon.techRouteStepsText"
                class="text-xs px-3 py-2 outline-none border border-slate-200 rounded-xl bg-white min-h-[112px] w-full focus:border-blue-500"
                @input="emit('updateProjectSettingsCommonField', { field: 'techRouteStepsText', value: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>

            <label class="text-xs text-slate-600 block space-y-1.5">
              <span class="text-slate-700 font-medium">评分映射（每行一条）</span>
              <textarea
                :value="props.projectSettingsCommon.scoringMappingText"
                class="text-xs px-3 py-2 outline-none border border-slate-200 rounded-xl bg-white min-h-[112px] w-full focus:border-blue-500"
                @input="emit('updateProjectSettingsCommonField', { field: 'scoringMappingText', value: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>

            <label class="text-xs text-slate-600 block space-y-1.5">
              <span class="text-slate-700 font-medium">风险项（每行一条）</span>
              <textarea
                :value="props.projectSettingsCommon.risksText"
                class="text-xs px-3 py-2 outline-none border border-slate-200 rounded-xl bg-white min-h-[112px] w-full focus:border-blue-500"
                @input="emit('updateProjectSettingsCommonField', { field: 'risksText', value: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>

            <label class="text-xs text-slate-600 block space-y-1.5 lg:col-span-2">
              <span class="text-slate-700 font-medium">交付物（每行一条）</span>
              <textarea
                :value="props.projectSettingsCommon.deliverablesText"
                class="text-xs px-3 py-2 outline-none border border-slate-200 rounded-xl bg-white min-h-[112px] w-full focus:border-blue-500"
                @input="emit('updateProjectSettingsCommonField', { field: 'deliverablesText', value: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>
          </div>
        </div>
      </div>
    </section>

    <section
      v-show="shouldShowSection('contestBindings')"
      id="workspace-settings-section-contest-bindings"
      data-testid="workspace-settings-section-contest-bindings"
      class="border border-slate-200 rounded-2xl bg-white overflow-hidden"
    >
      <div class="px-5 py-4 border-b border-slate-200 bg-slate-50/80">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div class="flex gap-3">
            <span class="material-symbols-outlined text-xl text-slate-700 mt-0.5">trophy</span>
            <div>
              <h3 class="text-sm text-slate-900 font-semibold">
                竞赛与赛道绑定
              </h3>
              <p class="text-xs text-slate-500 leading-5 mt-1">
                管理项目当前参与的竞赛与赛道，并指定当前用于适配稿的目标竞赛。
              </p>
            </div>
          </div>

          <button
            class="text-xs text-slate-700 font-semibold px-3.5 py-2 border border-slate-200 rounded-full bg-white transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            type="button"
            :disabled="props.projectSettingsLoading || !hasActiveProject"
            @click="emit('addProjectSettingsBinding')"
          >
            添加竞赛
          </button>
        </div>
      </div>

      <div class="px-5 py-5">
        <div v-if="props.projectSettingsLoading" class="text-xs text-slate-500 px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50">
          正在加载竞赛绑定...
        </div>

        <div v-else-if="!hasActiveProject" class="text-xs text-slate-500 px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50">
          当前 Team 暂无可编辑项目，请先创建或切换到目标项目。
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="(binding, index) in props.projectSettingsBindings"
            :key="`binding-${binding.contestId}-${index}`"
            class="p-3 border border-slate-200 rounded-2xl bg-slate-50/70 gap-2 grid grid-cols-1 items-center lg:grid-cols-[minmax(0,1fr),minmax(0,1fr),auto,auto]"
          >
            <select
              :value="binding.contestId"
              class="text-xs px-3 outline-none border border-slate-200 rounded-xl bg-white h-10 w-full focus:border-blue-500"
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
              class="text-xs px-3 outline-none border border-slate-200 rounded-xl bg-white h-10 w-full focus:border-blue-500"
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
              class="text-xs font-semibold px-3.5 py-2 border rounded-full transition-colors"
              :class="binding.contestId === props.projectSettingsCurrentContestId ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'"
              type="button"
              @click="emit('useBindingAsCurrentContest', { contestId: binding.contestId, trackId: binding.trackId })"
            >
              {{ binding.contestId === props.projectSettingsCurrentContestId ? '当前竞赛' : '设为当前' }}
            </button>

            <button
              class="text-xs text-rose-600 font-semibold px-3.5 py-2 border border-rose-200 rounded-full bg-white transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
              type="button"
              :disabled="props.projectSettingsBindings.length <= 1"
              @click="emit('removeProjectSettingsBinding', index)"
            >
              删除
            </button>
          </div>

          <p v-if="props.projectSettingsBindings.length === 0" class="text-xs text-slate-500 leading-5">
            {{ props.contests.length > 0 ? '暂无竞赛绑定，请先添加至少一个竞赛并指定赛道。' : '暂无可用竞赛，点击“添加竞赛”可在弹窗中刷新并绑定。' }}
          </p>
        </div>
      </div>
    </section>

    <section
      v-show="shouldShowSection('contestAdaptation')"
      id="workspace-settings-section-contest-adaptation"
      data-testid="workspace-settings-section-contest-adaptation"
      class="border border-slate-200 rounded-2xl bg-white overflow-hidden"
    >
      <div class="px-5 py-4 border-b border-slate-200 bg-slate-50/80">
        <div class="flex gap-3">
          <span class="material-symbols-outlined text-xl text-slate-700 mt-0.5">task</span>
          <div>
            <h3 class="text-sm text-slate-900 font-semibold">
              当前竞赛适配稿
              <span class="text-slate-400 font-normal ml-1">
                {{ props.projectSettingsContestName || props.projectSettingsCurrentContestId || '未指定当前竞赛' }}
              </span>
            </h3>
            <p class="text-xs text-slate-500 leading-5 mt-1">
              按当前竞赛补齐问题陈述、创新点、技术路线与交付物，用于终审和答辩场景的统一底稿。
            </p>
          </div>
        </div>
      </div>

      <div class="px-5 py-5">
        <div v-if="props.projectSettingsLoading" class="text-xs text-slate-500 px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50">
          正在加载适配稿...
        </div>

        <div v-else-if="!hasActiveProject" class="text-xs text-slate-500 px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50">
          当前 Team 暂无可编辑项目，请先创建或切换到目标项目。
        </div>

        <div v-else-if="!props.projectSettingsHasCurrentContest" class="text-xs text-slate-500 leading-5 px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50">
          请先在“竞赛与赛道绑定”中指定当前竞赛，再补充适配稿内容。
        </div>

        <div v-else class="gap-4 grid grid-cols-1 lg:grid-cols-2">
          <label class="text-xs text-slate-600 block space-y-1.5 lg:col-span-2">
            <span class="text-slate-700 font-medium">问题陈述</span>
            <textarea
              :value="props.projectSettingsAdaptation.problemStatement"
              class="text-xs px-3 py-2 outline-none border border-slate-200 rounded-xl bg-white min-h-[72px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'problemStatement', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>

          <label class="text-xs text-slate-600 block space-y-1.5">
            <span class="text-slate-700 font-medium">创新点（每行一条）</span>
            <textarea
              :value="props.projectSettingsAdaptation.innovationPointsText"
              class="text-xs px-3 py-2 outline-none border border-slate-200 rounded-xl bg-white min-h-[112px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'innovationPointsText', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>

          <label class="text-xs text-slate-600 block space-y-1.5">
            <span class="text-slate-700 font-medium">技术路线（每行一条）</span>
            <textarea
              :value="props.projectSettingsAdaptation.techRouteStepsText"
              class="text-xs px-3 py-2 outline-none border border-slate-200 rounded-xl bg-white min-h-[112px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'techRouteStepsText', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>

          <label class="text-xs text-slate-600 block space-y-1.5">
            <span class="text-slate-700 font-medium">评分映射（每行一条）</span>
            <textarea
              :value="props.projectSettingsAdaptation.scoringMappingText"
              class="text-xs px-3 py-2 outline-none border border-slate-200 rounded-xl bg-white min-h-[112px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'scoringMappingText', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>

          <label class="text-xs text-slate-600 block space-y-1.5">
            <span class="text-slate-700 font-medium">风险项（每行一条）</span>
            <textarea
              :value="props.projectSettingsAdaptation.risksText"
              class="text-xs px-3 py-2 outline-none border border-slate-200 rounded-xl bg-white min-h-[112px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'risksText', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>

          <label class="text-xs text-slate-600 block space-y-1.5 lg:col-span-2">
            <span class="text-slate-700 font-medium">交付物（每行一条）</span>
            <textarea
              :value="props.projectSettingsAdaptation.deliverablesText"
              class="text-xs px-3 py-2 outline-none border border-slate-200 rounded-xl bg-white min-h-[112px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'deliverablesText', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>

          <label class="text-xs text-slate-600 block space-y-1.5 lg:col-span-2">
            <span class="text-slate-700 font-medium">摘要</span>
            <textarea
              :value="props.projectSettingsAdaptation.summary"
              class="text-xs px-3 py-2 outline-none border border-slate-200 rounded-xl bg-white min-h-[72px] w-full focus:border-blue-500"
              @input="emit('updateProjectSettingsAdaptationField', { field: 'summary', value: ($event.target as HTMLTextAreaElement).value })"
            />
          </label>
        </div>
      </div>
    </section>

    <section
      v-show="shouldShowSection('resourceShares')"
      id="workspace-settings-section-resource-shares"
      data-testid="workspace-settings-section-resource-shares"
      class="border border-slate-200 rounded-2xl bg-white overflow-hidden"
    >
      <div class="px-5 py-4 border-b border-slate-200 bg-slate-50/80">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div class="flex gap-3">
            <span class="material-symbols-outlined text-xl text-slate-700 mt-0.5">share</span>
            <div>
              <h3 class="text-sm text-slate-900 font-semibold">
                资源共享
              </h3>
              <p class="text-xs text-slate-500 leading-5 mt-1">
                查看当前项目的分享链接状态，统一处理复制和失效操作。
              </p>
            </div>
          </div>

          <span class="text-xs text-slate-500">
            共 {{ props.projectResourceShares.length }} 条
          </span>
        </div>
      </div>

      <div class="px-5 py-5">
        <div v-if="!hasActiveProject" class="text-xs text-slate-500 px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50">
          当前 Team 暂无可编辑项目，请先创建或切换到目标项目。
        </div>

        <div v-else-if="props.projectResourceSharesLoading" class="text-xs text-slate-500 px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50">
          正在加载分享链接...
        </div>

        <div v-else-if="props.projectResourceShares.length === 0" class="text-xs text-slate-500 px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50">
          暂无分享链接，可在左侧文件菜单点击“分享链接”创建。
        </div>

        <div v-else class="space-y-3">
          <article
            v-for="share in props.projectResourceShares"
            :key="share.id"
            class="px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50/70"
          >
            <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
              <div class="flex flex-wrap gap-2 items-center">
                <span
                  class="text-xs font-semibold px-2 py-0.5 border rounded-full"
                  :class="props.shareStatusBadgeClass(share)"
                >
                  {{ props.shareStatusLabel(share) }}
                </span>
                <button
                  class="text-xs text-slate-700 font-semibold px-3 py-1.5 border border-slate-200 rounded-full bg-white transition-colors hover:bg-slate-50"
                  type="button"
                  @click="emit('copyProjectResourceShare', share.id)"
                >
                  复制链接
                </button>
                <button
                  class="text-xs text-rose-600 font-semibold px-3 py-1.5 border border-rose-200 rounded-full bg-white transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
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
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { Contest, ProjectTopicBoardCreateSeed } from '~~/shared/types/domain'
import type { WorkspaceProjectCommonForm } from '~/types/workspace'

const props = withDefaults(defineProps<{
  visible: boolean
  dialogTitle: string
  helperText?: string
  modelValue: WorkspaceProjectCommonForm
  contestIds: string[]
  topicBoardSeed?: ProjectTopicBoardCreateSeed
  contests?: Contest[]
  errorText?: string
  submitting?: boolean
  submittingMode?: 'stay' | 'enter' | ''
}>(), {
  helperText: '',
  topicBoardSeed: () => ({
    keywords: [],
    teamSkillTags: [],
    candidateCount: 3,
    source: 'project_create',
    autoGenerate: true,
  }),
  contests: () => [],
  errorText: '',
  submitting: false,
  submittingMode: '',
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit', mode: 'stay' | 'enter'): void
  (event: 'update:modelValue', value: WorkspaceProjectCommonForm): void
  (event: 'update:contestIds', value: string[]): void
  (event: 'update:topicBoardSeed', value: ProjectTopicBoardCreateSeed): void
}>()

function emitClose() {
  if (props.submitting)
    return
  emit('close')
}

function toggleContestId(contestId: string) {
  const normalizedContestId = String(contestId || '').trim()
  if (!normalizedContestId)
    return

  const nextContestIds = props.contestIds.includes(normalizedContestId)
    ? props.contestIds.filter(item => item !== normalizedContestId)
    : [...props.contestIds, normalizedContestId]

  emit('update:contestIds', nextContestIds)
}

function updateTopicBoardSeed<K extends keyof ProjectTopicBoardCreateSeed>(field: K, value: ProjectTopicBoardCreateSeed[K]) {
  emit('update:topicBoardSeed', {
    ...props.topicBoardSeed,
    [field]: value,
  })
}

function splitSeedTags(value: string): string[] {
  return String(value || '')
    .split(/[\n,，、]+/)
    .map(item => item.trim())
    .filter(Boolean)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      data-testid="team-create-project-dialog"
      class="p-4 bg-black/30 flex items-center inset-0 justify-center fixed z-50"
      @click.self="emitClose"
    >
      <div class="p-5 border border-slate-200 rounded-2xl bg-white flex flex-col max-h-[90vh] max-w-3xl w-full shadow-xl">
        <div class="flex items-center justify-between">
          <h3 class="text-base text-slate-900 font-semibold">
            {{ dialogTitle }}
          </h3>
          <button
            class="text-slate-500 rounded flex h-7 w-7 items-center justify-center hover:bg-slate-100"
            :disabled="submitting"
            @click="emitClose"
          >
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div class="mt-4 pr-1 min-h-0 overflow-y-auto space-y-4">
          <p v-if="helperText" class="text-xs text-slate-500 leading-5">
            {{ helperText }}
          </p>

          <ProjectBasicSettingsEditor
            :model-value="modelValue"
            :disabled="submitting"
            title-input-test-id="team-create-project-title-input"
            summary-input-test-id="team-create-project-summary-input"
            @update:model-value="emit('update:modelValue', $event)"
          />

          <section class="p-4 border border-slate-200 rounded-xl bg-slate-50/70 space-y-3">
            <div class="flex gap-2 items-center justify-between">
              <div>
                <h4 class="text-sm text-slate-800 font-semibold">
                  关联竞赛
                </h4>
                <p class="text-[11px] text-slate-500 mt-1">
                  可直接勾选多个竞赛，未选择时也允许先创建项目。
                </p>
              </div>
              <span class="text-[11px] text-slate-500 font-medium">
                已选 {{ contestIds.length }} 项
              </span>
            </div>

            <div
              data-testid="team-create-project-contest-select"
              class="border border-slate-200 rounded-xl bg-white overflow-hidden"
            >
              <div v-if="contests.length === 0" class="text-xs text-slate-500 px-4 py-4" data-testid="team-create-project-empty-contests">
                暂无竞赛可选，可稍后在项目设置中补充。
              </div>

              <div v-else class="max-h-56 overflow-y-auto divide-slate-100 divide-y">
                <label
                  v-for="item in contests"
                  :key="item.id"
                  class="px-4 py-3 flex gap-3 cursor-pointer transition-colors items-start hover:bg-slate-50"
                  :data-testid="`team-create-project-contest-option-${item.id}`"
                >
                  <input
                    class="text-blue-600 mt-0.5 border-slate-300 rounded h-4 w-4 focus:ring-blue-500"
                    :checked="contestIds.includes(item.id)"
                    :disabled="submitting"
                    type="checkbox"
                    @change="toggleContestId(item.id)"
                  >
                  <span class="flex-1 min-w-0">
                    <span class="text-sm text-slate-700 font-medium block">{{ item.name }}</span>
                    <span class="text-[11px] text-slate-500 mt-1 block">
                      {{ item.summary || item.organizer || '创建后可在项目设置中继续补充绑定与适配内容。' }}
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </section>

          <section class="p-3 border border-slate-200 rounded-xl bg-slate-50/80 space-y-3">
            <label class="flex gap-3 items-center justify-between">
              <span class="text-xs text-slate-700 font-medium">创建后自动生成 AI 智能选题板</span>
              <input
                :checked="topicBoardSeed.autoGenerate !== false"
                type="checkbox"
                @change="updateTopicBoardSeed('autoGenerate', ($event.target as HTMLInputElement).checked)"
              >
            </label>

            <template v-if="topicBoardSeed.autoGenerate !== false">
              <div class="gap-3 grid grid-cols-1 sm:grid-cols-2">
                <label class="block">
                  <span class="text-xs text-slate-600 font-medium">所属领域</span>
                  <input
                    :value="topicBoardSeed.discipline || ''"
                    class="text-sm mt-1 px-3 border border-slate-300 rounded-lg bg-white h-10 w-full focus:outline-none focus:border-blue-500"
                    placeholder="例如：AI 应用、智慧校园"
                    @input="updateTopicBoardSeed('discipline', String(($event.target as HTMLInputElement).value || ''))"
                  >
                </label>
                <label class="block">
                  <span class="text-xs text-slate-600 font-medium">题目类型</span>
                  <input
                    :value="topicBoardSeed.topicType || ''"
                    class="text-sm mt-1 px-3 border border-slate-300 rounded-lg bg-white h-10 w-full focus:outline-none focus:border-blue-500"
                    placeholder="例如：产品型、研究型、工程型"
                    @input="updateTopicBoardSeed('topicType', String(($event.target as HTMLInputElement).value || ''))"
                  >
                </label>
                <label class="block">
                  <span class="text-xs text-slate-600 font-medium">期望难度</span>
                  <input
                    :value="topicBoardSeed.expectedDifficulty || ''"
                    class="text-sm mt-1 px-3 border border-slate-300 rounded-lg bg-white h-10 w-full focus:outline-none focus:border-blue-500"
                    placeholder="例如：中等偏上"
                    @input="updateTopicBoardSeed('expectedDifficulty', String(($event.target as HTMLInputElement).value || ''))"
                  >
                </label>
                <label class="block">
                  <span class="text-xs text-slate-600 font-medium">候选数（3-5）</span>
                  <input
                    :value="topicBoardSeed.candidateCount || 3"
                    class="text-sm mt-1 px-3 border border-slate-300 rounded-lg bg-white h-10 w-full focus:outline-none focus:border-blue-500"
                    max="5"
                    min="3"
                    type="number"
                    @input="updateTopicBoardSeed('candidateCount', Math.max(3, Math.min(5, Math.round(Number(($event.target as HTMLInputElement).value || 3)))))"
                  >
                </label>
              </div>

              <label class="block">
                <span class="text-xs text-slate-600 font-medium">关键词</span>
                <textarea
                  :value="(topicBoardSeed.keywords || []).join('\n')"
                  class="text-sm mt-1 p-3 border border-slate-300 rounded-lg bg-white min-h-24 w-full resize-y focus:outline-none focus:border-blue-500"
                  placeholder="每行一个，或使用逗号分隔"
                  @input="updateTopicBoardSeed('keywords', splitSeedTags(($event.target as HTMLTextAreaElement).value))"
                />
              </label>

              <label class="block">
                <span class="text-xs text-slate-600 font-medium">团队技能标签</span>
                <textarea
                  :value="(topicBoardSeed.teamSkillTags || []).join('\n')"
                  class="text-sm mt-1 p-3 border border-slate-300 rounded-lg bg-white min-h-24 w-full resize-y focus:outline-none focus:border-blue-500"
                  placeholder="例如：前端、后端、算法、设计"
                  @input="updateTopicBoardSeed('teamSkillTags', splitSeedTags(($event.target as HTMLTextAreaElement).value))"
                />
              </label>
            </template>
          </section>

          <p v-if="errorText" class="text-xs text-rose-600" data-testid="team-create-project-error-text">
            {{ errorText }}
          </p>
        </div>

        <div class="mt-5 flex gap-2 items-center justify-end">
          <button
            type="button"
            class="text-sm text-slate-600 font-medium px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
            :disabled="submitting"
            @click="emitClose"
          >
            取消
          </button>
          <button
            data-testid="team-create-project-stay-submit-button"
            type="button"
            class="text-sm text-slate-700 font-medium px-4 py-2 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
            :disabled="submitting"
            @click="emit('submit', 'stay')"
          >
            {{ submittingMode === 'stay' ? '创建中...' : '仅创建' }}
          </button>
          <button
            data-testid="team-create-project-submit-button"
            type="button"
            class="text-sm text-white font-medium px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
            :disabled="submitting"
            @click="emit('submit', 'enter')"
          >
            {{ submittingMode === 'enter' ? '创建中...' : '创建并进入项目工作区' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

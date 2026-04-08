<script setup lang="ts">
import type { Contest, ProjectTopicBoardCreateSeed, WorkspaceWithQuota } from '~~/shared/types/domain'
import { formatWorkspaceTypeLabel } from '~/composables/team-ui'

const props = withDefaults(defineProps<{
  visible: boolean
  dialogTitle: string
  showTeamSelect?: boolean
  teamOptions?: WorkspaceWithQuota[]
  teamId?: string
  projectTitle: string
  summary: string
  contestIds: string[]
  topicBoardSeed?: ProjectTopicBoardCreateSeed
  contests?: Contest[]
  errorText?: string
  submitting?: boolean
  submitText?: string
}>(), {
  showTeamSelect: false,
  teamOptions: () => [],
  teamId: '',
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
  submitText: '创建并进入项目工作区',
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit'): void
  (event: 'update:teamId', value: string): void
  (event: 'update:projectTitle', value: string): void
  (event: 'update:summary', value: string): void
  (event: 'update:contestIds', value: string[]): void
  (event: 'update:topicBoardSeed', value: ProjectTopicBoardCreateSeed): void
}>()

function emitClose() {
  if (props.submitting)
    return
  emit('close')
}

function updateContestIds(event: Event) {
  const target = event.target as HTMLSelectElement
  emit('update:contestIds', Array.from(target.selectedOptions).map(option => option.value))
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
      <div class="p-5 border border-slate-200 rounded-2xl bg-white max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
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

        <div class="mt-4 space-y-4">
          <label v-if="showTeamSelect" class="block">
            <span class="text-xs text-slate-600 font-medium">所属项目台</span>
            <select
              :value="teamId"
              class="text-sm mt-1 px-3 border border-slate-300 rounded-lg bg-white h-10 w-full focus:outline-none focus:border-blue-500"
              @change="emit('update:teamId', String(($event.target as HTMLSelectElement).value || '').trim())"
            >
              <option value="" disabled>
                请选择项目台
              </option>
              <option v-for="item in teamOptions" :key="item.workspace.id" :value="item.workspace.id">
                {{ item.workspace.name }}（{{ formatWorkspaceTypeLabel(item.workspace.type) }}）
              </option>
            </select>
          </label>

          <label class="block">
            <span class="text-xs text-slate-600 font-medium">项目名称</span>
            <input
              :value="projectTitle"
              data-testid="team-create-project-title-input"
              class="text-sm mt-1 px-3 border border-slate-300 rounded-lg bg-white h-10 w-full focus:outline-none focus:border-blue-500"
              placeholder="例如：AI 校园服务助手"
              maxlength="120"
              type="text"
              @input="emit('update:projectTitle', String(($event.target as HTMLInputElement).value || ''))"
            >
          </label>

          <label class="block">
            <span class="text-xs text-slate-600 font-medium">项目简介</span>
            <textarea
              :value="summary"
              data-testid="team-create-project-summary-input"
              class="text-sm mt-1 p-3 border border-slate-300 rounded-lg bg-white min-h-28 w-full resize-y focus:outline-none focus:border-blue-500"
              maxlength="600"
              placeholder="简要描述项目目标、核心价值与预期成果。"
              @input="emit('update:summary', String(($event.target as HTMLTextAreaElement).value || ''))"
            />
          </label>

          <label class="block">
            <span class="text-xs text-slate-600 font-medium">关联竞赛（可多选）</span>
            <select
              data-testid="team-create-project-contest-select"
              class="text-sm mt-1 p-2 border border-slate-300 rounded-lg bg-white min-h-28 w-full focus:outline-none focus:border-blue-500"
              multiple
              @change="updateContestIds"
            >
              <option
                v-for="item in contests"
                :key="item.id"
                :selected="contestIds.includes(item.id)"
                :value="item.id"
              >
                {{ item.name }}
              </option>
            </select>
          </label>

          <section class="p-3 border border-slate-200 rounded-xl bg-slate-50/80 space-y-3">
            <label class="flex items-center justify-between gap-3">
              <span class="text-xs text-slate-700 font-medium">创建后自动生成 AI 智能选题板</span>
              <input
                :checked="topicBoardSeed.autoGenerate !== false"
                type="checkbox"
                @change="updateTopicBoardSeed('autoGenerate', ($event.target as HTMLInputElement).checked)"
              >
            </label>

            <template v-if="topicBoardSeed.autoGenerate !== false">
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            class="text-sm text-slate-600 font-medium px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
            :disabled="submitting"
            @click="emitClose"
          >
            取消
          </button>
          <button
            data-testid="team-create-project-submit-button"
            class="text-sm text-white font-medium px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
            :disabled="submitting"
            @click="emit('submit')"
          >
            {{ submitting ? '创建中...' : submitText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

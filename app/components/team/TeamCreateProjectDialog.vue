<script setup lang="ts">
import type { Contest } from '~~/shared/types/domain'
import type { WorkspaceProjectCommonForm } from '~/types/workspace'

const props = withDefaults(defineProps<{
  visible: boolean
  dialogTitle: string
  helperText?: string
  modelValue: WorkspaceProjectCommonForm
  contestIds: string[]
  contests?: Contest[]
  errorText?: string
  submitting?: boolean
  submittingMode?: 'stay' | 'enter' | ''
}>(), {
  helperText: '',
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
}>()

type CreateProjectStep = 'basic' | 'contest'

const createStep = ref<CreateProjectStep>('basic')
const contestLinkEnabled = ref(false)
const contestSearchQuery = ref('')
const basicStepError = ref('')

const isBasicStep = computed(() => createStep.value === 'basic')
const isContestStep = computed(() => createStep.value === 'contest')
const selectedContestCount = computed(() => props.contestIds.length)
const normalizedContestSearchQuery = computed(() => contestSearchQuery.value.trim().toLowerCase())
const filteredContests = computed(() => {
  const query = normalizedContestSearchQuery.value
  if (!query)
    return props.contests

  return props.contests.filter((contest) => {
    const haystack = [
      contest.name,
      contest.summary,
      contest.organizer,
      contest.level,
      ...(contest.disciplines || []),
      ...(contest.tags || []),
    ].join('\n').toLowerCase()

    return haystack.includes(query)
  })
})

watch(
  () => props.visible,
  (visible) => {
    if (!visible)
      return

    createStep.value = 'basic'
    contestLinkEnabled.value = props.contestIds.length > 0
    contestSearchQuery.value = ''
    basicStepError.value = ''
  },
)

watch(
  () => props.contestIds.length,
  (count) => {
    if (count > 0)
      contestLinkEnabled.value = true
  },
)

function emitClose() {
  if (props.submitting)
    return
  emit('close')
}

function goToBasicStep() {
  if (props.submitting)
    return

  createStep.value = 'basic'
  basicStepError.value = ''
}

function goToContestStep() {
  if (props.submitting)
    return

  if (!String(props.modelValue.title || '').trim()) {
    basicStepError.value = '请先填写项目名称。'
    return
  }

  createStep.value = 'contest'
  basicStepError.value = ''
}

function setContestLinkEnabled(enabled: boolean) {
  if (props.submitting)
    return

  contestLinkEnabled.value = enabled
  if (!enabled && props.contestIds.length > 0)
    emit('update:contestIds', [])
}

function toggleContestId(contestId: string) {
  const normalizedContestId = String(contestId || '').trim()
  if (!normalizedContestId)
    return

  if (!contestLinkEnabled.value)
    contestLinkEnabled.value = true

  const nextContestIds = props.contestIds.includes(normalizedContestId)
    ? props.contestIds.filter(item => item !== normalizedContestId)
    : [...props.contestIds, normalizedContestId]

  emit('update:contestIds', nextContestIds)
}

function submitCreate(mode: 'stay' | 'enter') {
  if (props.submitting)
    return

  if (!contestLinkEnabled.value && props.contestIds.length > 0)
    emit('update:contestIds', [])

  emit('submit', mode)
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

        <div class="mt-4 p-1 border border-slate-200 rounded-lg bg-slate-50 gap-1 grid grid-cols-2" data-testid="team-create-project-stepper">
          <button
            type="button"
            data-testid="team-create-project-step-basic"
            class="text-xs font-medium px-3 py-2 rounded-md transition-colors"
            :class="isBasicStep ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-white/80'"
            :disabled="submitting"
            @click="goToBasicStep"
          >
            1. 基本信息
          </button>
          <button
            type="button"
            data-testid="team-create-project-step-contest"
            class="text-xs font-medium px-3 py-2 rounded-md transition-colors"
            :class="isContestStep ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-white/80'"
            :disabled="submitting"
            @click="goToContestStep"
          >
            2. 关联竞赛（可选）
          </button>
        </div>

        <div class="mt-4 pr-1 min-h-0 overflow-y-auto space-y-4">
          <section v-show="isBasicStep" data-testid="team-create-project-step-basic-panel" class="space-y-4">
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
          </section>

          <section v-show="isContestStep" data-testid="team-create-project-step-contest-panel" class="p-4 border border-slate-200 rounded-lg bg-slate-50/70 space-y-4">
            <div class="flex gap-2 items-center justify-between">
              <div>
                <h4 class="text-sm text-slate-800 font-semibold">
                  关联竞赛
                </h4>
                <p class="text-[11px] text-slate-500 mt-1">
                  可先创建独立项目，也可以在创建时勾选一个或多个竞赛。
                </p>
              </div>
              <span class="text-[11px] text-slate-500 font-medium">
                已选 {{ selectedContestCount }} 项
              </span>
            </div>

            <div class="gap-2 grid grid-cols-1 sm:grid-cols-2" data-testid="team-create-project-contest-link-mode">
              <label
                class="p-3 border rounded-lg bg-white cursor-pointer transition-colors"
                :class="!contestLinkEnabled ? 'border-blue-300 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'"
              >
                <input
                  class="sr-only"
                  :checked="!contestLinkEnabled"
                  :disabled="submitting"
                  type="radio"
                  name="team-create-project-contest-link-mode"
                  @change="setContestLinkEnabled(false)"
                >
                <span class="text-sm font-medium block">暂不关联竞赛</span>
                <span class="text-[11px] mt-1 block">先创建项目，后续在项目设置中补充绑定。</span>
              </label>

              <label
                class="p-3 border rounded-lg bg-white cursor-pointer transition-colors"
                :class="contestLinkEnabled ? 'border-blue-300 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'"
              >
                <input
                  class="sr-only"
                  :checked="contestLinkEnabled"
                  :disabled="submitting"
                  type="radio"
                  name="team-create-project-contest-link-mode"
                  @change="setContestLinkEnabled(true)"
                >
                <span class="text-sm font-medium block">关联竞赛</span>
                <span class="text-[11px] mt-1 block">从可用竞赛里勾选当前项目相关项。</span>
              </label>
            </div>

            <div
              v-if="contestLinkEnabled"
              data-testid="team-create-project-contest-select"
              class="border border-slate-200 rounded-lg bg-white overflow-hidden"
            >
              <div v-if="contests.length > 0" class="p-3 border-b border-slate-100 bg-white">
                <label class="block">
                  <span class="sr-only">搜索竞赛</span>
                  <span class="block relative">
                    <span class="i-heroicons-outline-magnifying-glass text-slate-400 left-3 top-1/2 absolute -translate-y-1/2" />
                    <input
                      v-model="contestSearchQuery"
                      data-testid="team-create-project-contest-search-input"
                      class="text-sm text-slate-800 pl-9 pr-9 border border-slate-200 rounded-lg bg-white h-9 w-full placeholder:text-slate-400 focus:outline-none focus:border-blue-400"
                      placeholder="搜索竞赛名称、简介、主办方、学科"
                      type="search"
                    >
                    <button
                      v-if="contestSearchQuery"
                      type="button"
                      data-testid="team-create-project-contest-search-clear"
                      class="text-slate-400 rounded flex h-6 w-6 items-center right-2 top-1/2 justify-center absolute hover:bg-slate-100 -translate-y-1/2"
                      :disabled="submitting"
                      @click="contestSearchQuery = ''"
                    >
                      <span class="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </span>
                </label>
              </div>

              <div v-if="contests.length === 0" class="text-xs text-slate-500 px-4 py-4" data-testid="team-create-project-empty-contests">
                暂无竞赛可选，可稍后在项目设置中补充。
              </div>

              <div v-else-if="filteredContests.length === 0" class="text-xs text-slate-500 px-4 py-4" data-testid="team-create-project-empty-contest-search">
                没有匹配的竞赛，可调整关键词或清空搜索。
              </div>

              <div v-else class="max-h-56 overflow-y-auto divide-slate-100 divide-y">
                <label
                  v-for="item in filteredContests"
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

            <div v-else class="text-xs text-slate-500 px-4 py-3 border border-slate-200 rounded-lg border-dashed bg-white">
              本次创建不会绑定竞赛，项目会以独立草稿创建。
            </div>
          </section>

          <p v-if="basicStepError" class="text-xs text-rose-600" data-testid="team-create-project-basic-step-error">
            {{ basicStepError }}
          </p>

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
            v-if="isBasicStep"
            data-testid="team-create-project-next-step-button"
            type="button"
            class="text-sm text-white font-medium px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
            :disabled="submitting"
            @click="goToContestStep"
          >
            下一步：关联竞赛
          </button>
          <button
            v-if="isContestStep"
            type="button"
            class="text-sm text-slate-600 font-medium px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
            :disabled="submitting"
            @click="goToBasicStep"
          >
            上一步
          </button>
          <button
            v-if="isContestStep"
            data-testid="team-create-project-stay-submit-button"
            type="button"
            class="text-sm text-slate-700 font-medium px-4 py-2 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
            :disabled="submitting"
            @click="submitCreate('stay')"
          >
            {{ submittingMode === 'stay' ? '创建中...' : '仅创建' }}
          </button>
          <button
            v-if="isContestStep"
            data-testid="team-create-project-submit-button"
            type="button"
            class="text-sm text-white font-medium px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
            :disabled="submitting"
            @click="submitCreate('enter')"
          >
            {{ submittingMode === 'enter' ? '创建中...' : '创建并进入研发工作台' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

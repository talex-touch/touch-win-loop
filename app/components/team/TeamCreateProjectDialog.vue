<script setup lang="ts">
import type { Contest, WorkspaceWithQuota } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  visible: boolean
  dialogTitle: string
  showTeamSelect?: boolean
  teamOptions?: WorkspaceWithQuota[]
  teamId?: string
  projectTitle: string
  summary: string
  contestIds: string[]
  contests?: Contest[]
  errorText?: string
  submitting?: boolean
  submitText?: string
}>(), {
  showTeamSelect: false,
  teamOptions: () => [],
  teamId: '',
  contests: () => [],
  errorText: '',
  submitting: false,
  submitText: '创建并进入工作台',
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'submit'): void
  (event: 'update:teamId', value: string): void
  (event: 'update:projectTitle', value: string): void
  (event: 'update:summary', value: string): void
  (event: 'update:contestIds', value: string[]): void
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
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="p-4 bg-black/30 flex items-center inset-0 justify-center fixed z-50"
      @click.self="emitClose"
    >
      <div class="p-5 border border-slate-200 rounded-2xl bg-white max-w-lg w-full shadow-xl">
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
            <span class="text-xs text-slate-600 font-medium">所属 Team</span>
            <select
              :value="teamId"
              class="text-sm mt-1 px-3 border border-slate-300 rounded-lg bg-white h-10 w-full focus:outline-none focus:border-blue-500"
              @change="emit('update:teamId', String(($event.target as HTMLSelectElement).value || '').trim())"
            >
              <option value="" disabled>
                请选择 Team
              </option>
              <option v-for="item in teamOptions" :key="item.workspace.id" :value="item.workspace.id">
                {{ item.workspace.name }}（{{ item.workspace.type }}）
              </option>
            </select>
          </label>

          <label class="block">
            <span class="text-xs text-slate-600 font-medium">项目名称</span>
            <input
              :value="projectTitle"
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
              class="text-sm mt-1 p-3 border border-slate-300 rounded-lg bg-white min-h-28 w-full resize-y focus:outline-none focus:border-blue-500"
              maxlength="600"
              placeholder="简要描述项目目标、核心价值与预期成果。"
              @input="emit('update:summary', String(($event.target as HTMLTextAreaElement).value || ''))"
            />
          </label>

          <label class="block">
            <span class="text-xs text-slate-600 font-medium">关联竞赛（可多选）</span>
            <select
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

          <p v-if="errorText" class="text-xs text-rose-600">
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

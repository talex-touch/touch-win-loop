<script setup lang="ts">
const props = withDefaults(defineProps<{
  visible?: boolean
  normalizedWorkspaceSeatUsed?: number
  normalizedWorkspaceSeatLimit?: number | null
  workspaceSeatSummaryText?: string
  workspaceSeatLimitDraft?: number | null
  workspaceSeatDraftTooSmall?: boolean
  workspaceSeatDraftTooLarge?: boolean
  workspaceSeatLimitError?: string
  workspaceSeatLimitSaveLoading?: boolean
  canSubmitWorkspaceSeatLimit?: boolean
}>(), {
  visible: false,
  normalizedWorkspaceSeatUsed: 0,
  normalizedWorkspaceSeatLimit: null,
  workspaceSeatSummaryText: '',
  workspaceSeatLimitDraft: null,
  workspaceSeatDraftTooSmall: false,
  workspaceSeatDraftTooLarge: false,
  workspaceSeatLimitError: '',
  workspaceSeatLimitSaveLoading: false,
  canSubmitWorkspaceSeatLimit: false,
})

const emit = defineEmits<{
  close: []
  submitSeatLimit: []
  updateWorkspaceSeatLimitDraft: [value: number | null]
}>()

const modelVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => {
    if (!value)
      emit('close')
  },
})

function normalizeSeatLimitDraft(value: number | string | undefined): number | null {
  const next = Number(value)
  if (!Number.isFinite(next))
    return null
  return Math.max(1, Math.trunc(next))
}
</script>

<template>
  <a-modal
    v-model:visible="modelVisible"
    title="调整项目席位"
    width="560px"
    :footer="false"
    @cancel="emit('close')"
  >
    <div class="text-[11px] space-y-3">
      <div class="p-2 border border-slate-200 rounded bg-slate-50">
        <p class="text-[11px] text-slate-800 font-semibold m-0">
          当前项目席位
        </p>
        <p class="text-[12px] text-slate-700 m-0 mt-1">
          {{ props.normalizedWorkspaceSeatUsed }} / {{ props.normalizedWorkspaceSeatLimit ?? '--' }}
        </p>
        <p class="text-[11px] text-slate-500 m-0 mt-1">
          {{ props.workspaceSeatSummaryText }}
        </p>
      </div>

      <label class="text-[11px] text-slate-600 block space-y-1">
        <span class="block">目标席位上限</span>
        <a-input-number
          :model-value="props.workspaceSeatLimitDraft"
          :min="1"
          :max="15"
          :step="1"
          :precision="0"
          size="small"
          class="w-full"
          placeholder="输入新的项目席位上限"
          @update:model-value="emit('updateWorkspaceSeatLimitDraft', normalizeSeatLimitDraft($event))"
        />
      </label>

      <p v-if="props.workspaceSeatDraftTooSmall" class="text-amber-700 p-2 border border-amber-200 rounded bg-amber-50">
        项目席位上限不能小于当前已使用席位（{{ props.normalizedWorkspaceSeatUsed }}）。
      </p>

      <p v-if="props.workspaceSeatDraftTooLarge" class="text-amber-700 p-2 border border-amber-200 rounded bg-amber-50">
        每个项目最多支持 15 个协作席位。
      </p>

      <p v-if="props.workspaceSeatLimitError" class="text-rose-600 p-2 border border-rose-200 rounded bg-rose-50">
        {{ props.workspaceSeatLimitError }}
      </p>

      <div class="flex gap-2 justify-end">
        <a-button size="small" @click="emit('close')">
          取消
        </a-button>
        <a-button
          size="small"
          type="primary"
          :loading="props.workspaceSeatLimitSaveLoading"
          :disabled="!props.canSubmitWorkspaceSeatLimit"
          @click="emit('submitSeatLimit')"
        >
          保存席位
        </a-button>
      </div>
    </div>
  </a-modal>
</template>

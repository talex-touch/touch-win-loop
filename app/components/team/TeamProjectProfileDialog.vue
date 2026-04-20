<script setup lang="ts">
import type { Project } from '~~/shared/types/domain'
import type { TeamProjectCardItem } from '~/composables/team-ui'
import type { WorkspaceProjectCommonForm } from '~/types/workspace'

const props = withDefaults(defineProps<{
  visible?: boolean
  project?: Project | null
  projectCard?: TeamProjectCardItem | null
  modelValue: WorkspaceProjectCommonForm
  disabled?: boolean
  saving?: boolean
}>(), {
  visible: false,
  project: null,
  projectCard: null,
  disabled: false,
  saving: false,
})

const emit = defineEmits<{
  'close': []
  'save': []
  'update:modelValue': [value: WorkspaceProjectCommonForm]
}>()

const modelVisible = computed({
  get: () => props.visible,
  set: (value: boolean) => {
    if (!value)
      emit('close')
  },
})
</script>

<template>
  <a-modal
    v-model:visible="modelVisible"
    title="项目设置"
    data-testid="team-project-settings-modal"
    width="720px"
    :footer="false"
    :esc-to-close="true"
    :mask-closable="true"
    @cancel="emit('close')"
  >
    <div class="space-y-4">
      <ProjectBasicSettingsEditor
        :model-value="modelValue"
        :project="project"
        :disabled="saving || disabled"
        @update:model-value="emit('update:modelValue', $event)"
      />

      <div
        v-if="projectCard && projectCard.contestNames.length > 0"
        class="flex flex-wrap gap-2"
      >
        <span
          v-for="contestName in projectCard.contestNames"
          :key="`${projectCard.id}-${contestName}`"
          class="text-xs text-slate-600 font-medium px-2 py-1 rounded-full bg-slate-100"
        >
          {{ contestName }}
        </span>
      </div>

      <div class="flex gap-2 justify-end">
        <a-button size="small" @click="emit('close')">
          取消
        </a-button>
        <a-button
          size="small"
          type="primary"
          data-testid="team-project-settings-save-button"
          :loading="saving"
          :disabled="disabled"
          @click="emit('save')"
        >
          保存
        </a-button>
      </div>
    </div>
  </a-modal>
</template>

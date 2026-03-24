<script setup lang="ts">
import type { WorkspaceWithQuota } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  mode?: 'link' | 'select'
  label?: string
  icon?: string
  to?: string
  modelValue?: string
  workspaceOptions?: WorkspaceWithQuota[]
  showQuota?: boolean
}>(), {
  mode: 'link',
  label: 'Team',
  icon: 'workspaces',
  to: '/team',
  modelValue: '',
  workspaceOptions: () => [],
  showQuota: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const currentWorkspace = computed(() => {
  return props.workspaceOptions?.find(item => item.workspace.id === props.modelValue) || null
})

function onSelectChange(event: Event) {
  emit('update:modelValue', (event.target as HTMLSelectElement).value)
}

function workspaceTypeLabel(type: WorkspaceWithQuota['workspace']['type']) {
  if (type === 'personal')
    return 'Personal Team'
  return 'Business Team'
}
</script>

<template>
  <NuxtLink
    v-if="props.mode === 'link'"
    :to="props.to"
    class="text-slate-500 mt-4 px-3 py-2 flex gap-3 transition-colors items-center hover:text-slate-900"
  >
    <span class="material-symbols-outlined">{{ props.icon }}</span>
    <span class="text-sm font-medium">{{ props.label }}</span>
  </NuxtLink>

  <div v-else class="space-y-1">
    <div class="text-[10px] text-slate-500 font-semibold">
      {{ props.label }}
    </div>
    <select
      :value="props.modelValue"
      class="text-xs px-2 outline-none border border-slate-300 rounded bg-white h-8 w-full focus:border-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
      :disabled="!props.workspaceOptions?.length"
      @change="onSelectChange"
    >
      <option v-if="!props.workspaceOptions?.length" value="" disabled>
        暂无 Team
      </option>
      <option v-for="item in props.workspaceOptions" :key="item.workspace.id" :value="item.workspace.id">
        {{ item.workspace.name }}（{{ workspaceTypeLabel(item.workspace.type) }}）
      </option>
    </select>
    <div v-if="props.showQuota && currentWorkspace?.quota" class="text-[10px] text-slate-400 leading-relaxed">
      席位 {{ currentWorkspace.quota.seatUsed }}/{{ currentWorkspace.quota.seatLimit }}，
      AI {{ currentWorkspace.quota.aiQuotaUsed }}/{{ currentWorkspace.quota.aiQuotaTotal }}
    </div>
  </div>
</template>

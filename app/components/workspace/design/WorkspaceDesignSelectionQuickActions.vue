<script setup lang="ts">
export interface WorkspaceDesignQuickActionItem {
  id: string
  label: string
  icon: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  title?: string
  actions?: WorkspaceDesignQuickActionItem[]
}>(), {
  title: '',
  actions: () => [],
})

const emit = defineEmits<{
  runAction: [actionId: string]
}>()
</script>

<template>
  <div
    v-if="props.actions.length"
    class="pointer-events-none left-1/2 top-5 absolute z-[188] -translate-x-1/2"
    data-testid="workspace-design-selection-quick-actions"
  >
    <div
      class="pointer-events-auto flex max-w-[min(82vw,980px)] flex-wrap items-center justify-center gap-2 rounded-[20px] border border-slate-200/90 bg-white/92 px-3 py-2 shadow-[0_20px_48px_rgba(15,23,42,0.14)] backdrop-blur-xl"
    >
      <span
        v-if="props.title"
        class="mr-1 inline-flex h-8 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-[11px] font-semibold text-slate-600"
      >
        {{ props.title }}
      </span>

      <button
        v-for="action in props.actions"
        :key="action.id"
        class="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        type="button"
        :disabled="action.disabled"
        :title="action.label"
        :aria-label="action.label"
        @click="emit('runAction', action.id)"
      >
        <span class="material-symbols-outlined text-[15px]">{{ action.icon }}</span>
        <span>{{ action.label }}</span>
      </button>
    </div>
  </div>
</template>

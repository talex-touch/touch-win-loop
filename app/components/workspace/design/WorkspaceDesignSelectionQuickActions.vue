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
      class="px-3 py-2 border border-slate-200/90 rounded-[20px] bg-white/92 flex flex-wrap gap-2 max-w-[min(82vw,980px)] pointer-events-auto shadow-[0_20px_48px_rgba(15,23,42,0.14)] items-center justify-center backdrop-blur-xl"
    >
      <span
        v-if="props.title"
        class="text-[11px] text-slate-600 font-semibold mr-1 px-3 border border-slate-200 rounded-full bg-slate-50 inline-flex h-8 items-center"
      >
        {{ props.title }}
      </span>

      <button
        v-for="action in props.actions"
        :key="action.id"
        class="text-[11px] text-slate-700 font-semibold px-3 border border-slate-200 rounded-full bg-white inline-flex gap-1 h-8 transition-colors items-center disabled:text-slate-400 hover:text-sky-700 disabled:border-slate-200 hover:border-sky-200 disabled:bg-slate-100 hover:bg-sky-50 disabled:cursor-not-allowed"
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

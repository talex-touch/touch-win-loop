<script setup lang="ts">
import { computed } from 'vue'

type DesignSidebarTab = 'pages' | 'frames' | 'assets'

const props = withDefaults(
  defineProps<{
    activeTab?: DesignSidebarTab
  }>(),
  {
    activeTab: 'pages',
  },
)

const emit = defineEmits<{
  'update:activeTab': [tab: DesignSidebarTab]
}>()

const tabs = computed<Array<{ id: DesignSidebarTab, label: string, icon: string }>>(() => [
  { id: 'pages', label: 'Pages', icon: 'description' },
  { id: 'frames', label: 'Frames', icon: 'dashboard_customize' },
  { id: 'assets', label: 'Assets', icon: 'imagesmode' },
])
</script>

<template>
  <nav
    class="p-0.5 border border-slate-200/90 rounded-[10px] bg-white/78 inline-flex gap-0.5 max-w-full min-h-0 items-center backdrop-blur-xl"
    data-testid="workspace-design-sidebar-tabs"
  >
    <button
      v-for="tab in tabs"
      :key="tab.id"
      class="group text-[10px] leading-none tracking-[0.01em] font-semibold px-2 py-1.5 border rounded-[8px] inline-flex shrink-0 gap-1 min-w-[36px] transition-[padding,background-color,border-color,color] duration-200 items-center justify-center"
      :class="
        tab.id === props.activeTab
          ? 'border-slate-300 bg-white text-slate-950'
          : 'border-transparent bg-transparent text-slate-500 hover:border-slate-200 hover:bg-white/84 hover:text-slate-900'
      "
      :title="tab.label"
      type="button"
      @click="emit('update:activeTab', tab.id)"
    >
      <span class="material-symbols-outlined text-[15px] leading-none">{{
        tab.icon
      }}</span>
      <span
        class="whitespace-nowrap transition-[max-width,opacity,margin] duration-200 overflow-hidden"
        :class="
          tab.id === props.activeTab
            ? 'ml-0.5 max-w-[56px] opacity-100'
            : 'max-w-0 opacity-0 group-hover:ml-0.5 group-hover:max-w-[56px] group-hover:opacity-100 group-focus-visible:ml-0.5 group-focus-visible:max-w-[56px] group-focus-visible:opacity-100'
        "
      >
        {{ tab.label }}
      </span>
    </button>
  </nav>
</template>

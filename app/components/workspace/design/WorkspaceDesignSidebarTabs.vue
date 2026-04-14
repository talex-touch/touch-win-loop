<script setup lang="ts">
type DesignSidebarTab = "pages" | "frames" | "assets";

const props = withDefaults(
  defineProps<{
    activeTab?: DesignSidebarTab;
  }>(),
  {
    activeTab: "pages",
  },
);

const emit = defineEmits<{
  "update:activeTab": [tab: DesignSidebarTab];
}>();

const tabs: Array<{ id: DesignSidebarTab; label: string; icon: string }> = [
  { id: "pages", label: "Pages", icon: "description" },
  { id: "frames", label: "Frames", icon: "dashboard_customize" },
  { id: "assets", label: "Assets", icon: "imagesmode" },
];
</script>

<template>
  <nav
    class="inline-flex min-h-0 max-w-full items-center gap-0.5 rounded-[10px] border border-slate-200/90 bg-white/78 p-0.5 backdrop-blur-xl"
    data-testid="workspace-design-sidebar-tabs"
  >
    <button
      v-for="tab in tabs"
      :key="tab.id"
      class="group inline-flex min-w-[36px] shrink-0 items-center justify-center gap-1 rounded-[8px] border px-2 py-1.5 text-[10px] font-semibold leading-none tracking-[0.01em] transition-[padding,background-color,border-color,color] duration-200"
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
        class="overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-200"
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

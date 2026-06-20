<script setup lang="ts">
const props = withDefaults(defineProps<{
  breadcrumbs?: string[]
  contextLabel?: string
  activeToolLabel?: string
  canvasAiStatusLabel?: string
  canvasAiStatusClass?: string
  diagramEntryLabel?: string
  showDiagramEntry?: boolean
}>(), {
  breadcrumbs: () => [],
  contextLabel: '',
  activeToolLabel: '',
  canvasAiStatusLabel: '',
  canvasAiStatusClass: '',
  diagramEntryLabel: '打开 Diagram 编辑态',
  showDiagramEntry: false,
})

const emit = defineEmits<{
  openDiagramEditor: []
}>()
</script>

<template>
  <div
    class="flex gap-3 pointer-events-none items-start left-5 right-5 top-5 justify-between absolute z-[190]"
    data-testid="workspace-design-canvas-context-hud"
  >
    <div
      class="px-4 py-3 border border-white/70 rounded-[18px] bg-white/86 max-w-[min(70vw,720px)] pointer-events-auto shadow-[0_18px_48px_rgba(15,23,42,0.12)] backdrop-blur-xl"
    >
      <div class="text-[11px] text-slate-500 font-semibold flex flex-wrap gap-2 items-center">
        <template v-for="(item, index) in props.breadcrumbs" :key="`canvas-hud-breadcrumb-${index}-${item}`">
          <span :class="index === props.breadcrumbs.length - 1 ? 'text-slate-900' : ''">
            {{ item }}
          </span>
          <span
            v-if="index < props.breadcrumbs.length - 1"
            class="material-symbols-outlined text-[14px] text-slate-400"
          >chevron_right</span>
        </template>
      </div>

      <div class="mt-2 flex flex-wrap gap-2">
        <span
          v-if="props.contextLabel"
          class="text-[11px] text-sky-700 font-semibold px-3 border border-sky-200 rounded-full bg-sky-50 inline-flex h-7 items-center"
        >
          {{ props.contextLabel }}
        </span>
        <span
          v-if="props.activeToolLabel"
          class="text-[11px] text-slate-700 font-semibold px-3 border border-slate-200 rounded-full bg-slate-50 inline-flex h-7 items-center"
        >
          当前工具 · {{ props.activeToolLabel }}
        </span>
      </div>
    </div>

    <div class="flex flex-wrap gap-2 pointer-events-auto items-center justify-end">
      <span
        v-if="props.canvasAiStatusLabel"
        class="text-[11px] font-semibold px-3 border rounded-full inline-flex h-8 shadow-[0_10px_24px_rgba(15,23,42,0.1)] items-center backdrop-blur-xl"
        :class="props.canvasAiStatusClass || 'border-slate-200 bg-white/86 text-slate-700'"
      >
        Diagram AI · {{ props.canvasAiStatusLabel }}
      </span>
      <button
        v-if="props.showDiagramEntry"
        class="text-[11px] text-slate-700 font-semibold px-3 border border-slate-200 rounded-full bg-white/88 inline-flex gap-1 h-8 shadow-[0_10px_24px_rgba(15,23,42,0.1)] transition-colors items-center hover:text-sky-700 hover:border-sky-200 hover:bg-sky-50"
        type="button"
        @click="emit('openDiagramEditor')"
      >
        <span class="material-symbols-outlined text-[15px]">schema</span>
        <span>{{ props.diagramEntryLabel }}</span>
      </button>
    </div>
  </div>
</template>

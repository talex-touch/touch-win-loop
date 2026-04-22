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
    class="pointer-events-none left-5 right-5 top-5 absolute z-[190] flex items-start justify-between gap-3"
    data-testid="workspace-design-canvas-context-hud"
  >
    <div
      class="pointer-events-auto max-w-[min(70vw,720px)] rounded-[18px] border border-white/70 bg-white/86 px-4 py-3 shadow-[0_18px_48px_rgba(15,23,42,0.12)] backdrop-blur-xl"
    >
      <div class="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
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
          class="inline-flex h-7 items-center rounded-full border border-sky-200 bg-sky-50 px-3 text-[11px] font-semibold text-sky-700"
        >
          {{ props.contextLabel }}
        </span>
        <span
          v-if="props.activeToolLabel"
          class="inline-flex h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-[11px] font-semibold text-slate-700"
        >
          当前工具 · {{ props.activeToolLabel }}
        </span>
      </div>
    </div>

    <div class="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
      <span
        v-if="props.canvasAiStatusLabel"
        class="inline-flex h-8 items-center rounded-full border px-3 text-[11px] font-semibold shadow-[0_10px_24px_rgba(15,23,42,0.1)] backdrop-blur-xl"
        :class="props.canvasAiStatusClass || 'border-slate-200 bg-white/86 text-slate-700'"
      >
        Diagram AI · {{ props.canvasAiStatusLabel }}
      </span>
      <button
        v-if="props.showDiagramEntry"
        class="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 bg-white/88 px-3 text-[11px] font-semibold text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.1)] transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
        type="button"
        @click="emit('openDiagramEditor')"
      >
        <span class="material-symbols-outlined text-[15px]">schema</span>
        <span>{{ props.diagramEntryLabel }}</span>
      </button>
    </div>
  </div>
</template>

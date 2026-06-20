<script setup lang="ts">
const props = withDefaults(defineProps<{
  canCreateFrame?: boolean
  canExportDefaultFrames?: boolean
  canExportPage?: boolean
  canOpenDiagramEditor?: boolean
  defaultExportSvgLabel?: string
  defaultExportPngLabel?: string
}>(), {
  canCreateFrame: false,
  canExportDefaultFrames: false,
  canExportPage: false,
  canOpenDiagramEditor: false,
  defaultExportSvgLabel: '导出当前 Frame SVG',
  defaultExportPngLabel: '导出当前 Frame PNG',
})

const emit = defineEmits<{
  createPage: []
  createFreeformFrame: []
  createDeviceArtboard: []
  createDiagram: []
  insertTemplateFrame: []
  downloadDefaultSvg: []
  downloadDefaultPng: []
  downloadPageSvg: []
  downloadPagePng: []
  createDeviceArrangement: []
  openDiagramEditor: []
}>()
</script>

<template>
  <div
    class="flex flex-col gap-3"
    data-testid="workspace-design-sidebar-action-menus"
  >
    <section class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[10px] text-slate-400 tracking-[0.16em] font-semibold uppercase">创建</span>
        <button
          class="text-[11px] text-slate-900 font-semibold px-2.5 border border-slate-200 rounded-[10px] bg-white inline-flex gap-1 h-8 transition-colors items-center hover:bg-slate-50"
          type="button"
          @click="emit('createPage')"
        >
          <span class="material-symbols-outlined text-sm">note_stack_add</span>
          <span>Page</span>
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          class="text-[11px] text-slate-700 font-semibold px-2.5 border border-slate-200 rounded-[10px] bg-white inline-flex gap-1 h-8 transition-colors items-center hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          type="button"
          :disabled="!props.canCreateFrame"
          @click="emit('createFreeformFrame')"
        >
          <span class="material-symbols-outlined text-sm">dashboard</span>
          <span>自由 Frame</span>
        </button>
        <button
          class="text-[11px] text-slate-700 font-semibold px-2.5 border border-slate-200 rounded-[10px] bg-white inline-flex gap-1 h-8 transition-colors items-center hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          type="button"
          :disabled="!props.canCreateFrame"
          @click="emit('createDeviceArtboard')"
        >
          <span class="material-symbols-outlined text-sm">phone_iphone</span>
          <span>设备 Frame</span>
        </button>
        <button
          class="text-[11px] text-slate-700 font-semibold px-2.5 border border-slate-200 rounded-[10px] bg-white inline-flex gap-1 h-8 transition-colors items-center hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          type="button"
          :disabled="!props.canCreateFrame"
          @click="emit('createDiagram')"
        >
          <span class="material-symbols-outlined text-sm">account_tree</span>
          <span>Diagram</span>
        </button>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          class="text-[11px] text-slate-600 font-semibold px-2.5 border border-slate-200 rounded-[10px] border-dashed bg-white/72 inline-flex gap-1 h-8 transition-colors items-center hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          type="button"
          :disabled="!props.canCreateFrame"
          @click="emit('insertTemplateFrame')"
        >
          <span class="material-symbols-outlined text-sm">auto_awesome_mosaic</span>
          <span>模板稿</span>
        </button>
      </div>
    </section>

    <section class="space-y-2">
      <span class="text-[10px] text-slate-400 tracking-[0.16em] font-semibold uppercase">导出</span>
      <div class="flex flex-wrap gap-2">
        <button
          class="text-[11px] text-slate-700 font-semibold px-2.5 border border-slate-200 rounded-[10px] bg-white inline-flex gap-1 h-8 transition-colors items-center hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          type="button"
          :disabled="!props.canExportDefaultFrames"
          @click="emit('createDeviceArrangement')"
        >
          <span class="material-symbols-outlined text-sm">devices</span>
          <span>生成设备排布</span>
        </button>
        <button
          class="text-[11px] text-slate-700 font-semibold px-2.5 border border-slate-200 rounded-[10px] bg-white inline-flex gap-1 h-8 transition-colors items-center hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          type="button"
          :disabled="!props.canExportDefaultFrames"
          @click="emit('downloadDefaultSvg')"
        >
          <span class="material-symbols-outlined text-sm">download</span>
          <span>{{ props.defaultExportSvgLabel }}</span>
        </button>
        <button
          class="text-[11px] text-slate-700 font-semibold px-2.5 border border-slate-200 rounded-[10px] bg-white inline-flex gap-1 h-8 transition-colors items-center hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          type="button"
          :disabled="!props.canExportDefaultFrames"
          @click="emit('downloadDefaultPng')"
        >
          <span class="material-symbols-outlined text-sm">image</span>
          <span>{{ props.defaultExportPngLabel }}</span>
        </button>
        <button
          class="text-[11px] text-slate-700 font-semibold px-2.5 border border-slate-200 rounded-[10px] bg-white inline-flex gap-1 h-8 transition-colors items-center hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          type="button"
          :disabled="!props.canExportPage"
          @click="emit('downloadPageSvg')"
        >
          <span class="material-symbols-outlined text-sm">article</span>
          <span>辅助导出 Page SVG</span>
        </button>
        <button
          class="text-[11px] text-slate-700 font-semibold px-2.5 border border-slate-200 rounded-[10px] bg-white inline-flex gap-1 h-8 transition-colors items-center hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          type="button"
          :disabled="!props.canExportPage"
          @click="emit('downloadPagePng')"
        >
          <span class="material-symbols-outlined text-sm">crop_portrait</span>
          <span>辅助导出 Page PNG</span>
        </button>
      </div>
    </section>

    <section
      v-if="props.canOpenDiagramEditor"
      class="space-y-2"
    >
      <span class="text-[10px] text-slate-400 tracking-[0.16em] font-semibold uppercase">上下文</span>
      <button
        class="text-[11px] text-sky-700 font-semibold px-2.5 border border-sky-200 rounded-[10px] bg-sky-50 inline-flex gap-1 h-8 transition-colors items-center hover:bg-sky-100"
        type="button"
        @click="emit('openDiagramEditor')"
      >
        <span class="material-symbols-outlined text-sm">schema</span>
        <span>打开 Diagram 编辑态</span>
      </button>
    </section>
  </div>
</template>

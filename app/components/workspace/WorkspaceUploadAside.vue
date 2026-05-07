<script setup lang="ts">
import type { ProjectUploadSummary } from '~/types/project-upload'

const props = withDefaults(defineProps<{
  hasActiveProject?: boolean
  uploadSummary?: ProjectUploadSummary | null
  active?: boolean
}>(), {
  hasActiveProject: false,
  uploadSummary: null,
  active: false,
})

const emit = defineEmits<{
  open: []
}>()

const normalizedUploadSummary = computed<ProjectUploadSummary | null>(() => {
  if (!props.uploadSummary || props.uploadSummary.totalCount <= 0)
    return null
  return props.uploadSummary
})

const triggerBadgeText = computed(() => {
  const summary = normalizedUploadSummary.value
  if (!summary)
    return ''
  return summary.totalCount > 99 ? '99+' : String(summary.totalCount)
})
</script>

<template>
  <div v-if="props.hasActiveProject" class="workspace-upload-aside">
    <button
      data-testid="workspace-left-rail-upload-button"
      class="workspace-upload-aside__trigger"
      :class="{ 'workspace-upload-aside__trigger--active': props.active }"
      type="button"
      :aria-pressed="props.active ? 'true' : 'false'"
      aria-label="打开上传管理"
      @click="emit('open')"
    >
      <span class="material-symbols-outlined workspace-upload-aside__icon">upload_file</span>
      <span v-if="triggerBadgeText" class="workspace-upload-aside__badge">{{ triggerBadgeText }}</span>
      <span class="workspace-upload-aside__popover" aria-hidden="true">上传管理</span>
    </button>
  </div>
</template>

<style scoped>
.workspace-upload-aside {
  display: flex;
  justify-content: center;
  width: 100%;
}

.workspace-upload-aside__trigger {
  position: relative;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: #51739f;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.workspace-upload-aside__trigger:hover,
.workspace-upload-aside__trigger:focus-visible {
  background: #eef5ff;
  color: #234a7b;
}

.workspace-upload-aside__trigger:focus-visible {
  outline: 2px solid #cddcf7;
  outline-offset: 1px;
}

.workspace-upload-aside__trigger--active {
  background: #eef4ff;
  color: #1e3a74;
  box-shadow: inset 0 0 0 1px #d7e3f8;
}

.workspace-upload-aside__icon {
  font-size: 23px;
  line-height: 1;
  font-variation-settings:
    'FILL' 0,
    'wght' 320,
    'opsz' 24;
}

.workspace-upload-aside__badge {
  position: absolute;
  top: 3px;
  right: 3px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: #1d4ed8;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  line-height: 1;
}

.workspace-upload-aside__popover {
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  border: 1px solid rgba(214, 222, 236, 0.96);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.98);
  color: #334155;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  padding: 6px 9px;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  box-shadow: 0 12px 24px rgba(31, 45, 70, 0.12);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease,
    visibility 0.16s ease;
  z-index: 40;
}

.workspace-upload-aside__trigger:hover .workspace-upload-aside__popover,
.workspace-upload-aside__trigger:focus-visible .workspace-upload-aside__popover {
  opacity: 1;
  visibility: visible;
}
</style>

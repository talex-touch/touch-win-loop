<script setup lang="ts">
import {
  formatFileSize,
  PROJECT_RESOURCE_STORAGE_LIMIT_BYTES,
  PROJECT_RESOURCE_UPLOAD_ACCEPT_ATTR,
  PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES,
  PROJECT_RESOURCE_UPLOAD_MAX_FILES_PER_BATCH,
  PROJECT_RESOURCE_UPLOAD_SUPPORTED_EXTENSIONS,
  PROJECT_RESOURCE_UPLOAD_TYPES_LABEL,
} from '~~/shared/constants/project-resource-upload'

const props = withDefaults(defineProps<{
  disabled?: boolean
  busy?: boolean
}>(), {
  disabled: false,
  busy: false,
})

const emit = defineEmits<{
  selectFiles: [files: File[]]
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragOver = ref(false)
const maxFileSizeLabel = formatFileSize(PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES)
const projectStorageLimitLabel = formatFileSize(PROJECT_RESOURCE_STORAGE_LIMIT_BYTES)
const uploadRuleDescription = [
  `支持格式：${PROJECT_RESOURCE_UPLOAD_SUPPORTED_EXTENSIONS.map(ext => ext.toUpperCase()).join(' / ')}`,
  `上传限制：单文件 ≤ ${maxFileSizeLabel}；单次最多 ${PROJECT_RESOURCE_UPLOAD_MAX_FILES_PER_BATCH} 个`,
  `项目容量：总量 ≤ ${projectStorageLimitLabel}`,
].join('\n')

function emitFiles(files: File[] | FileList | null | undefined) {
  if (!files || props.disabled)
    return
  const normalizedFiles = Array.from(files).filter(file => file instanceof File)
  if (!normalizedFiles.length)
    return
  emit('selectFiles', normalizedFiles)
}

function triggerFilePicker() {
  if (props.disabled)
    return
  fileInputRef.value?.click()
}

function onFileInputChange(event: Event) {
  const target = event.target as HTMLInputElement
  emitFiles(target.files)
  target.value = ''
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = false
  if (props.disabled)
    return
  emitFiles(event.dataTransfer?.files)
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (props.disabled)
    return
  isDragOver.value = true
}

function onDragLeave() {
  isDragOver.value = false
}

watch(() => props.disabled, (next) => {
  if (next)
    isDragOver.value = false
})
</script>

<template>
  <section class="workspace-upload-hint">
    <input
      ref="fileInputRef"
      type="file"
      multiple
      :accept="PROJECT_RESOURCE_UPLOAD_ACCEPT_ATTR"
      class="workspace-upload-hint__input"
      @change="onFileInputChange"
    >

    <div class="workspace-upload-hint__info" :title="uploadRuleDescription">
      <span class="workspace-upload-hint__info-icon">!</span>
      <div class="workspace-upload-hint__tooltip">
        <p>{{ `支持格式：${PROJECT_RESOURCE_UPLOAD_SUPPORTED_EXTENSIONS.map(ext => ext.toUpperCase()).join(' / ')}` }}</p>
        <p>{{ `上传限制：单文件 ≤ ${maxFileSizeLabel}；单次最多 ${PROJECT_RESOURCE_UPLOAD_MAX_FILES_PER_BATCH} 个` }}</p>
        <p>{{ `项目容量：总量 ≤ ${projectStorageLimitLabel}` }}</p>
      </div>
    </div>

    <button
      class="workspace-upload-hint__drop"
      :class="{
        'workspace-upload-hint__drop--active': isDragOver,
        'workspace-upload-hint__drop--disabled': disabled,
      }"
      type="button"
      :disabled="disabled"
      @click="triggerFilePicker"
      @drop="onDrop"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
    >
      <span class="material-symbols-outlined">upload_file</span>
      <div>
        <p>{{ busy ? '处理中...' : '拖拽文件到这里上传，或点击选择文件（支持多选）' }}</p>
        <small>支持格式：{{ PROJECT_RESOURCE_UPLOAD_TYPES_LABEL }}</small>
        <small>单文件 ≤ {{ maxFileSizeLabel }}，单次最多 {{ PROJECT_RESOURCE_UPLOAD_MAX_FILES_PER_BATCH }} 个</small>
      </div>
    </button>
  </section>
</template>

<style scoped>
.workspace-upload-hint__input {
  display: none;
}

.workspace-upload-hint {
  position: relative;
}

.workspace-upload-hint__info {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
}

.workspace-upload-hint__info-icon {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 1px solid #9cb2dd;
  background: #ffffff;
  color: #4d6590;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  cursor: help;
}

.workspace-upload-hint__tooltip {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  min-width: 280px;
  max-width: 360px;
  border-radius: 8px;
  border: 1px solid #d8dfec;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(34, 55, 92, 0.14);
  padding: 8px 10px;
  color: #4e6081;
  font-size: 11px;
  line-height: 1.45;
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.workspace-upload-hint__tooltip p {
  margin: 0;
}

.workspace-upload-hint__tooltip p + p {
  margin-top: 4px;
}

.workspace-upload-hint__info:hover .workspace-upload-hint__tooltip {
  opacity: 1;
  transform: translateY(0);
}

.workspace-upload-hint__drop {
  width: 100%;
  border: 1px dashed #b8c7e3;
  background: #f7faff;
  border-radius: 10px;
  color: #3f567e;
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease;
}

.workspace-upload-hint__drop .material-symbols-outlined {
  font-size: 22px;
  color: #2f6af2;
}

.workspace-upload-hint__drop p {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
}

.workspace-upload-hint__drop small {
  display: block;
  margin-top: 2px;
  color: #7283a4;
  font-size: 11px;
}

.workspace-upload-hint__drop:hover {
  border-color: #7ca3f8;
  background: #edf4ff;
  box-shadow: inset 0 0 0 1px rgba(47, 106, 242, 0.08);
}

.workspace-upload-hint__drop--active {
  border-color: #2f6af2;
  background: #e6efff;
}

.workspace-upload-hint__drop--disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
</style>

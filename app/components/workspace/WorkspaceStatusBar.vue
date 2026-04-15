<script setup lang="ts">
import type { ProjectUploadActivityItem, ProjectUploadSummary, ProjectUploadTask } from '~/types/project-upload'
import { formatFileSize } from '~~/shared/constants/project-resource-upload'

const props = withDefaults(defineProps<{
  statusLine?: string
  loading?: boolean
  aiModelLabel?: string
  aiStatusLabel?: string
  aiStatusTone?: 'ready' | 'running' | 'missing' | 'checking' | 'error'
  aiCreditsUsed?: number
  aiCreditsTotal?: number
  aiCreditsRemaining?: number
  aiCreditsUsageText?: string
  aiCreditsRemainingText?: string
  aiBillingLabel?: string
  projectStorageUsedBytes?: number
  projectStorageLimitBytes?: number
  line?: number | null
  column?: number | null
  selectionLength?: number
  hasActiveProject?: boolean
  uploadSummary?: ProjectUploadSummary | null
  uploadDrawerOpen?: boolean
  uploadTasks?: ProjectUploadTask[]
  uploadActivityItems?: ProjectUploadActivityItem[]
  uploadHistoryLoaded?: boolean
}>(), {
  statusLine: '',
  loading: false,
  aiModelLabel: '状态检查中',
  aiStatusLabel: 'AI 状态检查中',
  aiStatusTone: 'checking',
  aiCreditsUsed: 0,
  aiCreditsTotal: 0,
  aiCreditsRemaining: 0,
  aiCreditsUsageText: '',
  aiCreditsRemainingText: '',
  aiBillingLabel: '按 credits 配额计费',
  projectStorageUsedBytes: 0,
  projectStorageLimitBytes: 0,
  line: null,
  column: null,
  selectionLength: 0,
  hasActiveProject: false,
  uploadSummary: null,
  uploadDrawerOpen: false,
  uploadTasks: () => [],
  uploadActivityItems: () => [],
  uploadHistoryLoaded: false,
})

const IMPORTANT_STATUS_KEYWORDS = ['失败', '错误', '冲突', '请先', '缺失', '无权', '异常', '告警', '重试', '未清除']
const GB_BYTES = 1024 * 1024 * 1024

const visibleStatusLine = computed(() => {
  const text = String(props.statusLine || '').trim()
  if (!text)
    return ''

  if (IMPORTANT_STATUS_KEYWORDS.some(keyword => text.includes(keyword)))
    return text

  return ''
})

const normalizedStorageUsedBytes = computed(() => {
  const used = Number(props.projectStorageUsedBytes || 0)
  if (!Number.isFinite(used) || used < 0)
    return 0
  return used
})

const normalizedStorageLimitBytes = computed(() => {
  const limit = Number(props.projectStorageLimitBytes || 0)
  if (!Number.isFinite(limit) || limit <= 0)
    return 0
  return limit
})

const storageUsageRatio = computed(() => {
  if (normalizedStorageLimitBytes.value <= 0)
    return 0
  return Math.min(1, normalizedStorageUsedBytes.value / normalizedStorageLimitBytes.value)
})

const storageUsagePercent = computed(() => storageUsageRatio.value * 100)
const storageUsagePercentText = computed(() => `${storageUsagePercent.value.toFixed(2)}%`)

const storageTooltipText = computed(() => {
  const usedGb = normalizedStorageUsedBytes.value / GB_BYTES
  const limitGb = normalizedStorageLimitBytes.value / GB_BYTES
  return `${usedGb.toFixed(2)}GB / ${limitGb.toFixed(2)}GB ${storageUsagePercentText.value}`
})

const storageBarClass = computed(() => {
  if (storageUsagePercent.value >= 90)
    return 'workspace-status-storage--danger'
  if (storageUsagePercent.value >= 75)
    return 'workspace-status-storage--warn'
  return 'workspace-status-storage--safe'
})

const normalizedSelectionLength = computed(() => {
  const value = Number(props.selectionLength || 0)
  if (!Number.isFinite(value) || value <= 0)
    return 0
  return Math.trunc(value)
})

const normalizedCursorLine = computed<number | null>(() => {
  const value = Number(props.line)
  if (!Number.isFinite(value) || value <= 0)
    return null
  return Math.trunc(value)
})

const normalizedCursorColumn = computed<number | null>(() => {
  const value = Number(props.column)
  if (!Number.isFinite(value) || value <= 0)
    return null
  return Math.trunc(value)
})

const aiStatusClass = computed(() => {
  if (props.aiStatusTone === 'running')
    return 'workspace-status-ai workspace-status-ai--running'
  if (props.aiStatusTone === 'missing')
    return 'workspace-status-ai workspace-status-ai--missing'
  if (props.aiStatusTone === 'error')
    return 'workspace-status-ai workspace-status-ai--error'
  if (props.aiStatusTone === 'ready')
    return 'workspace-status-ai workspace-status-ai--ready'
  return 'workspace-status-ai workspace-status-ai--checking'
})

const aiStatusIcon = computed(() => {
  if (props.aiStatusTone === 'running')
    return 'progress_activity'
  if (props.aiStatusTone === 'missing')
    return 'block'
  if (props.aiStatusTone === 'error')
    return 'error'
  if (props.aiStatusTone === 'ready')
    return 'cloud_done'
  return 'hourglass_top'
})

const normalizedAiCreditsUsed = computed(() => {
  const value = Number(props.aiCreditsUsed || 0)
  if (!Number.isFinite(value) || value <= 0)
    return 0
  return Math.trunc(value)
})

const normalizedAiCreditsTotal = computed(() => {
  const value = Number(props.aiCreditsTotal || 0)
  if (!Number.isFinite(value) || value <= 0)
    return 0
  return Math.trunc(value)
})

const normalizedAiCreditsRemaining = computed(() => {
  const value = Number(props.aiCreditsRemaining || 0)
  if (!Number.isFinite(value) || value <= 0)
    return 0
  return Math.trunc(value)
})

const aiCreditsUsageText = computed(() => {
  const provided = String(props.aiCreditsUsageText || '').trim()
  if (provided)
    return provided
  if (normalizedAiCreditsTotal.value <= 0)
    return '未配置'
  return `${normalizedAiCreditsUsed.value.toLocaleString('zh-CN')} / ${normalizedAiCreditsTotal.value.toLocaleString('zh-CN')} credits`
})

const aiCreditsRemainingText = computed(() => {
  const provided = String(props.aiCreditsRemainingText || '').trim()
  if (provided)
    return provided
  if (normalizedAiCreditsTotal.value <= 0)
    return '未配置'
  return `${normalizedAiCreditsRemaining.value.toLocaleString('zh-CN')} credits`
})

const aiBillingTooltipText = computed(() => {
  const text = String(props.aiBillingLabel || '').trim()
  return text || '按 credits 配额计费'
})
</script>

<template>
  <div class="workspace-status-shell">
    <footer class="px-3 border-t border-slate-200 bg-white flex shrink-0 h-6 items-center justify-between">
      <div class="text-[10px] text-slate-500 font-medium flex gap-4 min-w-0 items-center">
        <div class="flex gap-1 items-center">
          <span class="material-symbols-outlined text-[12px] text-blue-600">cloud_done</span>
          <span>已同步至云端</span>
        </div>
        <div class="gap-1 hidden items-center md:flex">
          <span class="material-symbols-outlined text-[12px]">code</span>
          <span>UTF-8</span>
        </div>
        <div class="max-w-72 truncate">
          <span v-if="loading" class="align-middle rounded bg-slate-200 h-2.5 w-28 inline-block animate-pulse" />
          <span v-else>{{ visibleStatusLine || '系统就绪' }}</span>
        </div>
        <div class="workspace-status-storage" :class="storageBarClass">
          <div class="workspace-status-storage__summary">
            <span>项目容量</span>
            <span>{{ formatFileSize(projectStorageUsedBytes) }} / {{ formatFileSize(projectStorageLimitBytes) }}</span>
          </div>
          <div
            class="workspace-status-storage__track"
            role="progressbar"
            :aria-valuemin="0"
            :aria-valuemax="100"
            :aria-valuenow="Number(storageUsagePercent.toFixed(2))"
          >
            <span class="workspace-status-storage__fill" :style="{ width: `${storageUsagePercent.toFixed(2)}%` }" />
          </div>
          <div class="workspace-status-storage__tooltip">
            {{ storageTooltipText }}
          </div>
        </div>
      </div>
      <div class="text-[10px] text-slate-500 font-medium gap-4 hidden items-center md:flex">
        <span v-if="normalizedCursorLine !== null && normalizedCursorColumn !== null">
          行 {{ normalizedCursorLine }}, 列 {{ normalizedCursorColumn }}
          <template v-if="normalizedSelectionLength > 0">
            · 已选 {{ normalizedSelectionLength }} 字
          </template>
        </span>
        <span>Space: 4</span>
        <div
          class="workspace-status-ai-anchor"
          tabindex="0"
          :aria-label="`AI 状态详情：${aiStatusLabel}`"
        >
          <span :class="aiStatusClass">
            <span class="material-symbols-outlined workspace-status-ai__icon">{{ aiStatusIcon }}</span>
            <span>{{ aiStatusLabel }}</span>
          </span>
          <div class="workspace-status-ai__tooltip">
            <div class="workspace-status-ai__tooltip-row">
              <span class="workspace-status-ai__tooltip-label">当前状态</span>
              <span class="workspace-status-ai__tooltip-value">{{ aiStatusLabel }}</span>
            </div>
            <div class="workspace-status-ai__tooltip-row">
              <span class="workspace-status-ai__tooltip-label">使用模型</span>
              <span class="workspace-status-ai__tooltip-value">{{ aiModelLabel }}</span>
            </div>
            <div class="workspace-status-ai__tooltip-row">
              <span class="workspace-status-ai__tooltip-label">计费方式</span>
              <span class="workspace-status-ai__tooltip-value">{{ aiBillingTooltipText }}</span>
            </div>
            <div class="workspace-status-ai__tooltip-row">
              <span class="workspace-status-ai__tooltip-label">已用 / 总量</span>
              <span class="workspace-status-ai__tooltip-value">{{ aiCreditsUsageText }}</span>
            </div>
            <div class="workspace-status-ai__tooltip-row">
              <span class="workspace-status-ai__tooltip-label">剩余 credits</span>
              <span class="workspace-status-ai__tooltip-value">{{ aiCreditsRemainingText }}</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.workspace-status-shell {
  position: relative;
  isolation: isolate;
  z-index: 40;
}

.workspace-status-storage {
  position: relative;
  width: 170px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: default;
}

.workspace-status-storage__summary {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  line-height: 1;
}

.workspace-status-storage__summary span {
  white-space: nowrap;
}

.workspace-status-storage__track {
  height: 4px;
  border-radius: 999px;
  background: #d8e2f4;
  overflow: hidden;
}

.workspace-status-storage__fill {
  display: block;
  height: 100%;
  width: 0%;
  border-radius: 999px;
  transition: width 0.25s ease;
}

.workspace-status-storage--safe .workspace-status-storage__fill {
  background: linear-gradient(90deg, #3f80ff, #53b6ff);
}

.workspace-status-storage--warn .workspace-status-storage__fill {
  background: linear-gradient(90deg, #f6a11a, #ffcc5b);
}

.workspace-status-storage--danger .workspace-status-storage__fill {
  background: linear-gradient(90deg, #ef5a5a, #ff8b8b);
}

.workspace-status-storage__tooltip {
  position: absolute;
  left: 0;
  bottom: calc(100% + 6px);
  border: 1px solid #d5deed;
  border-radius: 6px;
  background: #ffffff;
  padding: 4px 8px;
  color: #4b5f83;
  font-size: var(--wl-text-caption);
  line-height: 1.2;
  white-space: nowrap;
  box-shadow: 0 8px 20px rgba(32, 53, 89, 0.12);
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.workspace-status-storage:hover .workspace-status-storage__tooltip {
  opacity: 1;
  transform: translateY(0);
}

.workspace-status-ai {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
}

.workspace-status-ai-anchor {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: default;
  outline: none;
}

.workspace-status-ai__tooltip {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid #d5deed;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.98);
  padding: 10px 12px;
  color: #4b5f83;
  font-size: var(--wl-text-caption);
  line-height: 1.35;
  white-space: nowrap;
  box-shadow: 0 12px 28px rgba(32, 53, 89, 0.14);
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.workspace-status-ai__tooltip-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.workspace-status-ai__tooltip-label {
  color: #6c7f9f;
}

.workspace-status-ai__tooltip-value {
  color: #22324d;
  font-weight: 600;
  text-align: right;
}

.workspace-status-ai-anchor:hover .workspace-status-ai__tooltip,
.workspace-status-ai-anchor:focus-within .workspace-status-ai__tooltip {
  opacity: 1;
  transform: translateY(0);
}

.workspace-status-ai__icon {
  font-size: 12px;
}

.workspace-status-ai--ready {
  color: #2563eb;
}

.workspace-status-ai--running {
  color: #1d4ed8;
}

.workspace-status-ai--missing,
.workspace-status-ai--error {
  color: #b45309;
}

.workspace-status-ai--checking {
  color: #64748b;
}

.workspace-upload-tray {
  border: 1px solid #d7e2f1;
  border-radius: 999px;
  background: #f8fbff;
  color: #41618f;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 9px;
  cursor: pointer;
}

.workspace-upload-tray:hover {
  background: #eef5ff;
}

.workspace-upload-tray__icon {
  font-size: 13px;
}

.workspace-upload-tray__content {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.workspace-upload-tray__title {
  font-size: var(--wl-text-caption);
  font-weight: 600;
}

.workspace-upload-tray__meta {
  font-size: var(--wl-text-caption);
  color: #70819d;
}

.workspace-upload-drawer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  border-top: 1px solid #dde6f3;
  background: #fcfdff;
  box-shadow: 0 -12px 30px rgba(29, 43, 66, 0.08);
  padding: 12px 16px;
  z-index: 60;
}

.workspace-upload-drawer__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.workspace-upload-drawer__title {
  color: #2f466d;
  font-size: var(--wl-text-body-sm);
  font-weight: 700;
}

.workspace-upload-drawer__subtitle {
  margin-top: 2px;
  color: #8190a7;
  font-size: var(--wl-text-caption);
}

.workspace-upload-drawer__actions {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
}

.workspace-upload-drawer__action {
  height: 28px;
  padding: 0 10px;
  border: 1px solid #d6e1ef;
  border-radius: 8px;
  background: #ffffff;
  color: #45608d;
  font-size: var(--wl-text-caption);
  cursor: pointer;
}

.workspace-upload-drawer__action:hover {
  background: #eef5ff;
}

.workspace-upload-drawer__group {
  margin-top: 12px;
}

.workspace-upload-drawer__group-title {
  margin-bottom: 8px;
  color: #51627e;
  font-size: var(--wl-text-caption);
  font-weight: 700;
}

.workspace-upload-drawer__empty {
  padding: 18px 8px 8px;
  color: #8a97ab;
  font-size: 12px;
  text-align: center;
}

.workspace-upload-task-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid #eef3fa;
}

.workspace-upload-task-row__actor {
  flex-shrink: 0;
}

.workspace-upload-task-row__avatar {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  object-fit: cover;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #e8eefb;
  color: #446087;
  font-size: var(--wl-text-caption);
  font-weight: 700;
}

.workspace-upload-task-row__avatar--fallback {
  border: 1px solid #d3dded;
}

.workspace-upload-task-row__content {
  min-width: 0;
  flex: 1;
}

.workspace-upload-task-row__header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.workspace-upload-task-row__name {
  min-width: 0;
  flex: 1;
  color: #314867;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-upload-task-row__status {
  flex-shrink: 0;
  color: #6f80a0;
  font-size: var(--wl-text-caption);
}

.workspace-upload-task-row__detail {
  margin-top: 2px;
  color: #8a97ab;
  font-size: var(--wl-text-caption);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-upload-task-row__track {
  margin-top: 8px;
  height: 6px;
  border-radius: 999px;
  background: #e3eaf6;
  overflow: hidden;
}

.workspace-upload-task-row__fill {
  display: block;
  height: 100%;
  width: 0%;
  border-radius: 999px;
}

.workspace-upload-task-row__bar--active {
  background: linear-gradient(90deg, #4d86ff, #73b2ff);
}

.workspace-upload-task-row__bar--paused {
  background: linear-gradient(90deg, #d9a53b, #efc965);
}

.workspace-upload-task-row__bar--failed {
  background: linear-gradient(90deg, #ea6767, #f19a9a);
}

.workspace-upload-task-row__bar--completed {
  background: linear-gradient(90deg, #30a87f, #61d2ad);
}

.workspace-upload-task-row__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.workspace-upload-task-row__action {
  height: 28px;
  padding: 0 10px;
  border: 1px solid #d6e1ef;
  border-radius: 8px;
  background: #ffffff;
  color: #45608d;
  font-size: var(--wl-text-caption);
  cursor: pointer;
}

.workspace-upload-task-row__action:hover {
  background: #eef5ff;
}

.workspace-upload-task-row__action--danger {
  color: #c04a4a;
  border-color: #efcaca;
}

.workspace-upload-task-row__action--danger:hover {
  background: #fff4f4;
}

.workspace-upload-drawer-enter-active,
.workspace-upload-drawer-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.workspace-upload-drawer-enter-from,
.workspace-upload-drawer-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>

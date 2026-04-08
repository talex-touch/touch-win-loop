<script setup lang="ts">
import type { ProjectUploadSummary, ProjectUploadTask } from '~/types/project-upload'
import { formatFileSize } from '~~/shared/constants/project-resource-upload'
import {
  isProjectUploadTaskPending,
  resolveProjectUploadTaskStatusText,
} from '~/utils/project-upload'

const props = withDefaults(defineProps<{
  statusLine?: string
  loading?: boolean
  aiReady?: boolean
  aiModelLabel?: string
  tokenBalance?: number
  projectStorageUsedBytes?: number
  projectStorageLimitBytes?: number
  line?: number
  column?: number
  uploadSummary?: ProjectUploadSummary | null
  uploadDrawerOpen?: boolean
  uploadTasks?: ProjectUploadTask[]
}>(), {
  statusLine: '',
  loading: false,
  aiReady: true,
  aiModelLabel: '由后端配置',
  tokenBalance: 0,
  projectStorageUsedBytes: 0,
  projectStorageLimitBytes: 0,
  line: 12,
  column: 45,
  uploadSummary: null,
  uploadDrawerOpen: false,
  uploadTasks: () => [],
})

const emit = defineEmits<{
  toggleUploadDrawer: []
  pauseUploadTask: [sessionId: string]
  resumeUploadTask: [sessionId: string]
  retryUploadTask: [sessionId: string]
  cancelUploadTask: [sessionId: string]
  rebindUploadTask: [sessionId: string]
  pauseAllUploadTasks: []
  resumeAllUploadTasks: []
  clearCompletedUploadTasks: []
}>()

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

const normalizedUploadSummary = computed<ProjectUploadSummary | null>(() => {
  if (!props.uploadSummary || props.uploadSummary.totalCount <= 0)
    return null
  return props.uploadSummary
})

const visibleUploadTasks = computed(() => {
  return props.uploadTasks.filter(task => task.status !== 'canceled')
})

const inProgressUploadTasks = computed(() => {
  return visibleUploadTasks.value.filter(task => isProjectUploadTaskPending(task) && !task.needsFileRebind)
})

const pausableUploadTasks = computed(() => {
  return visibleUploadTasks.value.filter(task => task.status === 'uploading' && !task.needsFileRebind)
})

const waitingUploadTasks = computed(() => {
  return visibleUploadTasks.value.filter((task) => {
    return task.needsFileRebind || task.status === 'paused' || task.status === 'failed'
  })
})

const resumableUploadTasks = computed(() => {
  return visibleUploadTasks.value.filter((task) => {
    return (task.status === 'paused' || task.status === 'failed') && !task.needsFileRebind
  })
})

const completedUploadTasks = computed(() => {
  return visibleUploadTasks.value.filter(task => task.status === 'completed')
})

const uploadTrayText = computed(() => {
  const summary = normalizedUploadSummary.value
  if (!summary)
    return ''
  return `上传 ${summary.totalCount} 项 · ${summary.progressPercent.toFixed(0)}%`
})

const uploadTrayMetaText = computed(() => {
  const summary = normalizedUploadSummary.value
  if (!summary)
    return ''

  const fragments: string[] = []
  if (summary.failedCount > 0)
    fragments.push(`失败 ${summary.failedCount}`)
  if (summary.pausedCount > 0)
    fragments.push(`暂停 ${summary.pausedCount}`)
  if (summary.completedCount > 0)
    fragments.push(`完成 ${summary.completedCount}`)
  return fragments.join(' · ')
})

function uploadTaskStatusText(task: ProjectUploadTask): string {
  return resolveProjectUploadTaskStatusText(task.status, task.needsFileRebind)
}

function uploadTaskDetailText(task: ProjectUploadTask): string {
  const progressText = `${formatFileSize(task.uploadedBytes)} / ${formatFileSize(task.fileSize)}`
  const chunkText = `${Math.min(task.uploadedChunkCount, task.chunkCount)} / ${task.chunkCount} 分片`
  if (task.needsFileRebind)
    return `${progressText} · ${chunkText} · 需重新选择原文件`
  if (task.status === 'finalizing')
    return `${progressText} · 正在创建资源与预览`
  if (task.errorMessage)
    return `${progressText} · ${chunkText} · ${task.errorMessage}`
  return `${progressText} · ${chunkText}`
}

function uploadTaskProgressStyle(task: ProjectUploadTask): Record<string, string> {
  const progress = task.status === 'finalizing'
    ? 100
    : Math.max(0, Math.min(100, Number(task.progressPercent || 0)))
  return {
    width: `${progress}%`,
  }
}

function uploadTaskBarClass(task: ProjectUploadTask): string {
  if (task.needsFileRebind || task.status === 'failed')
    return 'workspace-upload-task-row__bar--failed'
  if (task.status === 'paused')
    return 'workspace-upload-task-row__bar--paused'
  if (task.status === 'completed')
    return 'workspace-upload-task-row__bar--completed'
  return 'workspace-upload-task-row__bar--active'
}

function canPauseUploadTask(task: ProjectUploadTask): boolean {
  return task.status === 'uploading' && !task.needsFileRebind
}

function canResumeUploadTask(task: ProjectUploadTask): boolean {
  return task.status === 'paused' && !task.needsFileRebind
}

function canRetryUploadTask(task: ProjectUploadTask): boolean {
  return task.status === 'failed' && !task.needsFileRebind
}

function canCancelUploadTask(task: ProjectUploadTask): boolean {
  return task.status !== 'finalizing'
}

function canRebindUploadTask(task: ProjectUploadTask): boolean {
  return task.needsFileRebind || task.status === 'failed'
}
</script>

<template>
  <div class="workspace-status-shell">
    <transition name="workspace-upload-drawer">
      <section
        v-if="uploadDrawerOpen && normalizedUploadSummary"
        class="workspace-upload-drawer"
      >
        <div class="workspace-upload-drawer__header">
          <div>
            <div class="workspace-upload-drawer__title">
              上传管理
            </div>
            <div class="workspace-upload-drawer__subtitle">
              {{ uploadTrayText }}
              <template v-if="uploadTrayMetaText">
                · {{ uploadTrayMetaText }}
              </template>
            </div>
          </div>
          <div class="workspace-upload-drawer__actions">
            <button
              v-if="pausableUploadTasks.length > 0"
              class="workspace-upload-drawer__action"
              type="button"
              @click="emit('pauseAllUploadTasks')"
            >
              全部暂停
            </button>
            <button
              v-if="resumableUploadTasks.length > 0"
              class="workspace-upload-drawer__action"
              type="button"
              @click="emit('resumeAllUploadTasks')"
            >
              继续全部
            </button>
            <button
              v-if="completedUploadTasks.length > 0"
              class="workspace-upload-drawer__action"
              type="button"
              @click="emit('clearCompletedUploadTasks')"
            >
              清空已完成
            </button>
            <button
              class="workspace-upload-drawer__action"
              type="button"
              @click="emit('toggleUploadDrawer')"
            >
              收起
            </button>
          </div>
        </div>

        <div v-if="inProgressUploadTasks.length > 0" class="workspace-upload-drawer__group">
          <div class="workspace-upload-drawer__group-title">
            进行中
          </div>
          <div
            v-for="task in inProgressUploadTasks"
            :key="`active-${task.sessionId}`"
            class="workspace-upload-task-row"
          >
            <div class="workspace-upload-task-row__content">
              <div class="workspace-upload-task-row__header">
                <span class="workspace-upload-task-row__name">{{ task.fileName }}</span>
                <span class="workspace-upload-task-row__status">{{ uploadTaskStatusText(task) }}</span>
              </div>
              <div class="workspace-upload-task-row__detail">
                {{ uploadTaskDetailText(task) }}
              </div>
              <div class="workspace-upload-task-row__track">
                <span class="workspace-upload-task-row__fill" :class="uploadTaskBarClass(task)" :style="uploadTaskProgressStyle(task)" />
              </div>
            </div>
            <div class="workspace-upload-task-row__actions">
              <button
                v-if="canPauseUploadTask(task)"
                class="workspace-upload-task-row__action"
                type="button"
                @click="emit('pauseUploadTask', task.sessionId)"
              >
                暂停
              </button>
              <button
                v-if="canCancelUploadTask(task)"
                class="workspace-upload-task-row__action workspace-upload-task-row__action--danger"
                type="button"
                @click="emit('cancelUploadTask', task.sessionId)"
              >
                取消
              </button>
            </div>
          </div>
        </div>

        <div v-if="waitingUploadTasks.length > 0" class="workspace-upload-drawer__group">
          <div class="workspace-upload-drawer__group-title">
            失败 / 待处理
          </div>
          <div
            v-for="task in waitingUploadTasks"
            :key="`pending-${task.sessionId}`"
            class="workspace-upload-task-row"
          >
            <div class="workspace-upload-task-row__content">
              <div class="workspace-upload-task-row__header">
                <span class="workspace-upload-task-row__name">{{ task.fileName }}</span>
                <span class="workspace-upload-task-row__status">{{ uploadTaskStatusText(task) }}</span>
              </div>
              <div class="workspace-upload-task-row__detail">
                {{ uploadTaskDetailText(task) }}
              </div>
              <div class="workspace-upload-task-row__track">
                <span class="workspace-upload-task-row__fill" :class="uploadTaskBarClass(task)" :style="uploadTaskProgressStyle(task)" />
              </div>
            </div>
            <div class="workspace-upload-task-row__actions">
              <button
                v-if="canResumeUploadTask(task)"
                class="workspace-upload-task-row__action"
                type="button"
                @click="emit('resumeUploadTask', task.sessionId)"
              >
                继续
              </button>
              <button
                v-if="canRetryUploadTask(task)"
                class="workspace-upload-task-row__action"
                type="button"
                @click="emit('retryUploadTask', task.sessionId)"
              >
                重试
              </button>
              <button
                v-if="canRebindUploadTask(task)"
                class="workspace-upload-task-row__action"
                type="button"
                @click="emit('rebindUploadTask', task.sessionId)"
              >
                绑定文件
              </button>
              <button
                v-if="canCancelUploadTask(task)"
                class="workspace-upload-task-row__action workspace-upload-task-row__action--danger"
                type="button"
                @click="emit('cancelUploadTask', task.sessionId)"
              >
                取消
              </button>
            </div>
          </div>
        </div>

        <div v-if="completedUploadTasks.length > 0" class="workspace-upload-drawer__group">
          <div class="workspace-upload-drawer__group-title">
            已完成
          </div>
          <div
            v-for="task in completedUploadTasks"
            :key="`done-${task.sessionId}`"
            class="workspace-upload-task-row"
          >
            <div class="workspace-upload-task-row__content">
              <div class="workspace-upload-task-row__header">
                <span class="workspace-upload-task-row__name">{{ task.fileName }}</span>
                <span class="workspace-upload-task-row__status">{{ uploadTaskStatusText(task) }}</span>
              </div>
              <div class="workspace-upload-task-row__detail">
                {{ uploadTaskDetailText(task) }}
              </div>
              <div class="workspace-upload-task-row__track">
                <span class="workspace-upload-task-row__fill" :class="uploadTaskBarClass(task)" :style="uploadTaskProgressStyle(task)" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </transition>

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
        <div class="flex gap-1 items-center">
          <span class="rounded-full bg-green-500 h-1.5 w-1.5" />
          <span>AI运行状态</span>
        </div>
        <div class="gap-2 hidden items-center md:flex">
          <span>模型: {{ aiModelLabel }}</span>
          <span>Token: {{ tokenBalance.toLocaleString('zh-CN') }}</span>
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
        <button
          v-if="normalizedUploadSummary"
          class="workspace-upload-tray"
          type="button"
          :aria-expanded="uploadDrawerOpen"
          @click="emit('toggleUploadDrawer')"
        >
          <span class="material-symbols-outlined workspace-upload-tray__icon">upload_file</span>
          <span class="workspace-upload-tray__content">
            <span class="workspace-upload-tray__title">{{ uploadTrayText }}</span>
            <span v-if="uploadTrayMetaText" class="workspace-upload-tray__meta">{{ uploadTrayMetaText }}</span>
          </span>
        </button>
      </div>
      <div class="text-[10px] text-slate-500 font-medium gap-4 hidden items-center md:flex">
        <span>行 {{ line }}, 列 {{ column }}</span>
        <span>Space: 4</span>
        <span class="font-bold" :class="aiReady ? 'text-blue-600' : 'text-amber-600'">
          {{ aiReady ? 'Analysis Ready' : 'AI Working' }}
        </span>
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
  font-size: 10px;
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

.workspace-upload-tray {
  border: 1px solid #d6e1ef;
  border-radius: 8px;
  background: #f8fbff;
  color: #41618f;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 0 10px;
  cursor: pointer;
}

.workspace-upload-tray:hover {
  background: #eef5ff;
}

.workspace-upload-tray__icon {
  font-size: 15px;
}

.workspace-upload-tray__content {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.workspace-upload-tray__title {
  font-size: 11px;
  font-weight: 600;
}

.workspace-upload-tray__meta {
  font-size: 10px;
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
  font-size: 13px;
  font-weight: 700;
}

.workspace-upload-drawer__subtitle {
  margin-top: 2px;
  color: #8190a7;
  font-size: 11px;
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
  font-size: 11px;
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
  font-size: 11px;
  font-weight: 700;
}

.workspace-upload-task-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid #eef3fa;
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
  font-size: 11px;
}

.workspace-upload-task-row__detail {
  margin-top: 2px;
  color: #8a97ab;
  font-size: 10px;
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
  font-size: 11px;
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

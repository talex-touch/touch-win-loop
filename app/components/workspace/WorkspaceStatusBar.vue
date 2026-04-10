<script setup lang="ts">
import type { ProjectUploadActivityItem, ProjectUploadSummary, ProjectUploadTask } from '~/types/project-upload'
import { formatFileSize } from '~~/shared/constants/project-resource-upload'
import { resolveProjectUploadTaskStatusText } from '~/utils/project-upload'

const props = withDefaults(defineProps<{
  statusLine?: string
  loading?: boolean
  aiReady?: boolean
  aiModelLabel?: string
  tokenBalance?: number
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
  aiReady: true,
  aiModelLabel: '由后端配置',
  tokenBalance: 0,
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

function isInProgressStatus(status: ProjectUploadActivityItem['status']): boolean {
  return status === 'queued' || status === 'uploading' || status === 'finalizing'
}

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

const uploadActivityItems = computed(() => {
  return props.uploadActivityItems.filter(item => item.status !== 'canceled')
})

const myUploadItems = computed(() => {
  return uploadActivityItems.value.filter((item) => {
    return item.isOwnedByCurrentUser
      && item.status !== 'completed'
      && item.status !== 'canceled'
  })
})

const teamUploadingItems = computed(() => {
  return uploadActivityItems.value.filter((item) => {
    return !item.isOwnedByCurrentUser && isInProgressStatus(item.status)
  })
})

const pendingUploadItems = computed(() => {
  return uploadActivityItems.value.filter((item) => {
    return !item.isOwnedByCurrentUser
      && (item.status === 'paused' || item.status === 'failed')
  })
})

const recentCompletedItems = computed(() => {
  return uploadActivityItems.value.filter(item => item.status === 'completed')
})

const pausableUploadItems = computed(() => {
  return myUploadItems.value.filter(item => item.isActionable && item.status === 'uploading' && !item.needsFileRebind)
})

const resumableUploadItems = computed(() => {
  return myUploadItems.value.filter((item) => {
    return item.isActionable
      && (item.status === 'paused' || item.status === 'failed')
      && !item.needsFileRebind
  })
})

const clearableCompletedCount = computed(() => {
  return normalizedUploadSummary.value?.completedCount || 0
})

const uploadTrayText = computed(() => {
  const summary = normalizedUploadSummary.value
  if (summary)
    return `上传 ${summary.totalCount} 项 · ${summary.progressPercent.toFixed(0)}%`
  if (uploadActivityItems.value.length > 0)
    return `上传记录 · 最近7天 ${uploadActivityItems.value.length} 项`
  return '上传记录'
})

const uploadTrayMetaText = computed(() => {
  const summary = normalizedUploadSummary.value
  if (summary) {
    const fragments: string[] = []
    if (summary.failedCount > 0)
      fragments.push(`失败 ${summary.failedCount}`)
    if (summary.pausedCount > 0)
      fragments.push(`暂停 ${summary.pausedCount}`)
    if (summary.completedCount > 0)
      fragments.push(`完成 ${summary.completedCount}`)
    return fragments.join(' · ')
  }

  if (teamUploadingItems.value.length > 0)
    return `团队上传中 ${teamUploadingItems.value.length}`
  if (recentCompletedItems.value.length > 0)
    return `最近完成 ${recentCompletedItems.value.length}`
  return ''
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

const hasUploadDrawerContent = computed(() => uploadActivityItems.value.length > 0)

function uploadTaskStatusText(item: ProjectUploadActivityItem): string {
  return resolveProjectUploadTaskStatusText(item.status, item.needsFileRebind)
}

function uploadTaskActorText(item: ProjectUploadActivityItem): string {
  const actorName = String(item.actorUsername || '').trim()
  if (actorName)
    return actorName
  return item.isOwnedByCurrentUser ? '我' : '未识别成员'
}

function uploadTaskActorInitial(item: ProjectUploadActivityItem): string {
  const actorText = uploadTaskActorText(item)
  return actorText.slice(0, 1).toUpperCase() || 'U'
}

function formatRelativeDateTime(value: string): string {
  const normalized = String(value || '').trim()
  if (!normalized)
    return '刚刚'

  const time = new Date(normalized).getTime()
  if (!Number.isFinite(time))
    return normalized

  const diffMs = Date.now() - time
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000))
  if (diffMinutes < 1)
    return '刚刚'
  if (diffMinutes < 60)
    return `${diffMinutes} 分钟前`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24)
    return `${diffHours} 小时前`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7)
    return `${diffDays} 天前`

  return new Date(time).toLocaleString('zh-CN', { hour12: false })
}

function uploadTaskDetailText(item: ProjectUploadActivityItem): string {
  const progressText = `${formatFileSize(item.uploadedBytes)} / ${formatFileSize(item.fileSize)}`
  const chunkText = `${Math.min(item.uploadedChunkCount, item.chunkCount)} / ${item.chunkCount} 分片`
  const updatedText = formatRelativeDateTime(item.completedAt || item.updatedAt)
  if (item.needsFileRebind)
    return `${uploadTaskActorText(item)} · ${progressText} · ${chunkText} · 需重新选择原文件 · ${updatedText}`
  if (item.status === 'finalizing')
    return `${uploadTaskActorText(item)} · ${progressText} · 正在创建资源与预览 · ${updatedText}`
  if (item.errorMessage)
    return `${uploadTaskActorText(item)} · ${progressText} · ${chunkText} · ${item.errorMessage} · ${updatedText}`
  return `${uploadTaskActorText(item)} · ${progressText} · ${chunkText} · ${updatedText}`
}

function uploadTaskProgressStyle(item: ProjectUploadActivityItem): Record<string, string> {
  const progress = item.status === 'finalizing'
    ? 100
    : Math.max(0, Math.min(100, Number(item.progressPercent || 0)))
  return {
    width: `${progress}%`,
  }
}

function uploadTaskBarClass(item: ProjectUploadActivityItem): string {
  if (item.needsFileRebind || item.status === 'failed')
    return 'workspace-upload-task-row__bar--failed'
  if (item.status === 'paused')
    return 'workspace-upload-task-row__bar--paused'
  if (item.status === 'completed')
    return 'workspace-upload-task-row__bar--completed'
  return 'workspace-upload-task-row__bar--active'
}

function canPauseUploadTask(item: ProjectUploadActivityItem): boolean {
  return item.isActionable && item.status === 'uploading' && !item.needsFileRebind
}

function canResumeUploadTask(item: ProjectUploadActivityItem): boolean {
  return item.isActionable && item.status === 'paused' && !item.needsFileRebind
}

function canRetryUploadTask(item: ProjectUploadActivityItem): boolean {
  return item.isActionable && item.status === 'failed' && !item.needsFileRebind
}

function canCancelUploadTask(item: ProjectUploadActivityItem): boolean {
  return item.isActionable && item.status !== 'finalizing'
}

function canRebindUploadTask(item: ProjectUploadActivityItem): boolean {
  return item.isActionable && (item.needsFileRebind || item.status === 'failed')
}
</script>

<template>
  <div class="workspace-status-shell">
    <transition name="workspace-upload-drawer">
      <section
        v-if="uploadDrawerOpen && hasActiveProject"
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
              v-if="pausableUploadItems.length > 0"
              class="workspace-upload-drawer__action"
              type="button"
              @click="emit('pauseAllUploadTasks')"
            >
              全部暂停
            </button>
            <button
              v-if="resumableUploadItems.length > 0"
              class="workspace-upload-drawer__action"
              type="button"
              @click="emit('resumeAllUploadTasks')"
            >
              继续全部
            </button>
            <button
              v-if="clearableCompletedCount > 0"
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

        <div v-if="myUploadItems.length > 0" class="workspace-upload-drawer__group">
          <div class="workspace-upload-drawer__group-title">
            我的上传
          </div>
          <div
            v-for="item in myUploadItems"
            :key="`mine-${item.sessionId}`"
            class="workspace-upload-task-row"
          >
            <div class="workspace-upload-task-row__actor">
              <img
                v-if="item.actorAvatarUrl"
                class="workspace-upload-task-row__avatar"
                :src="item.actorAvatarUrl"
                :alt="uploadTaskActorText(item)"
              >
              <span v-else class="workspace-upload-task-row__avatar workspace-upload-task-row__avatar--fallback">
                {{ uploadTaskActorInitial(item) }}
              </span>
            </div>
            <div class="workspace-upload-task-row__content">
              <div class="workspace-upload-task-row__header">
                <span class="workspace-upload-task-row__name">{{ item.fileName }}</span>
                <span class="workspace-upload-task-row__status">{{ uploadTaskStatusText(item) }}</span>
              </div>
              <div class="workspace-upload-task-row__detail">
                {{ uploadTaskDetailText(item) }}
              </div>
              <div class="workspace-upload-task-row__track">
                <span class="workspace-upload-task-row__fill" :class="uploadTaskBarClass(item)" :style="uploadTaskProgressStyle(item)" />
              </div>
            </div>
            <div class="workspace-upload-task-row__actions">
              <button
                v-if="canPauseUploadTask(item)"
                class="workspace-upload-task-row__action"
                type="button"
                @click="emit('pauseUploadTask', item.sessionId)"
              >
                暂停
              </button>
              <button
                v-if="canResumeUploadTask(item)"
                class="workspace-upload-task-row__action"
                type="button"
                @click="emit('resumeUploadTask', item.sessionId)"
              >
                继续
              </button>
              <button
                v-if="canRetryUploadTask(item)"
                class="workspace-upload-task-row__action"
                type="button"
                @click="emit('retryUploadTask', item.sessionId)"
              >
                重试
              </button>
              <button
                v-if="canRebindUploadTask(item)"
                class="workspace-upload-task-row__action"
                type="button"
                @click="emit('rebindUploadTask', item.sessionId)"
              >
                绑定文件
              </button>
              <button
                v-if="canCancelUploadTask(item)"
                class="workspace-upload-task-row__action workspace-upload-task-row__action--danger"
                type="button"
                @click="emit('cancelUploadTask', item.sessionId)"
              >
                取消
              </button>
            </div>
          </div>
        </div>

        <div v-if="teamUploadingItems.length > 0" class="workspace-upload-drawer__group">
          <div class="workspace-upload-drawer__group-title">
            团队上传中
          </div>
          <div
            v-for="item in teamUploadingItems"
            :key="`team-active-${item.sessionId}`"
            class="workspace-upload-task-row"
          >
            <div class="workspace-upload-task-row__actor">
              <img
                v-if="item.actorAvatarUrl"
                class="workspace-upload-task-row__avatar"
                :src="item.actorAvatarUrl"
                :alt="uploadTaskActorText(item)"
              >
              <span v-else class="workspace-upload-task-row__avatar workspace-upload-task-row__avatar--fallback">
                {{ uploadTaskActorInitial(item) }}
              </span>
            </div>
            <div class="workspace-upload-task-row__content">
              <div class="workspace-upload-task-row__header">
                <span class="workspace-upload-task-row__name">{{ item.fileName }}</span>
                <span class="workspace-upload-task-row__status">{{ uploadTaskStatusText(item) }}</span>
              </div>
              <div class="workspace-upload-task-row__detail">
                {{ uploadTaskDetailText(item) }}
              </div>
              <div class="workspace-upload-task-row__track">
                <span class="workspace-upload-task-row__fill" :class="uploadTaskBarClass(item)" :style="uploadTaskProgressStyle(item)" />
              </div>
            </div>
          </div>
        </div>

        <div v-if="recentCompletedItems.length > 0" class="workspace-upload-drawer__group">
          <div class="workspace-upload-drawer__group-title">
            最近完成
          </div>
          <div
            v-for="item in recentCompletedItems"
            :key="`done-${item.sessionId}`"
            class="workspace-upload-task-row"
          >
            <div class="workspace-upload-task-row__actor">
              <img
                v-if="item.actorAvatarUrl"
                class="workspace-upload-task-row__avatar"
                :src="item.actorAvatarUrl"
                :alt="uploadTaskActorText(item)"
              >
              <span v-else class="workspace-upload-task-row__avatar workspace-upload-task-row__avatar--fallback">
                {{ uploadTaskActorInitial(item) }}
              </span>
            </div>
            <div class="workspace-upload-task-row__content">
              <div class="workspace-upload-task-row__header">
                <span class="workspace-upload-task-row__name">{{ item.fileName }}</span>
                <span class="workspace-upload-task-row__status">{{ uploadTaskStatusText(item) }}</span>
              </div>
              <div class="workspace-upload-task-row__detail">
                {{ uploadTaskDetailText(item) }}
              </div>
              <div class="workspace-upload-task-row__track">
                <span class="workspace-upload-task-row__fill" :class="uploadTaskBarClass(item)" :style="uploadTaskProgressStyle(item)" />
              </div>
            </div>
          </div>
        </div>

        <div v-if="pendingUploadItems.length > 0" class="workspace-upload-drawer__group">
          <div class="workspace-upload-drawer__group-title">
            失败 / 待处理
          </div>
          <div
            v-for="item in pendingUploadItems"
            :key="`pending-${item.sessionId}`"
            class="workspace-upload-task-row"
          >
            <div class="workspace-upload-task-row__actor">
              <img
                v-if="item.actorAvatarUrl"
                class="workspace-upload-task-row__avatar"
                :src="item.actorAvatarUrl"
                :alt="uploadTaskActorText(item)"
              >
              <span v-else class="workspace-upload-task-row__avatar workspace-upload-task-row__avatar--fallback">
                {{ uploadTaskActorInitial(item) }}
              </span>
            </div>
            <div class="workspace-upload-task-row__content">
              <div class="workspace-upload-task-row__header">
                <span class="workspace-upload-task-row__name">{{ item.fileName }}</span>
                <span class="workspace-upload-task-row__status">{{ uploadTaskStatusText(item) }}</span>
              </div>
              <div class="workspace-upload-task-row__detail">
                {{ uploadTaskDetailText(item) }}
              </div>
              <div class="workspace-upload-task-row__track">
                <span class="workspace-upload-task-row__fill" :class="uploadTaskBarClass(item)" :style="uploadTaskProgressStyle(item)" />
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="!hasUploadDrawerContent"
          class="workspace-upload-drawer__empty"
        >
          <span v-if="!uploadHistoryLoaded">正在加载上传记录...</span>
          <span v-else>最近 7 天暂无上传记录</span>
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
          v-if="hasActiveProject"
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
        <span v-if="normalizedCursorLine !== null && normalizedCursorColumn !== null">
          行 {{ normalizedCursorLine }}, 列 {{ normalizedCursorColumn }}
          <template v-if="normalizedSelectionLength > 0">
            · 已选 {{ normalizedSelectionLength }} 字
          </template>
        </span>
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

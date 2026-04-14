<script setup lang="ts">
import type { ProjectUploadActivityItem, ProjectUploadSummary } from '~/types/project-upload'
import { formatFileSize } from '~~/shared/constants/project-resource-upload'
import { resolveProjectUploadTaskStatusText } from '~/utils/project-upload'

const props = withDefaults(defineProps<{
  hasActiveProject?: boolean
  uploadSummary?: ProjectUploadSummary | null
  uploadDrawerOpen?: boolean
  uploadActivityItems?: ProjectUploadActivityItem[]
  uploadHistoryLoaded?: boolean
}>(), {
  hasActiveProject: false,
  uploadSummary: null,
  uploadDrawerOpen: false,
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

function isInProgressStatus(status: ProjectUploadActivityItem['status']): boolean {
  return status === 'queued' || status === 'uploading' || status === 'finalizing'
}

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

const triggerBadgeText = computed(() => {
  const summary = normalizedUploadSummary.value
  if (!summary)
    return ''
  return summary.totalCount > 99 ? '99+' : String(summary.totalCount)
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
  <div v-if="props.hasActiveProject" class="workspace-upload-aside">
    <button
      data-testid="workspace-left-rail-upload-button"
      class="workspace-upload-aside__trigger"
      :class="{ 'workspace-upload-aside__trigger--active': props.uploadDrawerOpen }"
      type="button"
      :aria-expanded="props.uploadDrawerOpen ? 'true' : 'false'"
      aria-label="打开上传管理"
      @click="emit('toggleUploadDrawer')"
    >
      <span class="material-symbols-outlined workspace-upload-aside__icon">upload_file</span>
      <span v-if="triggerBadgeText" class="workspace-upload-aside__badge">{{ triggerBadgeText }}</span>
      <span class="workspace-upload-aside__popover" aria-hidden="true">上传管理</span>
    </button>

    <transition name="workspace-upload-aside-panel">
      <aside
        v-if="props.uploadDrawerOpen"
        data-testid="workspace-left-upload-drawer"
        class="workspace-upload-drawer workspace-upload-drawer--aside"
        aria-label="上传管理"
      >
        <div class="workspace-upload-drawer__header">
          <div>
            <div class="workspace-upload-drawer__title">
              上传管理
            </div>
            <div class="workspace-upload-drawer__subtitle">
              <span class="workspace-upload-tray__title">{{ uploadTrayText }}</span>
              <template v-if="uploadTrayMetaText">
                · <span class="workspace-upload-tray__meta">{{ uploadTrayMetaText }}</span>
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

        <div class="workspace-upload-drawer__body">
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
            <span v-if="!props.uploadHistoryLoaded">正在加载上传记录...</span>
            <span v-else>最近 7 天暂无上传记录</span>
          </div>
        </div>
      </aside>
    </transition>
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

.workspace-upload-drawer {
  padding: 12px 16px;
  background: linear-gradient(180deg, #fcfdff 0%, #f7fbff 100%);
  z-index: 60;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.workspace-upload-drawer--aside {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 100%;
  width: min(var(--workspace-left-panel-width, 304px), calc(100vw - 108px));
  border: 1px solid #dde6f3;
  border-left-color: #e7edf7;
  border-radius: 0 20px 20px 0;
  box-shadow: 18px 0 38px rgba(29, 43, 66, 0.12);
  overflow: hidden;
}

.workspace-upload-drawer__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  margin-top: 12px;
  padding-right: 2px;
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
  justify-content: flex-end;
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

.workspace-upload-aside-panel-enter-active,
.workspace-upload-aside-panel-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.workspace-upload-aside-panel-enter-from,
.workspace-upload-aside-panel-leave-to {
  opacity: 0;
  transform: translateX(-18px);
}
</style>

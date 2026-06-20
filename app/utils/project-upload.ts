import type { ProjectUploadTask, ProjectUploadTaskStatus } from '~/types/project-upload'

function normalizeUploadStatus(status: ProjectUploadTaskStatus | string): ProjectUploadTaskStatus {
  const normalized = String(status || '').trim() as ProjectUploadTaskStatus
  if (
    normalized === 'queued'
    || normalized === 'uploading'
    || normalized === 'paused'
    || normalized === 'finalizing'
    || normalized === 'completed'
    || normalized === 'failed'
    || normalized === 'canceled'
  ) {
    return normalized
  }
  return 'queued'
}

export function resolveProjectUploadTaskStatusText(
  status: ProjectUploadTaskStatus | string,
  needsFileRebind = false,
): string {
  if (needsFileRebind)
    return '需重新绑定原文件'

  switch (normalizeUploadStatus(status)) {
    case 'queued':
      return '排队中'
    case 'uploading':
      return '上传中'
    case 'paused':
      return '已暂停'
    case 'finalizing':
      return '正在整理'
    case 'completed':
      return '已完成'
    case 'failed':
      return '上传失败'
    case 'canceled':
      return '已取消'
    default:
      return '排队中'
  }
}

export function resolveProjectUploadTaskTone(
  status: ProjectUploadTaskStatus | string,
  needsFileRebind = false,
): 'active' | 'paused' | 'failed' | 'finalizing' | 'completed' {
  if (needsFileRebind)
    return 'failed'

  switch (normalizeUploadStatus(status)) {
    case 'paused':
      return 'paused'
    case 'failed':
      return 'failed'
    case 'finalizing':
      return 'finalizing'
    case 'completed':
      return 'completed'
    default:
      return 'active'
  }
}

export function isProjectUploadTaskSidebarVisible(task: Pick<ProjectUploadTask, 'status'>): boolean {
  return task.status !== 'completed' && task.status !== 'canceled'
}

export function isProjectUploadTaskPending(task: Pick<ProjectUploadTask, 'status'>): boolean {
  return task.status === 'queued' || task.status === 'uploading' || task.status === 'finalizing'
}

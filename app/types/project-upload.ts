import type {
  ProjectResourceUploadSession,
  ProjectResourceUploadSessionStatus,
  ResourcePreviewStatus,
} from '~~/shared/types/domain'

export type ProjectUploadTaskStatus = ProjectResourceUploadSessionStatus

export interface ProjectUploadTask {
  localTaskId: string
  sessionId: string
  projectId: string
  fileName: string
  fileSize: number
  mimeType: string
  lastModified: number
  chunkSize: number
  status: ProjectUploadTaskStatus
  progressPercent: number
  uploadedBytes: number
  uploadedChunkCount: number
  chunkCount: number
  errorMessage: string
  previewStatus?: ResourcePreviewStatus
  resourceId?: string
  needsFileRebind: boolean
  sourceFile?: File
  createdAt: string
  updatedAt: string
}

export interface ProjectUploadSummary {
  totalCount: number
  activeCount: number
  pausedCount: number
  failedCount: number
  completedCount: number
  progressPercent: number
  uploadedBytes: number
  totalBytes: number
}

export interface ProjectUploadActivityItem {
  sessionId: string
  projectId: string
  localTaskId?: string
  fileName: string
  fileSize: number
  mimeType: string
  status: ProjectUploadTaskStatus
  progressPercent: number
  uploadedBytes: number
  uploadedChunkCount: number
  chunkCount: number
  errorMessage: string
  actorUserId?: string | null
  actorUsername?: string
  actorAvatarUrl?: string | null
  isOwnedByCurrentUser: boolean
  isActionable: boolean
  needsFileRebind: boolean
  createdAt: string
  updatedAt: string
  completedAt?: string | null
}

export interface ProjectUploadDrawerState {
  open: boolean
  source: 'auto' | 'manual'
}

export function isProjectUploadSessionTerminal(session: Pick<ProjectResourceUploadSession, 'status'>): boolean {
  return session.status === 'completed' || session.status === 'canceled'
}

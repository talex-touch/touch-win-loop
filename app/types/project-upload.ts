import type {
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

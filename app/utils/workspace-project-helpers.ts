import type {
  ChatMessage,
  Project,
  ProjectContestAdaptation,
  Resource,
} from '~~/shared/types/domain'
import type {
  MappingTone,
  WorkspaceProjectAdaptationForm,
  WorkspaceProjectContestBindingForm,
} from '~/types/workspace'
import {
  formatFileSize,
  isProjectResourceUploadFileSupported,
  PROJECT_RESOURCE_STORAGE_LIMIT_BYTES,
  PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES,
  PROJECT_RESOURCE_UPLOAD_MAX_FILES_PER_BATCH,
} from '~~/shared/constants/project-resource-upload'

export function linesToArray(text: string): string[] {
  return text
    .split(/\n+/)
    .map(item => item.trim())
    .filter(Boolean)
}

export function arrayToLines(list: string[] | undefined): string {
  return (list || []).join('\n')
}

export function createEmptyProjectAdaptationForm(contestId = '', trackId = ''): WorkspaceProjectAdaptationForm {
  return {
    contestId,
    trackId,
    problemStatement: '',
    innovationPointsText: '',
    techRouteStepsText: '',
    scoringMappingText: '',
    risksText: '',
    deliverablesText: '',
    summary: '',
  }
}

export function createProjectAdaptationFormFromSnapshot(
  adaptation: ProjectContestAdaptation | null,
  project: Pick<Project, 'problemStatement' | 'innovationPoints' | 'techRouteSteps' | 'scoringMapping' | 'risks' | 'deliverables' | 'summary'> | null,
  contestId: string,
  trackId: string,
): WorkspaceProjectAdaptationForm {
  if (!adaptation) {
    return {
      contestId,
      trackId,
      problemStatement: project?.problemStatement || '',
      innovationPointsText: arrayToLines(project?.innovationPoints),
      techRouteStepsText: arrayToLines(project?.techRouteSteps),
      scoringMappingText: arrayToLines(project?.scoringMapping),
      risksText: arrayToLines(project?.risks),
      deliverablesText: arrayToLines(project?.deliverables),
      summary: project?.summary || '',
    }
  }

  return {
    contestId,
    trackId,
    problemStatement: adaptation.problemStatement || '',
    innovationPointsText: arrayToLines(adaptation.innovationPoints),
    techRouteStepsText: arrayToLines(adaptation.techRouteSteps),
    scoringMappingText: arrayToLines(adaptation.scoringMapping),
    risksText: arrayToLines(adaptation.risks),
    deliverablesText: arrayToLines(adaptation.deliverables),
    summary: adaptation.summary || '',
  }
}

export function cloneProjectAdaptationForm(value: WorkspaceProjectAdaptationForm): WorkspaceProjectAdaptationForm {
  return {
    contestId: value.contestId,
    trackId: value.trackId,
    problemStatement: value.problemStatement,
    innovationPointsText: value.innovationPointsText,
    techRouteStepsText: value.techRouteStepsText,
    scoringMappingText: value.scoringMappingText,
    risksText: value.risksText,
    deliverablesText: value.deliverablesText,
    summary: value.summary,
  }
}

export function cloneProjectContestBindings(value: WorkspaceProjectContestBindingForm[]): WorkspaceProjectContestBindingForm[] {
  return value.map(item => ({
    contestId: item.contestId,
    trackId: item.trackId,
    sortOrder: item.sortOrder,
  }))
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function defaultAssistantGreeting(): ChatMessage {
  return {
    role: 'assistant',
    content: '你好，我是 Loopy。先在左侧筛选竞赛，再告诉我你想做的项目方向，我会帮你生成可落地草案。',
  }
}

export function toTone(score: number): MappingTone {
  if (score >= 75)
    return 'complete'
  if (score >= 40)
    return 'warning'
  return 'todo'
}

export function includesText(source: string, keyword: string): boolean {
  return source.toLowerCase().includes(keyword.toLowerCase())
}

export function resolveApiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const maybeData = (error as { data?: { message?: string } }).data
    const message = String(maybeData?.message || '').trim()
    if (message)
      return message
  }

  if (error instanceof Error && error.message.trim())
    return error.message.trim()

  return fallback
}

export function parseFileSizeFromResource(resource: Resource): number {
  const sourceType = String(resource.sourceType || resource.source || '').trim()
  if (sourceType !== 'project_upload' && sourceType !== 'upload')
    return 0

  const metadata = resource.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return 0

  const rawSize = (metadata as Record<string, unknown>).fileSize
  const size = Number(rawSize)
  if (!Number.isFinite(size) || size <= 0)
    return 0
  return size
}

export function validateUploadFiles(files: File[], usedBytes: number): string | null {
  if (!files.length)
    return '未检测到可上传文件。'

  if (files.length > PROJECT_RESOURCE_UPLOAD_MAX_FILES_PER_BATCH)
    return `单次最多上传 ${PROJECT_RESOURCE_UPLOAD_MAX_FILES_PER_BATCH} 个文件。`

  const invalidTypeFiles = files
    .filter(file => !isProjectResourceUploadFileSupported(file.name))
    .slice(0, 3)
    .map(file => file.name)

  if (invalidTypeFiles.length)
    return `文件格式不支持：${invalidTypeFiles.join('、')}。`

  const oversizeFile = files.find(file => file.size > PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES)
  if (oversizeFile)
    return `文件过大：${oversizeFile.name}，单文件上限 ${formatFileSize(PROJECT_RESOURCE_UPLOAD_MAX_FILE_SIZE_BYTES)}。`

  const incomingBytes = files.reduce((sum, file) => sum + Math.max(0, Number(file.size || 0)), 0)
  if (usedBytes + incomingBytes > PROJECT_RESOURCE_STORAGE_LIMIT_BYTES)
    return `当前项目容量超限：上限 ${formatFileSize(PROJECT_RESOURCE_STORAGE_LIMIT_BYTES)}。`

  return null
}

export function resolveApiStatusCode(error: unknown): number {
  if (!error || typeof error !== 'object')
    return 0

  const statusCode = Number((error as { statusCode?: number }).statusCode || 0)
  if (Number.isFinite(statusCode) && statusCode > 0)
    return statusCode

  const responseStatus = Number((error as { response?: { status?: number } }).response?.status || 0)
  if (Number.isFinite(responseStatus) && responseStatus > 0)
    return responseStatus

  const dataStatus = Number((error as { data?: { statusCode?: number } }).data?.statusCode || 0)
  if (Number.isFinite(dataStatus) && dataStatus > 0)
    return dataStatus

  return 0
}

export function parseTimestamp(value: string): number {
  const time = new Date(value).getTime()
  if (Number.isNaN(time))
    return 0
  return time
}

export function sortByUpdatedAtDesc(items: Project[]): Project[] {
  return [...items].sort((a, b) => parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt))
}

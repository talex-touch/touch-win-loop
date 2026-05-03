import type { MeetingSummaryResult } from '~~/server/services/meeting/meeting-summary'
import type { RtcRecordingArtifact } from '~~/server/services/meeting/rtc-provider'
import type { Queryable } from '~~/server/utils/db'
import type { RuntimeSettings } from '~~/server/utils/env'
import type {
  ProjectMeeting,
  Resource,
} from '~~/shared/types/domain'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { buildDocumentObjectKey, getDocumentStorage } from '~~/server/storage/document-storage'
import { buildServerApiEndpoint } from '~~/server/utils/api-url'
import * as projectResourceStore from '~~/server/utils/project-resource-store'

const MEETING_MEMORY_SECTION_DIVIDER = '\n\n---\n\n'
const MEETING_MEMORY_AUTO_SECTION_TITLE = '## 自动汇总'
const MEETING_MEMORY_MANUAL_SECTION_TITLE = '## 手动补充'
const MEETING_RECORDING_DOWNLOAD_RETRY_COUNT = 3
const MEETING_RECORDING_DOWNLOAD_TIMEOUT_MS = 30000

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeLineBreaks(value: unknown): string {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)))
}

function sanitizeArtifactDownloadUrl(value: string): string {
  try {
    const parsed = new URL(value)
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  }
  catch {
    return ''
  }
}

function meetingModeLabel(meeting: ProjectMeeting): string {
  return meeting.mode === 'audio' ? '语音会议' : '视频会议'
}

function buildMeetingRecordingMarkdownLine(meeting: ProjectMeeting, recordingResource: Resource | null): string {
  if (!recordingResource)
    return '- 录制：待生成'
  return `- 录制：[${normalizeString(recordingResource.title) || '会议录制'}](${buildServerApiEndpoint(`/projects/${meeting.projectId}/resources/${recordingResource.id}/file`)})`
}

function buildMeetingMemoryEntryMarkdown(input: {
  meeting: ProjectMeeting
  summary: MeetingSummaryResult
  recordingResource: Resource | null
}): string {
  const { meeting, summary } = input
  return [
    `### ${normalizeString(meeting.title) || '未命名会议'}`,
    `- 会议标识：\`${meeting.id}\``,
    `- 会议模式：${meetingModeLabel(meeting)}`,
    `- 开始时间：${meeting.startedAt}`,
    `- 结束时间：${meeting.endedAt || '进行中'}`,
    buildMeetingRecordingMarkdownLine(meeting, input.recordingResource),
    '',
    '#### 本次摘要',
    summary.summary,
    '',
    '#### 待办',
    ...summary.todos.map(item => `- [ ] ${item}`),
    '',
    '#### 决策',
    ...summary.decisions.map(item => `- ${item}`),
    '',
    '#### 风险',
    ...summary.risks.map(item => `- ${item}`),
    '',
    '#### 时间线片段',
    ...summary.timeline,
  ].join('\n').trim()
}

function buildMeetingMemoryOverviewLines(input: {
  meeting: ProjectMeeting
  summary: MeetingSummaryResult
  entryCount: number
}): string[] {
  const latestTodo = normalizeString(input.summary.todos[0]) || '待补充'
  const latestDecision = normalizeString(input.summary.decisions[0]) || '待补充'
  const latestRisk = normalizeString(input.summary.risks[0]) || '待补充'

  return [
    `- 已汇总会议数：${Math.max(1, input.entryCount)}`,
    `- 最近会议：${normalizeString(input.meeting.title) || '未命名会议'}`,
    `- 最近更新：${input.meeting.endedAt || input.meeting.startedAt}`,
    `- 当前进展：${input.summary.summary}`,
    `- 最新待办：${latestTodo}`,
    `- 最新决策：${latestDecision}`,
    `- 主要风险：${latestRisk}`,
  ]
}

function extractMeetingMemoryManualSection(markdown: string): string {
  const normalized = normalizeLineBreaks(markdown)
  const heading = normalized.indexOf(MEETING_MEMORY_MANUAL_SECTION_TITLE)
  if (heading < 0) {
    return [
      MEETING_MEMORY_MANUAL_SECTION_TITLE,
      '- 可在这里补充跨会议结论、长期任务与阶段性复盘。',
    ].join('\n')
  }

  return normalized.slice(heading).trim()
}

function extractMeetingMemoryEntries(markdown: string): string[] {
  const normalized = normalizeLineBreaks(markdown)
  const autoSectionStart = normalized.indexOf(MEETING_MEMORY_AUTO_SECTION_TITLE)
  if (autoSectionStart < 0)
    return []

  const contentStart = autoSectionStart + MEETING_MEMORY_AUTO_SECTION_TITLE.length
  const manualSectionStart = normalized.indexOf(MEETING_MEMORY_MANUAL_SECTION_TITLE, contentStart)
  const autoSection = normalized
    .slice(contentStart, manualSectionStart >= 0 ? manualSectionStart : normalized.length)
    .trim()

  if (!autoSection || autoSection === '- 暂无会议纪要。')
    return []

  return autoSection
    .split(MEETING_MEMORY_SECTION_DIVIDER)
    .map(entry => entry.trim())
    .filter(Boolean)
}

function buildMeetingMemoryMarkdown(input: {
  existingMarkdown: string
  meeting: ProjectMeeting
  summary: MeetingSummaryResult
  recordingResource: Resource | null
}): {
  markdown: string
  entryCount: number
} {
  const nextEntry = buildMeetingMemoryEntryMarkdown({
    meeting: input.meeting,
    summary: input.summary,
    recordingResource: input.recordingResource,
  })
  const existingEntries = extractMeetingMemoryEntries(input.existingMarkdown)
    .filter(entry => !new RegExp(`会议标识：\\\`${escapeRegExp(input.meeting.id)}\\\``).test(entry))

  const entries = [nextEntry, ...existingEntries]
  const overviewLines = buildMeetingMemoryOverviewLines({
    meeting: input.meeting,
    summary: input.summary,
    entryCount: entries.length,
  })
  const manualSection = extractMeetingMemoryManualSection(input.existingMarkdown)

  return {
    entryCount: entries.length,
    markdown: [
      `# ${projectResourceStore.PROJECT_MEETING_MEMORY_RESOURCE_TITLE}`,
      '',
      '自动汇总项目内所有会议的纪要、录制链接与阶段进展，作为持续沉淀的会议 memory。',
      '',
      '## 总体概述',
      ...overviewLines,
      '',
      MEETING_MEMORY_AUTO_SECTION_TITLE,
      entries.join(MEETING_MEMORY_SECTION_DIVIDER),
      '',
      manualSection,
    ].join('\n').trim(),
  }
}

function buildMeetingMemorySummary(input: {
  meeting: ProjectMeeting
  summary: MeetingSummaryResult
  entryCount: number
}): string {
  return `已汇总 ${Math.max(1, input.entryCount)} 场会议；最近会议「${normalizeString(input.meeting.title) || '未命名会议'}」的进展：${input.summary.summary}`
}

async function resolveArtifactBuffer(artifact: RtcRecordingArtifact): Promise<Buffer> {
  if (artifact.base64Content)
    return Buffer.from(artifact.base64Content, 'base64')
  if (artifact.textContent)
    return Buffer.from(artifact.textContent, 'utf-8')
  if (artifact.localFilePath)
    return readFile(artifact.localFilePath)
  if (artifact.downloadUrl) {
    let lastError = ''
    for (let attempt = 1; attempt <= MEETING_RECORDING_DOWNLOAD_RETRY_COUNT; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), MEETING_RECORDING_DOWNLOAD_TIMEOUT_MS)
      try {
        const response = await fetch(artifact.downloadUrl, {
          signal: controller.signal,
        })
        if (!response.ok)
          throw new Error(`MEETING_RECORDING_DOWNLOAD_${response.status}`)
        const arrayBuffer = await response.arrayBuffer()
        return Buffer.from(arrayBuffer)
      }
      catch (error) {
        lastError = error instanceof Error ? normalizeString(error.message) : 'MEETING_RECORDING_DOWNLOAD_FAILED'
        if (attempt < MEETING_RECORDING_DOWNLOAD_RETRY_COUNT)
          await sleep(attempt * 500)
      }
      finally {
        clearTimeout(timer)
      }
    }
    throw new Error(`MEETING_RECORDING_DOWNLOAD_FAILED:${lastError}`)
  }
  throw new Error('MEETING_RECORDING_ARTIFACT_MISSING')
}

export async function persistMeetingRecordingResource(
  db: Queryable,
  input: {
    meeting: ProjectMeeting
    actorUserId: string
    artifact: RtcRecordingArtifact
    runtime?: RuntimeSettings
  },
): Promise<Resource> {
  if (input.meeting.recordingResourceId) {
    const existing = await projectResourceStore.getProjectResourceById(db, {
      projectId: input.meeting.projectId,
      resourceId: input.meeting.recordingResourceId,
    })
    if (existing)
      return existing
  }

  const buffer = await resolveArtifactBuffer(input.artifact)
  const fileName = normalizeString(input.artifact.fileName) || `meeting-recording-${input.meeting.id}.bin`
  const mimeType = normalizeString(input.artifact.mimeType) || 'application/octet-stream'
  const storage = getDocumentStorage(input.runtime)
  const objectKey = buildDocumentObjectKey(`project-${input.meeting.projectId}`, fileName)
  const meetingMemory = await projectResourceStore.ensureProjectMeetingMemoryResource(db, {
    projectId: input.meeting.projectId,
    actorUserId: input.actorUserId,
  })
  await storage.putObject({
    key: objectKey,
    body: Readable.from(buffer),
    contentType: mimeType,
  })

  return projectResourceStore.createProjectUploadedResource(db, {
    projectId: input.meeting.projectId,
    actorUserId: input.actorUserId,
    fileName,
    mimeType,
    fileSize: buffer.length,
    objectKey,
    storageProvider: storage.provider,
    title: `会议录制 · ${input.meeting.title}`,
    summary: '会议录制文件已自动沉淀到项目资料。',
    category: 'templates',
    accessLevel: 'login_required',
    parentResourceId: meetingMemory.id,
    metadata: {
      artifactKind: 'meeting_recording',
      meetingId: input.meeting.id,
      provider: input.meeting.provider,
      sourceStorageProvider: storage.provider,
      artifactDownloadUrl: input.artifact.downloadUrl ? sanitizeArtifactDownloadUrl(input.artifact.downloadUrl) : '',
      artifactLocalFilePath: input.artifact.localFilePath ? normalizeString(input.artifact.localFilePath) : '',
      ...input.artifact.metadata,
    },
  })
}

export async function persistMeetingNotesResource(
  db: Queryable,
  input: {
    meeting: ProjectMeeting
    actorUserId: string
    summary: MeetingSummaryResult
  },
): Promise<Resource> {
  const meetingMemory = await projectResourceStore.ensureProjectMeetingMemoryResource(db, {
    projectId: input.meeting.projectId,
    actorUserId: input.actorUserId,
  })
  const recordingResource = input.meeting.recordingResourceId
    ? await projectResourceStore.getProjectResourceById(db, {
        projectId: input.meeting.projectId,
        resourceId: input.meeting.recordingResourceId,
      })
    : null
  const meetingMemoryProjectId = normalizeString(meetingMemory.projectId) || input.meeting.projectId
  const nextMemory = buildMeetingMemoryMarkdown({
    existingMarkdown: meetingMemory.content || '',
    meeting: input.meeting,
    summary: input.summary,
    recordingResource,
  })

  await projectResourceStore.overwriteProjectMarkdownCollabResource(db, {
    projectId: meetingMemoryProjectId,
    resourceId: meetingMemory.id,
    actorUserId: input.actorUserId,
    markdown: nextMemory.markdown,
  })
  await projectResourceStore.patchProjectResourceMetadata(db, {
    projectId: meetingMemoryProjectId,
    resourceId: meetingMemory.id,
    actorUserId: input.actorUserId,
    title: projectResourceStore.PROJECT_MEETING_MEMORY_RESOURCE_TITLE,
    summary: buildMeetingMemorySummary({
      meeting: input.meeting,
      summary: input.summary,
      entryCount: nextMemory.entryCount,
    }),
    availability: 'login_required',
  })
  return projectResourceStore.mergeProjectResourceMetadata(db, {
    projectId: meetingMemoryProjectId,
    resourceId: meetingMemory.id,
    actorUserId: input.actorUserId,
    metadata: {
      artifactKind: 'meeting_notes',
      meetingMemory: true,
      latestMeetingId: input.meeting.id,
      latestMeetingTitle: input.meeting.title,
      summaryGeneratedAt: new Date().toISOString(),
      meetingEntryCount: nextMemory.entryCount,
    },
  })
}

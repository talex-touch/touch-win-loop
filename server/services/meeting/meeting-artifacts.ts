import type { MeetingSummaryResult } from '~~/server/services/meeting/meeting-summary'
import type { RtcRecordingArtifact } from '~~/server/services/meeting/rtc-provider'
import type { Queryable } from '~~/server/utils/db'
import type {
  ProjectMeeting,
  Resource,
} from '~~/shared/types/domain'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { buildDocumentObjectKey, getDocumentStorage } from '~~/server/storage/document-storage'
import * as projectResourceStore from '~~/server/utils/project-resource-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

async function resolveArtifactBuffer(artifact: RtcRecordingArtifact): Promise<Buffer> {
  if (artifact.base64Content)
    return Buffer.from(artifact.base64Content, 'base64')
  if (artifact.textContent)
    return Buffer.from(artifact.textContent, 'utf-8')
  if (artifact.localFilePath)
    return readFile(artifact.localFilePath)
  if (artifact.downloadUrl) {
    const response = await fetch(artifact.downloadUrl)
    if (!response.ok)
      throw new Error(`MEETING_RECORDING_DOWNLOAD_${response.status}`)
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
  throw new Error('MEETING_RECORDING_ARTIFACT_MISSING')
}

export async function persistMeetingRecordingResource(
  db: Queryable,
  input: {
    meeting: ProjectMeeting
    actorUserId: string
    artifact: RtcRecordingArtifact
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
  const storage = getDocumentStorage()
  const objectKey = buildDocumentObjectKey(`project-${input.meeting.projectId}`, fileName)
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
    metadata: {
      artifactKind: 'meeting_recording',
      meetingId: input.meeting.id,
      provider: input.meeting.provider,
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
  if (input.meeting.notesResourceId) {
    await projectResourceStore.overwriteProjectMarkdownCollabResource(db, {
      projectId: input.meeting.projectId,
      resourceId: input.meeting.notesResourceId,
      actorUserId: input.actorUserId,
      markdown: input.summary.markdown,
    })
    await projectResourceStore.patchProjectResourceMetadata(db, {
      projectId: input.meeting.projectId,
      resourceId: input.meeting.notesResourceId,
      actorUserId: input.actorUserId,
      title: `会议纪要 · ${input.meeting.title}`,
      summary: input.summary.summary,
      availability: 'login_required',
    })
    return projectResourceStore.mergeProjectResourceMetadata(db, {
      projectId: input.meeting.projectId,
      resourceId: input.meeting.notesResourceId,
      actorUserId: input.actorUserId,
      metadata: {
        artifactKind: 'meeting_notes',
        meetingId: input.meeting.id,
        summaryGeneratedAt: new Date().toISOString(),
      },
    })
  }

  const created = await projectResourceStore.createProjectCollabResource(db, {
    projectId: input.meeting.projectId,
    actorUserId: input.actorUserId,
    kind: 'markdown',
    purpose: 'notes',
    title: `会议纪要 · ${input.meeting.title}`,
    summary: input.summary.summary,
    availability: 'login_required',
    category: 'templates',
    metadata: {
      artifactKind: 'meeting_notes',
      meetingId: input.meeting.id,
      summaryGeneratedAt: new Date().toISOString(),
    },
  })
  await projectResourceStore.overwriteProjectMarkdownCollabResource(db, {
    projectId: input.meeting.projectId,
    resourceId: created.resource.id,
    actorUserId: input.actorUserId,
    markdown: input.summary.markdown,
  })
  return created.resource
}

import { persistMeetingNotesResource, persistMeetingRecordingResource } from '~~/server/services/meeting/meeting-artifacts'
import { summarizeMeetingByAi } from '~~/server/services/meeting/meeting-summary'
import { getRtcProviderGateway } from '~~/server/services/meeting/rtc-provider'
import { generateAndSaveProjectOutline } from '~~/server/services/project-outline-generator'
import { withClient, withTransaction } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import { findUserById } from '~~/server/utils/platform-store'
import {
  claimNextQueuedProjectMeetingJob,
  finishProjectMeetingJobFailure,
  finishProjectMeetingJobSuccess,
  getProjectMeetingById,
  getProjectMeetingDetailByMeetingId,
  listProjectMeetingUtterances,
  patchProjectMeeting,
} from '~~/server/utils/project-meeting-store'
import { emitRealtimeEvent } from '~~/server/utils/realtime-events'

const WORKER_RUNTIME_STATE_KEY = Symbol.for('winloop.project-meeting-job-worker.runtime.v1')

interface WorkerRuntimeState {
  booted: boolean
  timer: NodeJS.Timeout | null
  ticking: boolean
}

function getWorkerRuntimeState(): WorkerRuntimeState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[WORKER_RUNTIME_STATE_KEY] as WorkerRuntimeState | undefined
  if (existing)
    return existing

  const created: WorkerRuntimeState = {
    booted: false,
    timer: null,
    ticking: false,
  }
  globalRef[WORKER_RUNTIME_STATE_KEY] = created
  return created
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return normalizeString(error.message) || 'unknown error'
  return normalizeString(error) || 'unknown error'
}

function calcRetryAt(attempt: number): string {
  const delaySeconds = Math.min(300, Math.max(10, attempt * 15))
  return new Date(Date.now() + delaySeconds * 1000).toISOString()
}

async function emitMeetingStateChanged(projectId: string, workspaceId: string, meetingId: string): Promise<void> {
  await emitRealtimeEvent({
    type: 'meeting.state.updated',
    workspaceId,
    projectId,
    payload: {
      meetingId,
    },
  })
}

async function processSingleMeetingJob(): Promise<'none' | 'success' | 'failure'> {
  const runtime = readRuntimeSettings()
  const claimed = await withTransaction(undefined, async (db) => {
    return claimNextQueuedProjectMeetingJob(db, {
      maxAttempts: runtime.meeting.worker.maxAttempts,
    })
  })

  if (!claimed)
    return 'none'

  try {
    const detail = await withClient(undefined, async db => getProjectMeetingDetailByMeetingId(db, claimed.meetingId))

    if (!detail) {
      await withTransaction(undefined, async (db) => {
        await finishProjectMeetingJobFailure(db, {
          jobId: claimed.id,
          errorMessage: 'MEETING_NOT_FOUND',
        })
      })
      return 'failure'
    }

    if (claimed.jobType === 'transcript_finalize') {
      await withTransaction(undefined, async (db) => {
        await patchProjectMeeting(db, {
          projectId: detail.projectId,
          meetingId: detail.id,
          transcriptStatus: 'completed',
        })
        await finishProjectMeetingJobSuccess(db, {
          jobId: claimed.id,
        })
      })
      await emitMeetingStateChanged(detail.projectId, detail.workspaceId, detail.id)
      return 'success'
    }

    if (claimed.jobType === 'recording_finalize') {
      const rtc = getRtcProviderGateway(runtime)
      const artifact = await rtc.resolveRecordingArtifact({
        meetingMetadata: detail.providerMetadata,
        eventPayload: claimed.payload,
      })
      if (!artifact) {
        await withTransaction(undefined, async (db) => {
          await finishProjectMeetingJobFailure(db, {
            jobId: claimed.id,
            errorMessage: 'MEETING_RECORDING_ARTIFACT_PENDING',
            retryAt: calcRetryAt(claimed.attempt),
          })
          await patchProjectMeeting(db, {
            projectId: detail.projectId,
            meetingId: detail.id,
            recordingStatus: 'processing',
          })
        })
        return 'failure'
      }

      const resource = await withTransaction(undefined, async (db) => {
        const latestMeeting = await getProjectMeetingById(db, {
          projectId: detail.projectId,
          meetingId: detail.id,
        })
        if (!latestMeeting)
          throw new Error('MEETING_NOT_FOUND')

        const recordingResource = await persistMeetingRecordingResource(db, {
          meeting: latestMeeting,
          actorUserId: latestMeeting.startedByUserId,
          artifact,
        })
        await patchProjectMeeting(db, {
          projectId: latestMeeting.projectId,
          meetingId: latestMeeting.id,
          recordingStatus: 'completed',
          recordingResourceId: recordingResource.id,
          providerMetadata: {
            recordingArtifactImportedAt: new Date().toISOString(),
          },
        })
        await finishProjectMeetingJobSuccess(db, {
          jobId: claimed.id,
          payload: {
            recordingResourceId: recordingResource.id,
          },
        })
        return recordingResource
      })

      await Promise.allSettled([
        emitRealtimeEvent({
          type: 'project.resources.changed',
          workspaceId: detail.workspaceId,
          projectId: detail.projectId,
        }),
        emitMeetingStateChanged(detail.projectId, detail.workspaceId, detail.id),
      ])
      void resource
      return 'success'
    }

    if (claimed.jobType === 'meeting_summary') {
      const utterances = await withClient(undefined, async db => listProjectMeetingUtterances(db, {
        meetingId: detail.id,
        finalsOnly: true,
      }))

      const summary = await summarizeMeetingByAi({
        meeting: detail,
        participants: detail.participants,
        utterances,
        ai: runtime.ai,
      })

      const notesResource = await withTransaction(undefined, async (db) => {
        const latestMeeting = await getProjectMeetingById(db, {
          projectId: detail.projectId,
          meetingId: detail.id,
        })
        if (!latestMeeting)
          throw new Error('MEETING_NOT_FOUND')
        const resource = await persistMeetingNotesResource(db, {
          meeting: latestMeeting,
          actorUserId: latestMeeting.startedByUserId,
          summary,
        })
        await patchProjectMeeting(db, {
          projectId: latestMeeting.projectId,
          meetingId: latestMeeting.id,
          summaryStatus: 'completed',
          notesResourceId: resource.id,
          providerMetadata: {
            summaryGeneratedAt: new Date().toISOString(),
          },
        })
        await finishProjectMeetingJobSuccess(db, {
          jobId: claimed.id,
          payload: {
            notesResourceId: resource.id,
          },
        })
        return resource
      })

      const actorUser = await withClient(undefined, async db => findUserById(db, detail.startedByUserId))
      if (actorUser) {
        await withClient(undefined, async (db) => {
          await generateAndSaveProjectOutline(db, {
            projectId: detail.projectId,
            user: actorUser,
            reason: 'meeting_summary_ready',
          })
        }).catch(() => undefined)
      }

      await Promise.allSettled([
        emitRealtimeEvent({
          type: 'project.resources.changed',
          workspaceId: detail.workspaceId,
          projectId: detail.projectId,
        }),
        emitRealtimeEvent({
          type: 'project.outline.changed',
          workspaceId: detail.workspaceId,
          projectId: detail.projectId,
        }),
        emitRealtimeEvent({
          type: 'meeting.summary.ready',
          workspaceId: detail.workspaceId,
          projectId: detail.projectId,
          payload: {
            meetingId: detail.id,
            resourceId: notesResource.id,
          },
        }),
        emitMeetingStateChanged(detail.projectId, detail.workspaceId, detail.id),
      ])
      return 'success'
    }

    await withTransaction(undefined, async (db) => {
      await finishProjectMeetingJobFailure(db, {
        jobId: claimed.id,
        errorMessage: `UNSUPPORTED_JOB_TYPE:${claimed.jobType}`,
      })
    })
    return 'failure'
  }
  catch (error) {
    await withTransaction(undefined, async (db) => {
      await finishProjectMeetingJobFailure(db, {
        jobId: claimed.id,
        errorMessage: toErrorMessage(error),
        retryAt: calcRetryAt(claimed.attempt),
      })
    }).catch(() => undefined)
    return 'failure'
  }
}

async function tickMeetingWorker(): Promise<void> {
  const runtime = readRuntimeSettings()
  const batchSize = Math.max(1, runtime.meeting.worker.batchSize)
  for (let index = 0; index < batchSize; index += 1) {
    const result = await processSingleMeetingJob()
    if (result === 'none')
      break
  }
}

export default defineNitroPlugin((nitroApp) => {
  const runtime = readRuntimeSettings()
  const state = getWorkerRuntimeState()
  if (state.booted)
    return
  state.booted = true

  if (!runtime.meeting.worker.enabled)
    return

  state.timer = setInterval(() => {
    if (state.ticking)
      return
    state.ticking = true
    void tickMeetingWorker()
      .catch((error) => {
        console.error('[project-meeting-job-worker] tick failed:', toErrorMessage(error))
      })
      .finally(() => {
        state.ticking = false
      })
  }, runtime.meeting.worker.intervalMs)
  state.timer.unref?.()

  nitroApp.hooks.hookOnce('close', () => {
    if (state.timer)
      clearInterval(state.timer)
    state.timer = null
    state.booted = false
    state.ticking = false
  })
})

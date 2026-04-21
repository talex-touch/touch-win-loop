import type { Queryable } from '~~/server/utils/db'
import type {
  Project,
  ProjectExportArtifact,
  ProjectExportBundleManifest,
  ProjectExportJob,
  ProjectExportJobDiagnostics,
} from '~~/shared/types/domain'
import { buildProjectContestExportBundle } from '~~/server/services/project/project-contest-export'
import {
  createProjectExportJob,
  finishProjectExportJobFailure,
  finishProjectExportJobSuccess,
} from '~~/server/utils/project-export-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return normalizeString(error.message) || 'PROJECT_EXPORT_FAILED'
  return normalizeString(error) || 'PROJECT_EXPORT_FAILED'
}

export async function runProjectContestExportJob(
  db: Queryable,
  input: {
    project: Project
    actorUserId: string
    profileId?: string | null
    trigger?: ProjectExportJob['trigger']
    attempt?: number
    parentJobId?: string | null
    execute?: () => Promise<{
      manifest: ProjectExportBundleManifest
      artifacts: ProjectExportArtifact[]
    }>
  },
): Promise<{
    job: ProjectExportJob
    manifest: ProjectExportBundleManifest
    artifacts: ProjectExportArtifact[]
  }> {
  const workspaceId = normalizeString(input.project.workspaceId)
  if (!workspaceId)
    throw new Error('PROJECT_WORKSPACE_ID_MISSING')

  const job = await createProjectExportJob(db, {
    projectId: input.project.id,
    workspaceId,
    profileId: normalizeString(input.profileId) || null,
    trigger: input.trigger || 'manual',
    attempt: input.attempt,
    parentJobId: normalizeString(input.parentJobId) || null,
    startedByUserId: input.actorUserId,
  })

  try {
    const exported = input.execute
      ? await input.execute()
      : await buildProjectContestExportBundle(db, {
          project: input.project,
          actorUserId: input.actorUserId,
          profileId: normalizeString(input.profileId) || null,
        })
    const finishedJob = await finishProjectExportJobSuccess(db, {
      jobId: job.id,
      manifest: exported.manifest,
      artifacts: exported.artifacts,
    })
    return {
      job: finishedJob,
      manifest: exported.manifest,
      artifacts: exported.artifacts,
    }
  }
  catch (error) {
    await finishProjectExportJobFailure(db, {
      jobId: job.id,
      errorMessage: toErrorMessage(error),
    })
    throw error
  }
}

export function buildProjectExportJobDiagnostics(
  jobs: ProjectExportJob[],
): ProjectExportJobDiagnostics {
  const latestSuccess = jobs.find(item => item.status === 'succeeded') || null
  const latestFailure = jobs.find(item => item.status === 'failed') || null
  return {
    processingCount: jobs.filter(item => item.status === 'queued' || item.status === 'processing').length,
    failedCount: jobs.filter(item => item.status === 'failed').length,
    lastSuccessAt: latestSuccess?.finishedAt || latestSuccess?.updatedAt || null,
    lastFailureAt: latestFailure?.finishedAt || latestFailure?.updatedAt || null,
  }
}

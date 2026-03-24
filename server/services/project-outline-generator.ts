import type { Queryable } from '~~/server/utils/db'
import type { AuthUser, ProjectOutlineSnapshot } from '~~/shared/types/domain'
import { buildProjectOutline } from '~~/server/services/project-outline'
import { getProjectSettingsSnapshot, getVisibleProjectById } from '~~/server/utils/platform-store'
import { getProjectOutlineSnapshot, upsertProjectOutlineSnapshot } from '~~/server/utils/project-outline-store'
import { listProjectResources } from '~~/server/utils/project-resource-store'

interface ContestNameRow {
  name: string
}

interface TrackNameRow {
  name: string
}

interface GenerateProjectOutlineInput {
  projectId: string
  user: AuthUser
  reason?: string
  context?: Partial<ProjectOutlineSnapshot['context']>
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

async function resolveContestTrackNames(
  db: Queryable,
  contestId: string,
  trackId: string,
): Promise<{ contestName: string, trackName: string }> {
  const normalizedContestId = normalizeString(contestId)
  const normalizedTrackId = normalizeString(trackId)
  if (!normalizedContestId && !normalizedTrackId) {
    return {
      contestName: '',
      trackName: '',
    }
  }

  const [contestResult, trackResult] = await Promise.all([
    normalizedContestId
      ? db.query<ContestNameRow>(
          `SELECT name
           FROM contests
           WHERE id = $1
           LIMIT 1`,
          [normalizedContestId],
        )
      : Promise.resolve({ rows: [] } as { rows: ContestNameRow[] }),
    normalizedTrackId
      ? db.query<TrackNameRow>(
          `SELECT name
           FROM contest_tracks
           WHERE id = $1
           LIMIT 1`,
          [normalizedTrackId],
        )
      : Promise.resolve({ rows: [] } as { rows: TrackNameRow[] }),
  ])

  return {
    contestName: normalizeString(contestResult.rows[0]?.name),
    trackName: normalizeString(trackResult.rows[0]?.name),
  }
}

function mergeContextValue(
  preferred: unknown,
  fallbackA?: unknown,
  fallbackB?: unknown,
): string {
  return normalizeString(preferred) || normalizeString(fallbackA) || normalizeString(fallbackB)
}

export async function generateAndSaveProjectOutline(
  db: Queryable,
  input: GenerateProjectOutlineInput,
): Promise<ProjectOutlineSnapshot> {
  const projectId = normalizeString(input.projectId)
  if (!projectId)
    throw new Error('PROJECT_NOT_FOUND')

  const visibleProject = await getVisibleProjectById(db, input.user, projectId)
  if (!visibleProject)
    throw new Error('PROJECT_NOT_FOUND')

  const existing = await getProjectOutlineSnapshot(db, projectId)
  const requested = input.context || {}

  const preferredContestId = mergeContextValue(
    requested.contestId,
    existing?.context.contestId,
    visibleProject.contestId,
  )

  const settings = await getProjectSettingsSnapshot(db, input.user, projectId, preferredContestId)

  const contestId = mergeContextValue(
    requested.contestId,
    settings?.currentContestId,
    mergeContextValue(existing?.context.contestId, visibleProject.contestId),
  )

  const boundTrackId = settings?.contestBindings.find(item => item.contestId === contestId)?.trackId || ''
  const trackId = mergeContextValue(
    requested.trackId,
    settings?.currentAdaptation?.trackId,
    mergeContextValue(boundTrackId, existing?.context.trackId, visibleProject.trackId),
  )

  const context: ProjectOutlineSnapshot['context'] = {
    contestId,
    trackId,
    major: mergeContextValue(requested.major, existing?.context.major),
    discipline: mergeContextValue(requested.discipline, existing?.context.discipline),
    level: mergeContextValue(requested.level, existing?.context.level),
    trackType: mergeContextValue(requested.trackType, existing?.context.trackType),
  }

  const { contestName, trackName } = await resolveContestTrackNames(db, context.contestId, context.trackId)
  const resources = await listProjectResources(db, projectId)

  const snapshot = buildProjectOutline({
    projectId,
    resources,
    context,
    projectSettings: settings,
    contestName,
    trackName,
    reason: normalizeString(input.reason) || 'manual_generate',
  })

  return upsertProjectOutlineSnapshot(db, {
    projectId: snapshot.projectId,
    context: snapshot.context,
    items: snapshot.items,
    generatedAt: snapshot.generatedAt,
    reason: snapshot.reason,
  })
}

export async function getOrGenerateProjectOutline(
  db: Queryable,
  input: GenerateProjectOutlineInput,
): Promise<ProjectOutlineSnapshot> {
  const projectId = normalizeString(input.projectId)
  if (!projectId)
    throw new Error('PROJECT_NOT_FOUND')

  const visibleProject = await getVisibleProjectById(db, input.user, projectId)
  if (!visibleProject)
    throw new Error('PROJECT_NOT_FOUND')

  const snapshot = await getProjectOutlineSnapshot(db, projectId)
  if (snapshot)
    return snapshot

  return generateAndSaveProjectOutline(db, {
    ...input,
    reason: normalizeString(input.reason) || 'auto_init',
  })
}

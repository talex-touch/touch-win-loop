import type {
  ContestReleaseResourceSnapshot,
  ContestReleaseSnapshot,
} from '~~/shared/types/domain'

const LEGACY_RESOURCE_METADATA_KEYS = ['contestRelationInfo', 'trackRelationInfo'] as const

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

export function sanitizeContestReleaseResourceMetadata(value: unknown): Record<string, unknown> {
  const metadata = { ...parseJsonObject(value) }
  for (const key of LEGACY_RESOURCE_METADATA_KEYS)
    delete metadata[key]
  return metadata
}

export function sanitizeContestReleaseResourceSnapshot(
  resource: ContestReleaseResourceSnapshot,
): ContestReleaseResourceSnapshot {
  return {
    ...resource,
    metadata: sanitizeContestReleaseResourceMetadata(resource.metadata),
  }
}

export function sanitizeContestReleaseSnapshot(
  snapshot: ContestReleaseSnapshot,
): ContestReleaseSnapshot {
  return {
    ...snapshot,
    tracks: Array.isArray(snapshot.tracks) ? snapshot.tracks : [],
    timelines: Array.isArray(snapshot.timelines) ? snapshot.timelines : [],
    trackTimelines: Array.isArray(snapshot.trackTimelines) ? snapshot.trackTimelines : [],
    resources: Array.isArray(snapshot.resources)
      ? snapshot.resources.map(sanitizeContestReleaseResourceSnapshot)
      : [],
    faqItems: Array.isArray(snapshot.faqItems) ? snapshot.faqItems : [],
  }
}

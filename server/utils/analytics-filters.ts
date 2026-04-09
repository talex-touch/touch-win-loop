import type { H3Event } from 'h3'
import type { AnalyticsFilterInput } from '~~/shared/types/analytics'
import { getQuery } from 'h3'

export function pickQueryScalar(value: unknown): string {
  if (Array.isArray(value))
    return String(value[0] || '').trim()
  return String(value || '').trim()
}

export function readAnalyticsFilters(event: H3Event): AnalyticsFilterInput {
  const query = getQuery(event)
  return {
    workspaceId: pickQueryScalar(query.workspaceId),
    projectId: pickQueryScalar(query.projectId),
    contestId: pickQueryScalar(query.contestId),
    rangePreset: pickQueryScalar(query.rangePreset) as AnalyticsFilterInput['rangePreset'],
  }
}

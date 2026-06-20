import type { ContestReleaseContestSnapshot } from '~~/shared/types/domain'

export const CONTEST_MANUAL_PRESERVED_FIELDS = [
  'organizer',
  'coOrganizer',
  'participantRequirements',
  'teamRule',
  'currentSeason',
] as const

export type ContestManualPreservedField = typeof CONTEST_MANUAL_PRESERVED_FIELDS[number]

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function hasOwnField(value: object, field: ContestManualPreservedField): boolean {
  return Object.prototype.hasOwnProperty.call(value, field)
}

export function mergeContestManualPreservedFields(
  incoming: ContestReleaseContestSnapshot,
  previous?: ContestReleaseContestSnapshot | null,
): {
  contest: ContestReleaseContestSnapshot
  preservedFields: ContestManualPreservedField[]
} {
  const contest = { ...incoming }
  const preservedFields: ContestManualPreservedField[] = []
  if (!previous)
    return { contest, preservedFields }

  const previousRecord = previous as Record<ContestManualPreservedField, unknown>
  const contestRecord = contest as Record<ContestManualPreservedField, string>
  for (const field of CONTEST_MANUAL_PRESERVED_FIELDS) {
    if (hasOwnField(contest, field))
      continue

    const preservedValue = normalizeText(previousRecord[field])
    if (!preservedValue)
      continue

    contestRecord[field] = preservedValue
    preservedFields.push(field)
  }

  return { contest, preservedFields }
}

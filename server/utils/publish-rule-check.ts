import type { Queryable } from '~~/server/utils/db'
import type {
  ChecklistItem,
  PublishCheckIssue,
  PublishCheckResult,
  RuleResult,
} from '~~/shared/types/domain'
import { getContestPublishCheck } from '~~/server/utils/contest-store'
import { buildContestRuleContext, simulateRuleVersion } from '~~/server/utils/rule-store'

interface PublishRuleEnginePayload {
  versionId: string
  passed: boolean
  blockers: PublishCheckIssue[]
  warnings: PublishCheckIssue[]
  infos: PublishCheckIssue[]
  results: RuleResult[]
  checklist: ChecklistItem[]
}

export interface PublishCheckWithRules extends PublishCheckResult {
  ruleEngine: PublishRuleEnginePayload | null
}

function toRuleIssue(input: {
  result: RuleResult
  severity: 'blocker' | 'warning'
}): PublishCheckIssue {
  const targetPath = String(input.result.targetPath || '').trim()
  return {
    code: `RULE_${input.result.ruleCode}`,
    message: input.result.message || input.result.ruleCode,
    field: targetPath || undefined,
    severity: input.severity,
  }
}

export async function getContestPublishCheckWithRules(
  db: Queryable,
  input: {
    contestId: string
  },
): Promise<PublishCheckWithRules | null> {
  const base = await getContestPublishCheck(db, {
    contestId: input.contestId,
  })
  if (!base)
    return null

  try {
    const context = await buildContestRuleContext(db, input.contestId)
    const simulation = await simulateRuleVersion(db, {
      context,
      fallbackPublished: true,
    })

    const ruleBlockers = simulation.engine.results
      .filter(item => item.severity === 'error' && !item.passed && !item.skipped)
      .map(result => toRuleIssue({ result, severity: 'blocker' }))
    const ruleWarnings = simulation.engine.results
      .filter(item => item.severity === 'warning' && !item.passed && !item.skipped)
      .map(result => toRuleIssue({ result, severity: 'warning' }))
    const ruleInfos = simulation.engine.results
      .filter(item => item.severity === 'info' && !item.passed && !item.skipped)
      .map(result => toRuleIssue({ result, severity: 'warning' }))

    return {
      ...base,
      canPublish: base.canPublish && ruleBlockers.length === 0,
      blockers: [...base.blockers, ...ruleBlockers],
      warnings: [...base.warnings, ...ruleWarnings, ...ruleInfos],
      ruleEngine: {
        versionId: simulation.versionId,
        passed: simulation.passed,
        blockers: ruleBlockers,
        warnings: ruleWarnings,
        infos: ruleInfos,
        results: simulation.engine.results,
        checklist: simulation.checklist,
      },
    }
  }
  catch (error) {
    if (error instanceof Error && error.message === 'RULE_VERSION_NOT_FOUND') {
      return {
        ...base,
        ruleEngine: null,
      }
    }
    throw error
  }
}

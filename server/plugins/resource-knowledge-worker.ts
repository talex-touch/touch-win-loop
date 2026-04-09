import type { Queryable } from '~~/server/utils/db'
import type { Resource, ResourceKnowledgeProfile, ResourceQualityIssue, RuleDefinition, RuleResult } from '~~/shared/types/domain'
import type { ResourceKnowledgeContext } from '~~/server/utils/resource-knowledge-store'
import {
  analyzeResourceKnowledgeProfile,
  buildResourceRelations,
} from '~~/server/services/resource-knowledge'
import { withClient, withTransaction } from '~~/server/utils/db'
import { listAdminResources } from '~~/server/utils/contest-store'
import {
  buildContestRuleContext,
  simulateRuleVersion,
} from '~~/server/utils/rule-store'
import {
  claimNextQueuedResourceGovernanceTask,
  enqueueResourceGovernanceTask,
  finishResourceGovernanceTaskFailure,
  finishResourceGovernanceTaskSuccess,
  getResourceKnowledgeContext,
  getResourceKnowledgeProfileByResourceId,
  listContestResourcesWithKnowledge,
  listResourceKnowledgeProfilesByContest,
  replaceResourceRelations,
  resetStaleResourceGovernanceTasks,
  upsertResourceKnowledgeProfile,
} from '~~/server/utils/resource-knowledge-store'

const WORKER_STATE_KEY = Symbol.for('winloop.resource-knowledge-worker.state')

interface WorkerState {
  started: boolean
  timer: NodeJS.Timeout | null
  ticking: boolean
}

function getWorkerState(): WorkerState {
  const globalRef = globalThis as Record<symbol, unknown>
  const existing = globalRef[WORKER_STATE_KEY] as WorkerState | undefined
  if (existing)
    return existing

  const created: WorkerState = {
    started: false,
    timer: null,
    ticking: false,
  }
  globalRef[WORKER_STATE_KEY] = created
  return created
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value.map(item => normalizeString(item)).filter(Boolean)
}

function toErrorMessage(error: unknown): string {
  if (!error)
    return 'unknown error'
  if (error instanceof Error)
    return error.message || 'unknown error'
  return String(error)
}

function clampScore(value: number): number {
  if (!Number.isFinite(value))
    return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function hasManualOverride(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record || {}, key)
}

function dedupeRuleIssues(issues: ResourceQualityIssue[]): ResourceQualityIssue[] {
  const seen = new Set<string>()
  const result: ResourceQualityIssue[] = []
  for (const issue of issues) {
    const key = `${normalizeString(issue.code)}:${normalizeString(issue.field)}`
    if (!normalizeString(issue.code) || seen.has(key))
      continue
    seen.add(key)
    result.push(issue)
  }
  return result
}

async function applyRuleEvaluation(
  db: Queryable,
  context: ResourceKnowledgeContext,
  analysis: Awaited<ReturnType<typeof analyzeResourceKnowledgeProfile>>,
) {
  try {
    const baseContext = await buildContestRuleContext(db, context.contest.id)
    const simulation = await simulateRuleVersion(db, {
      context: {
        ...baseContext,
        resource: {
          id: context.resource.id,
          title: context.resource.title,
          category: context.resource.category || '',
          predictedCategory: analysis.predictedCategory,
          year: context.resource.year,
          availability: context.resource.availability,
          sourceType: context.resource.sourceType || '',
          summary: context.resource.summary,
          content: context.resource.content || '',
          copyrightNote: context.resource.copyrightNote,
          status: context.resource.status || 'active',
          metadata: context.resource.metadata || {},
        },
        knowledge: {
          predictedCategory: analysis.predictedCategory,
          categoryConfidence: analysis.categoryConfidence,
          aiTags: analysis.aiTags,
          majorTags: analysis.majorTags,
          stageTags: analysis.stageTags,
          qualityScore: analysis.qualityScore,
          valueScore: analysis.valueScore,
          hotScore: analysis.hotScore,
          governanceStatus: analysis.governanceStatus,
          issues: analysis.qualityIssues,
        },
        document: context.documentAnalysis
          ? {
              pageCount: context.documentAnalysis.pages?.length || 0,
              pages: context.documentAnalysis.pages || [],
            }
          : null,
      },
      fallbackPublished: true,
    })

    const ruleCategoryMap = new Map<string, RuleDefinition['category']>(
      simulation.results.map(rule => [rule.id, rule.category]),
    )
    const hits = simulation.engine.results.filter((result: RuleResult) => {
      if (result.passed || result.skipped)
        return false
      const category = ruleCategoryMap.get(result.ruleId)
      return category === 'quality' || category === 'compliance'
    })

    if (hits.length === 0) {
      return {
        qualityScore: analysis.qualityScore,
        governanceStatus: analysis.governanceStatus,
        qualityIssues: analysis.qualityIssues,
        analysisPayload: {
          ...analysis.analysisPayload,
          ruleHits: [],
        },
        componentScores: {
          ...analysis.componentScores,
          ruleHitCount: 0,
        },
      }
    }

    const manualOverrides = analysis.manualOverrides || {}
    const extraIssues = hits.map((result) => ({
      code: `rule_${result.ruleCode}`,
      message: result.message,
      severity: result.severity === 'error' || result.severity === 'warning' || result.severity === 'info' ? result.severity : 'info',
      field: result.targetPath,
      scoreImpact: result.severity === 'error' ? 8 : result.severity === 'warning' ? 4 : 2,
    }))

    const mergedIssues = hasManualOverride(manualOverrides, 'qualityIssues')
      ? analysis.qualityIssues
      : dedupeRuleIssues([...analysis.qualityIssues, ...extraIssues])

    const penalty = hits.reduce((sum, result) => {
      if (result.severity === 'error')
        return sum + 8
      if (result.severity === 'warning')
        return sum + 4
      return sum + 2
    }, 0)

    const qualityScore = hasManualOverride(manualOverrides, 'qualityScore')
      ? analysis.qualityScore
      : clampScore(analysis.qualityScore - penalty)

    const governanceStatus = hasManualOverride(manualOverrides, 'governanceStatus')
      ? analysis.governanceStatus
      : hits.some(hit => hit.severity === 'error' && normalizeString(hit.targetPath).includes('copyright'))
          ? 'suggested_invalid'
          : analysis.governanceStatus

    return {
      qualityScore,
      governanceStatus,
      qualityIssues: mergedIssues,
      analysisPayload: {
        ...analysis.analysisPayload,
        ruleHits: hits.map(hit => ({
          ruleId: hit.ruleId,
          ruleCode: hit.ruleCode,
          severity: hit.severity,
          message: hit.message,
          targetPath: hit.targetPath,
        })),
      },
      componentScores: {
        ...analysis.componentScores,
        ruleHitCount: hits.length,
      },
    }
  }
  catch (error) {
    const message = toErrorMessage(error)
    if (message === 'RULE_VERSION_NOT_FOUND')
      return null
    console.error('[resource-knowledge-worker] rule evaluation failed:', message)
    return null
  }
}

async function processProfileAnalyzeTask(
  task: Awaited<ReturnType<typeof claimNextQueuedResourceGovernanceTask>>,
): Promise<Record<string, unknown>> {
  if (!task)
    return {}

  if (!task.resourceId) {
    return withTransaction(undefined, async (db) => {
      const resources = await listAdminResources(db, {
        contestId: task.contestId,
      })
      let enqueued = 0
      for (const resource of resources) {
        await enqueueResourceGovernanceTask(db, {
          contestId: task.contestId,
          resourceId: resource.id,
          taskType: 'profile_analyze',
        })
        enqueued += 1
      }
      return { enqueuedResources: enqueued }
    })
  }

  const context = await withClient(undefined, async db => getResourceKnowledgeContext(db, {
    contestId: task.contestId,
    resourceId: task.resourceId!,
  }))
  if (!context)
    return { skipped: true, reason: 'resource_not_found' }

  const analysis = await analyzeResourceKnowledgeProfile({
    contest: context.contest,
    resource: context.resource,
    documentAnalysis: context.documentAnalysis,
    searchMetrics: context.searchMetrics,
    existingProfile: context.existingProfile,
  })

  const ruleEvaluation = await withClient(undefined, async db => applyRuleEvaluation(db, context, analysis))
  const nextProfile = {
    ...analysis,
    qualityScore: ruleEvaluation?.qualityScore ?? analysis.qualityScore,
    governanceStatus: ruleEvaluation?.governanceStatus ?? analysis.governanceStatus,
    qualityIssues: ruleEvaluation?.qualityIssues ?? analysis.qualityIssues,
    analysisPayload: ruleEvaluation?.analysisPayload ?? analysis.analysisPayload,
    componentScores: ruleEvaluation?.componentScores ?? analysis.componentScores,
  }

  await withTransaction(undefined, async (db) => {
    await upsertResourceKnowledgeProfile(db, {
      contestId: task.contestId,
      resourceId: task.resourceId!,
      profile: nextProfile,
    })
    await enqueueResourceGovernanceTask(db, {
      contestId: task.contestId,
      resourceId: task.resourceId!,
      taskType: 'relation_refresh',
    })
    await enqueueResourceGovernanceTask(db, {
      contestId: task.contestId,
      resourceId: task.resourceId!,
      taskType: 'governance_apply',
    })
  })

  return {
    resourceId: task.resourceId,
    predictedCategory: nextProfile.predictedCategory,
    qualityScore: nextProfile.qualityScore,
    valueScore: nextProfile.valueScore,
    hotScore: nextProfile.hotScore,
    governanceStatus: nextProfile.governanceStatus,
    issueCount: nextProfile.qualityIssues.length,
  }
}

async function processRelationRefreshTask(
  task: Awaited<ReturnType<typeof claimNextQueuedResourceGovernanceTask>>,
): Promise<Record<string, unknown>> {
  if (!task)
    return {}

  const resources = await withClient(undefined, async db => listContestResourcesWithKnowledge(db, {
    contestId: task.contestId,
    includeInternal: true,
  }))
  const profiles = await withClient(undefined, async db => listResourceKnowledgeProfilesByContest(db, {
    contestId: task.contestId,
    resourceIds: resources.map(item => item.id),
  }))

  const resourceMap = new Map(resources.map(item => [item.id, item]))
  const profileMap = new Map(profiles.map(item => [item.resourceId, item]))
  const sourceIds = task.resourceId
    ? [task.resourceId]
    : profiles.map(item => item.resourceId)

  let updatedSources = 0
  for (const sourceId of sourceIds) {
    const source = resourceMap.get(sourceId)
    const sourceProfile = profileMap.get(sourceId)
    if (!source || !sourceProfile)
      continue

    const targets: Array<{ resource: Resource, profile: ResourceKnowledgeProfile }> = profiles
      .filter(item => item.resourceId !== sourceId)
      .flatMap((profile) => {
        const resource = resourceMap.get(profile.resourceId)
        return resource ? [{ resource, profile }] : []
      })

    const relations = buildResourceRelations({
      source,
      sourceProfile,
      targets,
    })

    await withTransaction(undefined, async (db) => {
      await replaceResourceRelations(db, {
        contestId: task.contestId,
        sourceResourceId: sourceId,
        relations,
      })
    })
    updatedSources += 1
  }

  return {
    updatedSources,
  }
}

async function processGovernanceApplyTask(
  task: Awaited<ReturnType<typeof claimNextQueuedResourceGovernanceTask>>,
): Promise<Record<string, unknown>> {
  if (!task?.resourceId)
    return { skipped: true, reason: 'resource_id_required' }

  const context = await withClient(undefined, async db => getResourceKnowledgeContext(db, {
    contestId: task.contestId,
    resourceId: task.resourceId!,
  }))
  if (!context)
    return { skipped: true, reason: 'resource_not_found' }

  const profile = await withClient(undefined, async db => getResourceKnowledgeProfileByResourceId(db, {
    contestId: task.contestId,
    resourceId: task.resourceId!,
  }))
  if (!profile)
    return { skipped: true, reason: 'profile_not_found' }

  const suggestions: Array<Record<string, unknown>> = []
  if (profile.predictedCategory && profile.predictedCategory !== context.resource.category) {
    suggestions.push({
      action: 'reclassify',
      suggestedCategory: profile.predictedCategory,
      confidence: profile.categoryConfidence,
    })
  }
  if (profile.aiTags.length > 0) {
    suggestions.push({
      action: 'retag',
      tags: profile.aiTags,
      majorTags: profile.majorTags,
      stageTags: profile.stageTags,
    })
  }
  suggestions.push({
    action: 'rescore',
    qualityScore: profile.qualityScore,
    valueScore: profile.valueScore,
    hotScore: profile.hotScore,
  })
  if (profile.governanceStatus === 'suggested_invalid') {
    suggestions.push({
      action: 'suggest_offline',
      reason: 'quality_or_compliance_risk',
    })
  }
  if (profile.governanceStatus === 'suggested_archive') {
    suggestions.push({
      action: 'suggest_archive',
      reason: 'low_hot_and_old_resource',
    })
  }
  if (profile.qualityIssues.some(issue => ['content_missing', 'summary_missing', 'copyright_missing'].includes(normalizeString(issue.code)))) {
    suggestions.push({
      action: 'suggest_supply',
      issues: profile.qualityIssues.map(issue => issue.code),
    })
  }

  return {
    resourceId: task.resourceId,
    governanceStatus: profile.governanceStatus,
    suggestions,
  }
}

async function processSearchMetricRollupTask(
  task: Awaited<ReturnType<typeof claimNextQueuedResourceGovernanceTask>>,
): Promise<Record<string, unknown>> {
  if (!task)
    return {}

  const payload = task.payload || {}
  const resourceIds = [...new Set([
    normalizeString(task.resourceId),
    normalizeString(payload.resourceId),
    ...normalizeStringArray(payload.resourceIds),
  ].filter(Boolean))]

  let enqueued = 0
  await withTransaction(undefined, async (db) => {
    for (const resourceId of resourceIds) {
      await enqueueResourceGovernanceTask(db, {
        contestId: task.contestId,
        resourceId,
        taskType: 'profile_analyze',
      })
      enqueued += 1
    }
  })

  return {
    enqueuedProfiles: enqueued,
    resourceIds,
  }
}

async function processSingleTask(): Promise<boolean> {
  const task = await withTransaction(undefined, async db => claimNextQueuedResourceGovernanceTask(db))
  if (!task)
    return false

  try {
    let resultPayload: Record<string, unknown> = {}
    if (task.taskType === 'profile_analyze')
      resultPayload = await processProfileAnalyzeTask(task)
    else if (task.taskType === 'relation_refresh')
      resultPayload = await processRelationRefreshTask(task)
    else if (task.taskType === 'governance_apply')
      resultPayload = await processGovernanceApplyTask(task)
    else if (task.taskType === 'search_metric_rollup')
      resultPayload = await processSearchMetricRollupTask(task)

    await withTransaction(undefined, async (db) => {
      await finishResourceGovernanceTaskSuccess(db, {
        taskId: task.id,
        resultPayload,
      })
    })
  }
  catch (error) {
    const errorMessage = toErrorMessage(error)
    await withTransaction(undefined, async (db) => {
      await finishResourceGovernanceTaskFailure(db, {
        taskId: task.id,
        attempt: task.attempt,
        maxAttempt: task.maxAttempt,
        errorMessage,
        resultPayload: {
          message: errorMessage,
        },
      })
    })
  }

  return true
}

function logWorkerError(stage: 'bootstrap' | 'tick', error: unknown): void {
  const prefix = stage === 'bootstrap'
    ? '[resource-knowledge-worker] bootstrap failed:'
    : '[resource-knowledge-worker] tick failed:'
  console.error(prefix, toErrorMessage(error))
}

async function runTick(state: WorkerState): Promise<void> {
  if (state.ticking)
    return

  state.ticking = true
  try {
    let count = 0
    while (count < 2) {
      const hasTask = await processSingleTask()
      if (!hasTask)
        break
      count += 1
    }
  }
  catch (error) {
    logWorkerError('tick', error)
  }
  finally {
    state.ticking = false
  }
}

export default defineNitroPlugin((nitroApp) => {
  const state = getWorkerState()
  if (state.started)
    return

  state.started = true
  void withClient(undefined, async (db) => {
    await resetStaleResourceGovernanceTasks(db, {
      staleMinutes: 15,
    })
  }).catch((error) => {
    logWorkerError('bootstrap', error)
  })

  const intervalMs = 3000
  state.timer = setInterval(() => {
    void runTick(state)
  }, intervalMs)
  state.timer.unref?.()

  nitroApp.hooks.hookOnce('close', () => {
    if (state.timer)
      clearInterval(state.timer)
    state.timer = null
    state.started = false
  })
})

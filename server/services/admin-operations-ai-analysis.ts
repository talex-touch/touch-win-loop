import type { H3Event } from 'h3'
import type { Queryable } from '~~/server/utils/db'
import type { RuntimeSettings } from '~~/server/utils/env'
import type {
  AdminOperationsAiAnalysisResult,
  AdminOperationsAiAnalysisRunResult,
  AdminOperationsAiAnalysisSnapshot,
  AdminOperationsAiAnalysisStatus,
  AdminOperationsTone,
} from '~~/shared/types/admin-operations'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'
import { createChatModel } from '~~/server/services/ai/llm-client'
import { buildAdminMeetingRuntimeSnapshot } from '~~/server/services/meeting/runtime-monitoring'
import {
  getAdminOperationsEfficiency,
  getAdminOperationsOverview,
  getAdminOperationsRisks,
} from '~~/server/utils/admin-operations-store'
import { runWithPlatformAiChannelFallback } from '~~/server/utils/platform-ai-channels'
import { readEffectivePlatformRuntimeSettings } from '~~/server/utils/platform-runtime-config-store'

export const ADMIN_OPERATIONS_AI_ANALYSIS_CHANNEL = 'admin_operations_analysis'
export const ADMIN_OPERATIONS_AI_ANALYSIS_STALE_MS = 8 * 60 * 60 * 1000

const analysisSchema = z.object({
  summary: z.string().default(''),
  riskLevel: z.enum(['neutral', 'info', 'success', 'warning', 'danger']).default('neutral'),
  keyRisks: z.array(z.string()).default([]),
  slaNotes: z.array(z.string()).default([]),
  actions: z.array(z.string()).default([]),
  citations: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).default([]),
})

let cachedSnapshot: AdminOperationsAiAnalysisSnapshot = buildIdleSnapshot()
let runningPromise: Promise<AdminOperationsAiAnalysisRunResult> | null = null

function toIsoNow(): string {
  return new Date().toISOString()
}

function addMs(value: string, ms: number): string {
  return new Date(new Date(value).getTime() + ms).toISOString()
}

function isStale(lastRunAt: string | null): boolean {
  if (!lastRunAt)
    return true
  const time = new Date(lastRunAt).getTime()
  return !Number.isFinite(time) || Date.now() - time >= ADMIN_OPERATIONS_AI_ANALYSIS_STALE_MS
}

function buildIdleSnapshot(): AdminOperationsAiAnalysisSnapshot {
  return {
    status: 'idle',
    stale: true,
    expiresAt: null,
    lastRunAt: null,
    result: null,
    error: '',
    provider: '',
    model: '',
    fallbackUsed: false,
    attempts: 0,
  }
}

function normalizeStatus(snapshot: AdminOperationsAiAnalysisSnapshot): AdminOperationsAiAnalysisSnapshot {
  const stale = isStale(snapshot.lastRunAt)
  const status: AdminOperationsAiAnalysisStatus = snapshot.status === 'completed' && stale ? 'stale' : snapshot.status
  return {
    ...snapshot,
    status,
    stale,
    expiresAt: snapshot.lastRunAt ? addMs(snapshot.lastRunAt, ADMIN_OPERATIONS_AI_ANALYSIS_STALE_MS) : null,
  }
}

function toCompactJson(value: unknown): string {
  return JSON.stringify(value, null, 2).slice(0, 18000)
}

function extractTextContent(value: unknown): string {
  if (typeof value === 'string')
    return value
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string')
          return item
        if (item && typeof item === 'object' && 'text' in item)
          return String((item as { text?: unknown }).text || '')
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return String(value || '')
}

function parseLooseJson(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed)
    return null
  try {
    return JSON.parse(trimmed)
  }
  catch {
    const matched = trimmed.match(/\{[\s\S]*\}/)
    if (!matched)
      return null
    return JSON.parse(matched[0])
  }
}

function normalizeAnalysis(raw: unknown): AdminOperationsAiAnalysisResult {
  const parsed = analysisSchema.parse(raw || {})
  return {
    summary: parsed.summary || 'AI 未返回摘要。',
    riskLevel: parsed.riskLevel as AdminOperationsTone,
    keyRisks: parsed.keyRisks.filter(Boolean).slice(0, 5),
    slaNotes: parsed.slaNotes.filter(Boolean).slice(0, 5),
    actions: parsed.actions.filter(Boolean).slice(0, 5),
    citations: parsed.citations.filter(item => item.label && item.value).slice(0, 8),
    generatedAt: toIsoNow(),
  }
}

async function buildOperationsContext(db: Queryable, event: H3Event, runtime: RuntimeSettings) {
  const [overview, efficiency, risks, meeting] = await Promise.all([
    getAdminOperationsOverview(db, event),
    getAdminOperationsEfficiency(db),
    getAdminOperationsRisks(db, event),
    buildAdminMeetingRuntimeSnapshot(runtime),
  ])

  return {
    overview: {
      generatedAt: overview.generatedAt,
      cards: overview.cards,
      trend: overview.trend,
      todos: overview.todos,
    },
    efficiency: {
      generatedAt: efficiency.generatedAt,
      summary: efficiency.summary,
      systems: efficiency.systems.map(item => ({
        key: item.key,
        label: item.label,
        health: item.health,
        successRate: item.successRate,
        backlog: item.backlog,
        lastResult: item.lastResult,
      })),
      recentFailures: efficiency.recentFailures.slice(0, 8),
    },
    risks: {
      generatedAt: risks.generatedAt,
      summary: risks.summary,
      alerts: risks.alerts.slice(0, 8),
    },
    meeting: {
      generatedAt: meeting.generatedAt,
      prometheusBaseUrlConfigured: meeting.prometheusBaseUrlConfigured,
      capacity: meeting.capacity,
      host: meeting.host,
      livekit: meeting.livekit,
      egress: meeting.egress,
      issues: meeting.issues,
    },
  }
}

function buildAnalysisPromptValue(input: {
  channelPrompt: string
  context: unknown
}) {
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', [
      '你是 WinLoop 后台运营 AI 分析场景。',
      input.channelPrompt,
      '只基于用户提供的运营快照分析，不要编造未提供的指标。',
      '输出必须是 JSON，字段为 summary、riskLevel、keyRisks、slaNotes、actions、citations。',
      'riskLevel 只能是 neutral、info、success、warning、danger。',
      'citations 用于引用关键指标，格式为 { "label": "...", "value": "..." }。',
    ].filter(Boolean).join('\n')],
    ['human', [
      '请分析以下运营快照，给出平台运营风险、SLA 解读和下一步动作。',
      '要求：摘要 1 句话；keyRisks、slaNotes、actions 各不超过 5 条；仅返回 JSON。',
      `运营快照：\n${toCompactJson(input.context)}`,
    ].join('\n\n')],
  ])
  return promptTemplate.invoke({})
}

async function invokeOperationsAi(runtime: RuntimeSettings, context: unknown) {
  const execution = await runWithPlatformAiChannelFallback(runtime, ADMIN_OPERATIONS_AI_ANALYSIS_CHANNEL, async ({ ai, prompt }) => {
    const model = createChatModel({
      ...ai,
      temperature: 0.1,
      maxRetries: 0,
    })
    const promptValue = await buildAnalysisPromptValue({
      channelPrompt: prompt,
      context,
    })
    const output = await model.invoke(promptValue)
    return {
      prompt,
      content: extractTextContent(output.content),
    }
  })

  return execution
}

async function runAnalysisInternal(event: H3Event, db: Queryable): Promise<AdminOperationsAiAnalysisRunResult> {
  const startedSnapshot: AdminOperationsAiAnalysisSnapshot = {
    ...cachedSnapshot,
    status: 'running',
    stale: isStale(cachedSnapshot.lastRunAt),
    error: '',
  }
  cachedSnapshot = startedSnapshot

  const runtime = await readEffectivePlatformRuntimeSettings(event)
  const context = await buildOperationsContext(db, event, runtime.runtime)

  try {
    const execution = await invokeOperationsAi(runtime.runtime, context)
    const content = execution.data.content
    const analysis = normalizeAnalysis(parseLooseJson(content))
    cachedSnapshot = normalizeStatus({
      status: 'completed',
      stale: false,
      expiresAt: addMs(analysis.generatedAt, ADMIN_OPERATIONS_AI_ANALYSIS_STALE_MS),
      lastRunAt: analysis.generatedAt,
      result: analysis,
      error: '',
      provider: execution.ai.provider,
      model: execution.ai.model,
      fallbackUsed: execution.usedFallback,
      attempts: execution.attemptChain.length,
    })
  }
  catch (error) {
    cachedSnapshot = normalizeStatus({
      ...cachedSnapshot,
      status: cachedSnapshot.result ? 'completed' : 'failed',
      error: error instanceof Error ? (error.message || 'AI_ANALYSIS_FAILED') : 'AI_ANALYSIS_FAILED',
    })
  }

  return {
    ...cachedSnapshot,
    triggered: true,
  }
}

export function getAdminOperationsAiAnalysisSnapshot(): AdminOperationsAiAnalysisSnapshot {
  return normalizeStatus(cachedSnapshot)
}

export async function runAdminOperationsAiAnalysis(input: {
  event: H3Event
  db: Queryable
  force?: boolean
}): Promise<AdminOperationsAiAnalysisRunResult> {
  const snapshot = getAdminOperationsAiAnalysisSnapshot()
  if (!input.force && snapshot.result && !snapshot.stale) {
    return {
      ...snapshot,
      triggered: false,
    }
  }

  if (!runningPromise) {
    runningPromise = runAnalysisInternal(input.event, input.db)
      .finally(() => {
        runningPromise = null
      })
  }

  return runningPromise
}

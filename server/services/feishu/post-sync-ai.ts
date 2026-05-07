import type { H3Event } from 'h3'
import type { FeishuBitableSyncItemEntityType } from '~~/shared/types/domain'
import {
  analyzeKnowledgeEntity,
  createKnowledgeEmbedding,
} from '~~/server/services/knowledge-ai'

export interface FeishuEmbeddingResult {
  embedding: number[]
  provider: string
  model: string
  fallbackUsed: boolean
  attempts: number
}

export interface FeishuEntityAnalysisResult {
  summary: string
  keywords: string[]
  risks: string[]
  suggestedActions: string[]
  qualityScore: number
  provider: string
  model: string
  fallbackUsed: boolean
  attempts: number
}

export async function createFeishuEmbedding(input: {
  text: string
  event?: H3Event
}): Promise<FeishuEmbeddingResult> {
  return createKnowledgeEmbedding(input)
}

export async function analyzeFeishuEntity(input: {
  scope: FeishuBitableSyncItemEntityType
  text: string
  event?: H3Event
}): Promise<FeishuEntityAnalysisResult> {
  return analyzeKnowledgeEntity({
    scope: input.scope,
    text: input.text,
    event: input.event,
    systemPrompt: '你是数据治理分析助手。请基于输入内容输出结构化 JSON，总结、关键词、风险和建议动作。',
  })
}

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const KNOWLEDGE_AI_FILE = resolve(process.cwd(), 'server/services/knowledge-ai.ts')
const KNOWLEDGE_WORKER_FILE = resolve(process.cwd(), 'server/plugins/project-knowledge-worker.ts')
const KNOWLEDGE_STORE_FILE = resolve(process.cwd(), 'server/utils/project-knowledge-store.ts')
const KNOWLEDGE_CONTEXT_FILE = resolve(process.cwd(), 'server/services/ai/project-knowledge-context.ts')
const RUNTIME_ROUTE_FILE = resolve(process.cwd(), 'server/api/user/ai/runtime.get.ts')

describe('project knowledge embedding governance', () => {
  it('knowledge-ai 已补齐 runtime profile、signature、failureReason 与短 TTL cache', async () => {
    const source = await readFile(KNOWLEDGE_AI_FILE, 'utf8')

    assert.match(source, /export interface KnowledgeEmbeddingRuntimeProfile \{/, 'knowledge-ai 未暴露统一 runtime profile')
    assert.match(source, /runtimeVersion: string/, 'knowledge-ai 结果未包含 runtimeVersion')
    assert.match(source, /signature: EmbeddingSignature/, 'knowledge-ai 结果未包含 signature')
    assert.match(source, /failureReason\?: string/, 'knowledge-ai 结果未包含 failureReason')
    assert.match(source, /const KNOWLEDGE_EMBEDDING_CACHE_TTL_MS = 45_000/, 'knowledge-ai 未提供短 TTL embedding cache')
    assert.match(source, /function buildKnowledgeEmbeddingCacheKey\(/, 'knowledge-ai 未生成稳定 cache key')
    assert.match(source, /function resolveKnowledgeEmbeddingFailureReason\(/, 'knowledge-ai 未归一化 embedding 失败原因')
    assert.match(source, /export async function resolveKnowledgeEmbeddingRuntimeProfile\(/, 'knowledge-ai 未暴露统一 runtime profile 解析函数')
    assert.match(source, /resolvePlatformAiChannelEmbeddingApiStyle\(embeddingChannelKey\) \|\| undefined/, 'knowledge-ai 未把 channel apiStyle 的 null fallback 收口为 undefined')
    assert.match(source, /throw new Error\('EMBEDDING_RUNTIME_NOT_CONFIGURED'\)/, 'knowledge-ai 未在 runtime 不可用时阻断写入')
    assert.doesNotMatch(source, /buildDeterministicKnowledgeEmbedding/, 'knowledge-ai 仍保留 deterministic embedding 伪向量')
    assert.doesNotMatch(source, /fallback: \(\) => .*Embedding/, 'knowledge-ai 仍在 embedding 请求失败时生成 fallback 向量')
    assert.match(source, /getKnowledgeEmbeddingCache\(\)\.set\(cacheKey, \{/, 'knowledge-ai 未在查询路径写入 embedding cache')
  })

  it('knowledge-ai 不再把实体分析失败包装成规则 fallback 结果', async () => {
    const source = await readFile(KNOWLEDGE_AI_FILE, 'utf8')

    assert.match(source, /throw new Error\('KNOWLEDGE_ENTITY_ANALYSIS_EMPTY_INPUT'\)/, '实体分析未对空内容做严格失败')
    assert.match(source, /throw new Error\('KNOWLEDGE_ENTITY_ANALYSIS_RUNTIME_NOT_CONFIGURED'\)/, '实体分析未对缺配置做严格失败')
    assert.doesNotMatch(source, /buildAnalysisFallback/, '实体分析仍保留规则 fallback 生成器')
    assert.doesNotMatch(source, /fallback:\s*\(\)\s*=>\s*\(\{[\s\S]*qualityScore/, '实体分析请求失败不应返回规则 fallback 结果')
  })

  it('worker 会把 embedding signature、runtimeVersion 与 failureReason 持久化到 chunk metadata', async () => {
    const source = await readFile(KNOWLEDGE_WORKER_FILE, 'utf8')

    assert.match(source, /embeddingRuntimeVersion: embeddingResult\.runtimeVersion/, 'knowledge worker 未持久化 embeddingRuntimeVersion')
    assert.match(source, /embeddingSignature: embeddingResult\.signature/, 'knowledge worker 未持久化 embeddingSignature')
    assert.match(source, /embeddingFailureReason: embeddingResult\.failureReason/, 'knowledge worker 未持久化 embeddingFailureReason')
  })

  it('knowledge store 已补齐 signature mismatch、自动 backfill 与 pgvector 预选检索', async () => {
    const source = await readFile(KNOWLEDGE_STORE_FILE, 'utf8')

    assert.match(source, /interface ProjectKnowledgeBackfillRuntimeSnapshot \{/, 'knowledge store 缺少 backfill runtime snapshot')
    assert.match(source, /signature_mismatch_count: string/, 'knowledge store 统计行缺少 signature mismatch 计数')
    assert.match(source, /async function resolveProjectKnowledgeBackfillRuntimeSnapshot\(/, 'knowledge store 未计算当前 embedding runtime snapshot')
    assert.match(source, /signatureMismatchChunkCount:/, 'knowledge store 未聚合 signature mismatch chunk 计数')
    assert.match(source, /const hasBackfillCandidate = runtimeSnapshot\.embeddingConfigured/, 'knowledge store 未识别 runtime 恢复后的 backfill 候选资源')
    assert.match(source, /else if \(hasBackfillCandidate && existing\.status === 'ready'\) \{\s*nextStatus = 'stale'/, 'knowledge store 未在 runtime 恢复后自动把 degraded source 标记为 stale')
    assert.match(source, /taskType: hashChanged \|\| versionChanged \|\| hasBackfillCandidate \? 'reindex' : 'upsert'/, 'knowledge store 未把 backfill 统一走 reindex')
    assert.match(source, /signatureMismatchSourceCount/, 'knowledge dashboard 未暴露 signatureMismatchSourceCount')
    assert.match(source, /backfillPendingCount/, 'knowledge dashboard 未暴露 backfillPendingCount')
    assert.match(source, /backfillRunningCount/, 'knowledge dashboard 未暴露 backfillRunningCount')
    assert.match(source, /lastHealthyAt/, 'knowledge dashboard 未暴露 lastHealthyAt')
    assert.match(source, /rebuildRecommended:/, 'knowledge dashboard 未暴露 rebuildRecommended')
    assert.match(source, /export async function listProjectKnowledgeSearchChunksByVectorPreselect\(/, 'knowledge store 缺少 pgvector 预选查询')
    assert.match(source, /ORDER BY pkc\.embedding <=> \$4::vector ASC/, 'knowledge store 未按 pgvector 距离做数据库预选')
  })

  it('knowledge context 已切到向量预选加 rerank，并显式暴露 degraded warning', async () => {
    const source = await readFile(KNOWLEDGE_CONTEXT_FILE, 'utf8')

    assert.match(source, /listProjectKnowledgeSearchChunksByVectorPreselect/, 'knowledge context 未接入向量预选')
    assert.match(source, /\.filter\(item => item\.result\.embedding\.length > 0 && !item\.result\.fallbackUsed\)/, 'knowledge context 未在真实 query embedding 下优先走 vector preselect')
    assert.match(source, /catch \(error\)[\s\S]*failureReason: resolveKnowledgeEmbeddingFailureReason\(error\)/, 'knowledge context 未把 query embedding 失败收敛为空向量告警')
    assert.match(source, /Query embedding 当前处于 degraded 状态/, 'knowledge context 未显式标记 query embedding degraded')
    assert.match(source, /知识索引当前状态：\$\{dashboard\.diagnostics\.healthMessage\}/, 'knowledge context 未把 dashboard degraded 状态写入 warning')
    assert.match(source, /usedFallback: degradedResultUsed/, 'knowledge context 未把 degraded 查询结果回传为 usedFallback')
  })

  it('用户 AI runtime 接口已补齐 embedding 通道健康态与写链路阻断位', async () => {
    const source = await readFile(RUNTIME_ROUTE_FILE, 'utf8')

    assert.match(source, /knowledgeEmbedding:/, 'user runtime 接口未返回 knowledgeEmbedding')
    assert.match(source, /knowledgeVisualEmbedding:/, 'user runtime 接口未返回 knowledgeVisualEmbedding')
    assert.match(source, /degraded:/, 'user runtime 接口未返回 degraded 标记')
    assert.match(source, /writeBlocked:/, 'user runtime 接口未返回 writeBlocked 标记')
    assert.match(source, /rebuildRecommended:/, 'user runtime 接口未返回 rebuildRecommended 标记')
  })
})

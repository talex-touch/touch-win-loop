<script setup lang="ts">
import type {
  ChatMessage,
  ProjectKnowledgeCitation,
  ProjectKnowledgeCitationLocator,
  ProjectKnowledgeCitationSourceScope,
  ProjectKnowledgeEvidencePath,
  ProjectKnowledgeMessagePayload,
  ProjectKnowledgeModality,
  ProjectKnowledgeProjectionType,
  ProjectKnowledgeRetrievalIntent,
  ProjectKnowledgeRetrievalPlan,
  ProjectKnowledgeRetrievalPlannerSource,
  ProjectKnowledgeSourceStatus,
} from '~~/shared/types/domain'
import { computed, ref } from 'vue'

const props = defineProps<{
  message: ChatMessage
}>()

const emit = defineEmits<{
  openResource: [resourceId: string]
}>()

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRetrievalPlan(value: unknown): ProjectKnowledgeRetrievalPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null
  const candidate = value as Record<string, unknown>
  const intent = normalizeString(candidate.intent) || 'direct_answer'
  const plannerSource = normalizeString(candidate.plannerSource) || 'heuristic'
  return {
    intent: intent as ProjectKnowledgeRetrievalIntent,
    queryVariants: Array.isArray(candidate.queryVariants)
      ? candidate.queryVariants.map(item => normalizeString(item)).filter(Boolean)
      : [],
    preferredModalities: Array.isArray(candidate.preferredModalities)
      ? candidate.preferredModalities.map(item => normalizeString(item)).filter(Boolean) as ProjectKnowledgeRetrievalPlan['preferredModalities']
      : [],
    preferredProjectionTypes: Array.isArray(candidate.preferredProjectionTypes)
      ? candidate.preferredProjectionTypes.map(item => normalizeString(item)).filter(Boolean) as ProjectKnowledgeRetrievalPlan['preferredProjectionTypes']
      : [],
    preferredEmbeddingStatuses: Array.isArray(candidate.preferredEmbeddingStatuses)
      ? candidate.preferredEmbeddingStatuses.map(item => normalizeString(item)).filter(Boolean) as ProjectKnowledgeRetrievalPlan['preferredEmbeddingStatuses']
      : [],
    relationTypes: Array.isArray(candidate.relationTypes)
      ? candidate.relationTypes.map(item => normalizeString(item)).filter(Boolean) as ProjectKnowledgeRetrievalPlan['relationTypes']
      : [],
    retrievalBudget: Number.isFinite(Number(candidate.retrievalBudget)) ? Number(candidate.retrievalBudget) : 0,
    plannerSource: plannerSource as ProjectKnowledgeRetrievalPlannerSource,
    reasoning: normalizeString(candidate.reasoning) || undefined,
  }
}

function normalizeEvidencePaths(value: unknown): ProjectKnowledgeEvidencePath[] {
  if (!Array.isArray(value))
    return []
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    .map((item) => {
      return {
        id: normalizeString(item.id),
        relationType: normalizeString(item.relationType) as ProjectKnowledgeEvidencePath['relationType'],
        sourceNodeType: normalizeString(item.sourceNodeType) as ProjectKnowledgeEvidencePath['sourceNodeType'],
        sourceNodeId: normalizeString(item.sourceNodeId),
        sourceLabel: normalizeString(item.sourceLabel),
        targetNodeType: normalizeString(item.targetNodeType) as ProjectKnowledgeEvidencePath['targetNodeType'],
        targetNodeId: normalizeString(item.targetNodeId),
        targetLabel: normalizeString(item.targetLabel),
        score: Number.isFinite(Number(item.score)) ? Number(item.score) : 0,
        evidenceMetric: normalizeString(item.evidenceMetric),
        evidenceModel: normalizeString(item.evidenceModel),
        citationChunkId: normalizeString(item.citationChunkId) || undefined,
        summary: normalizeString(item.summary),
      } satisfies ProjectKnowledgeEvidencePath
    })
    .filter(item => item.id && item.summary)
}

function normalizeKnowledge(value: unknown): ProjectKnowledgeMessagePayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null

  const candidate = value as Record<string, unknown>
  const rawCitations = Array.isArray(candidate.citations) ? candidate.citations : []
  return {
    citations: rawCitations
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
      .map((item) => {
        return {
          sourceId: normalizeString(item.sourceId),
          sourceResourceId: normalizeString(item.sourceResourceId) || null,
          chunkId: normalizeString(item.chunkId),
          resourceTitle: normalizeString(item.resourceTitle),
          label: normalizeString(item.label),
          sourceScope: (normalizeString(item.sourceScope) || 'project_resource') as ProjectKnowledgeCitationSourceScope,
          sourceStatus: (normalizeString(item.sourceStatus) || undefined) as ProjectKnowledgeSourceStatus | undefined,
          modality: (normalizeString(item.modality) || undefined) as ProjectKnowledgeModality | undefined,
          projectionType: (normalizeString(item.projectionType) || undefined) as ProjectKnowledgeProjectionType | undefined,
          page: Number.isFinite(Number(item.page)) ? Number(item.page) : undefined,
          section: normalizeString(item.section) || undefined,
          anchorId: normalizeString(item.anchorId) || undefined,
          nodeId: normalizeString(item.nodeId) || undefined,
          locator: item.locator && typeof item.locator === 'object' && !Array.isArray(item.locator)
            ? {
              page: Number.isFinite(Number((item.locator as Record<string, unknown>).page))
                ? Number((item.locator as Record<string, unknown>).page)
                : undefined,
              section: normalizeString((item.locator as Record<string, unknown>).section) || undefined,
              anchorId: normalizeString((item.locator as Record<string, unknown>).anchorId) || undefined,
              nodeId: normalizeString((item.locator as Record<string, unknown>).nodeId) || undefined,
              utteranceRange: normalizeString((item.locator as Record<string, unknown>).utteranceRange) || undefined,
              label: normalizeString((item.locator as Record<string, unknown>).label) || undefined,
            } satisfies ProjectKnowledgeCitationLocator
            : null,
          quote: normalizeString(item.quote) || undefined,
        } satisfies ProjectKnowledgeCitation
      })
      .filter(item => item.sourceId && item.chunkId),
    warning: normalizeString(candidate.warning),
    usedFallback: candidate.usedFallback === true,
    retrievalPlan: normalizeRetrievalPlan(candidate.retrievalPlan),
    evidencePaths: normalizeEvidencePaths(candidate.evidencePaths),
  }
}

const knowledge = computed(() => {
  if (props.message.role !== 'assistant')
    return null
  const metadata = props.message.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return null
  return normalizeKnowledge((metadata as Record<string, unknown>).knowledge)
})

const visibleCitations = computed(() => knowledge.value?.citations || [])
const retrievalPlan = computed(() => knowledge.value?.retrievalPlan || null)
const evidencePaths = computed(() => knowledge.value?.evidencePaths || [])
const visibleEvidencePaths = computed(() => evidencePaths.value.slice(0, 4))
const hasRetrievalPaths = computed(() => Boolean(retrievalPlan.value) || visibleEvidencePaths.value.length > 0)
const hasKnowledgePanel = computed(() => Boolean(knowledge.value?.warning) || visibleCitations.value.length > 0 || hasRetrievalPaths.value)
const citationsExpanded = ref(false)
const citationToggleLabel = computed(() => `资料引用(${visibleCitations.value.length})`)

function buildRetrievalIntentLabel(intent: ProjectKnowledgeRetrievalIntent | string | undefined): string {
  if (intent === 'evidence_trace')
    return '证据链'
  if (intent === 'global_summary')
    return '全局总结'
  if (intent === 'relation_explore')
    return '关系探索'
  if (intent === 'visual_lookup')
    return '视觉检索'
  if (intent === 'meeting_lookup')
    return '会议检索'
  return '直接问答'
}

function buildPlannerSourceLabel(source: ProjectKnowledgeRetrievalPlannerSource | string | undefined): string {
  if (source === 'llm')
    return 'LLM 规划'
  if (source === 'fallback')
    return '回退规划'
  return '启发式规划'
}

function buildCitationMeta(citation: ProjectKnowledgeCitation): string {
  const parts: string[] = []
  if (citation.sourceScope === 'platform_resource')
    parts.push('平台资料')
  else if (citation.sourceScope === 'contest_resource')
    parts.push('竞赛资料')
  else if (citation.sourceScope === 'meeting_artifact')
    parts.push('会议资料')
  else if (citation.sourceScope === 'canvas_resource')
    parts.push('画布资料')
  if (citation.page != null)
    parts.push(`第 ${citation.page} 页`)
  if (normalizeString(citation.section))
    parts.push(String(citation.section).trim())
  if (citation.locator?.utteranceRange)
    parts.push(`发言 ${citation.locator.utteranceRange}`)
  if (citation.locator?.nodeId || citation.nodeId)
    parts.push(`节点 ${citation.locator?.nodeId || citation.nodeId}`)
  if (citation.locator?.anchorId || citation.anchorId)
    parts.push(`锚点 ${citation.locator?.anchorId || citation.anchorId}`)
  return parts.join(' · ')
}

function buildCitationProjectionLabel(citation: ProjectKnowledgeCitation): string {
  if (citation.projectionType === 'image_summary' || citation.projectionType === 'document_visual_fallback')
    return '视觉投影'
  if (citation.projectionType === 'image_ocr')
    return 'OCR'
  if (citation.projectionType === 'meeting_notes')
    return '会议纪要'
  if (citation.projectionType === 'meeting_transcript')
    return '转写投影'
  if (citation.modality === 'draw')
    return '画布投影'
  return ''
}

function openCitationResource(citation: ProjectKnowledgeCitation): void {
  const resourceId = normalizeString(citation.sourceResourceId)
  if (!resourceId)
    return
  emit('openResource', resourceId)
}
</script>

<template>
  <div class="workspace-assistant-message-content">
    <WorkspaceChatMarkdown :content="props.message.content" />

    <section
      v-if="hasKnowledgePanel"
      class="workspace-assistant-message-content__knowledge"
      data-testid="workspace-assistant-knowledge-panel"
    >
      <div
        v-if="knowledge?.warning"
        class="workspace-assistant-message-content__warning"
        data-testid="workspace-assistant-knowledge-warning"
      >
        {{ knowledge.warning }}
      </div>

      <div
        v-if="visibleCitations.length > 0 || hasRetrievalPaths"
        class="workspace-assistant-message-content__citations"
      >
        <button
          class="workspace-assistant-message-content__citation-toggle"
          :class="{ 'workspace-assistant-message-content__citation-toggle--expanded': citationsExpanded }"
          type="button"
          data-testid="workspace-assistant-citation-toggle"
          :aria-expanded="citationsExpanded ? 'true' : 'false'"
          @click="citationsExpanded = !citationsExpanded"
        >
          <span class="workspace-assistant-message-content__citation-toggle-copy">
            {{ citationToggleLabel }}
          </span>
          <span
            v-if="knowledge?.usedFallback"
            class="workspace-assistant-message-content__fallback-badge"
          >
            回退摘要
          </span>
          <span class="material-symbols-outlined workspace-assistant-message-content__citation-toggle-icon">
            chevron_right
          </span>
        </button>

        <Transition name="workspace-assistant-citation-expand">
          <div
            v-if="citationsExpanded"
            class="workspace-assistant-message-content__citation-list"
          >
            <component
              :is="citation.sourceResourceId ? 'button' : 'div'"
              v-for="citation in visibleCitations"
              :key="`${citation.chunkId}-${citation.label}`"
              class="workspace-assistant-message-content__citation-card"
              :class="{
                'workspace-assistant-message-content__citation-card--actionable': citation.sourceResourceId,
              }"
              :type="citation.sourceResourceId ? 'button' : undefined"
              data-testid="workspace-assistant-citation-card"
              @click="openCitationResource(citation)"
            >
              <div class="workspace-assistant-message-content__citation-title-row">
                <div class="workspace-assistant-message-content__citation-title-stack">
                  <strong class="workspace-assistant-message-content__citation-title">
                    {{ citation.label || citation.resourceTitle }}
                  </strong>
                  <div class="workspace-assistant-message-content__citation-badges">
                    <span
                      v-if="buildCitationProjectionLabel(citation)"
                      class="workspace-assistant-message-content__citation-projection"
                      data-testid="workspace-assistant-citation-projection"
                    >
                      {{ buildCitationProjectionLabel(citation) }}
                    </span>
                    <span
                      v-if="citation.sourceStatus === 'stale'"
                      class="workspace-assistant-message-content__citation-stale"
                      data-testid="workspace-assistant-citation-stale"
                    >
                      stale
                    </span>
                  </div>
                </div>
              </div>
              <div
                v-if="buildCitationMeta(citation)"
                class="workspace-assistant-message-content__citation-meta"
              >
                {{ buildCitationMeta(citation) }}
              </div>
              <div
                v-if="citation.quote"
                class="workspace-assistant-message-content__citation-quote"
              >
                {{ citation.quote }}
              </div>
            </component>

            <div
              v-if="hasRetrievalPaths"
              class="workspace-assistant-message-content__knowledge-paths"
              data-testid="workspace-assistant-knowledge-paths"
            >
              <div class="workspace-assistant-message-content__knowledge-paths-head">
                <strong>检索路径</strong>
                <span v-if="retrievalPlan">
                  {{ buildPlannerSourceLabel(retrievalPlan.plannerSource) }} · {{ buildRetrievalIntentLabel(retrievalPlan.intent) }}
                </span>
              </div>
              <div class="workspace-assistant-message-content__knowledge-paths-meta">
                <span v-if="retrievalPlan">预算 {{ retrievalPlan.retrievalBudget || visibleCitations.length }}</span>
                <span>{{ visibleEvidencePaths.length }} 条证据链</span>
              </div>
              <div v-if="visibleEvidencePaths.length > 0" class="workspace-assistant-message-content__knowledge-path-list">
                <div
                  v-for="path in visibleEvidencePaths"
                  :key="path.id"
                  class="workspace-assistant-message-content__knowledge-path-item"
                >
                  <span>{{ path.summary }}</span>
                  <small>{{ Math.round(path.score * 100) }}%</small>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </section>
  </div>
</template>

<style scoped>
.workspace-assistant-message-content {
  --workspace-assistant-gap: var(--wl-ws-space-2_5, 10px);
  --workspace-assistant-gap-tight: var(--wl-ws-space-2, 8px);
  --workspace-assistant-padding-x: var(--wl-ws-space-2_5, 10px);
  --workspace-assistant-padding-y: var(--wl-ws-space-2, 8px);
  --workspace-assistant-card-padding-x: var(--wl-ws-space-3, 12px);
  --workspace-assistant-card-padding-y: var(--wl-ws-space-2_5, 10px);
  --workspace-assistant-font-2xs: var(--wl-ws-font-2xs, 10px);
  --workspace-assistant-font-xs: var(--wl-ws-font-xs, 11px);
  --workspace-assistant-font-sm: var(--wl-ws-font-sm, 12px);
  display: flex;
  flex-direction: column;
  gap: var(--workspace-assistant-gap);
  min-width: 0;
}

.workspace-assistant-message-content__knowledge {
  display: flex;
  flex-direction: column;
  gap: var(--workspace-assistant-gap-tight);
}

.workspace-assistant-message-content__warning {
  padding: var(--workspace-assistant-padding-y) var(--workspace-assistant-padding-x);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 12px;
  background: rgba(251, 191, 36, 0.12);
  color: #92400e;
  font-size: var(--workspace-assistant-font-xs);
  line-height: 1.6;
}

.workspace-assistant-message-content__citations {
  display: flex;
  flex-direction: column;
  gap: var(--workspace-assistant-gap-tight);
}

.workspace-assistant-message-content__citation-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--workspace-assistant-gap-tight);
  width: fit-content;
  max-width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #475569;
  font: inherit;
  font-size: var(--workspace-assistant-font-xs);
  font-weight: 600;
  text-align: left;
  transition:
    color 0.18s ease,
    opacity 0.18s ease;
}

.workspace-assistant-message-content__citation-toggle:hover {
  color: #334155;
}

.workspace-assistant-message-content__citation-toggle-copy {
  min-width: 0;
}

.workspace-assistant-message-content__citation-toggle-icon {
  flex: 0 0 auto;
  color: #94a3b8;
  font-size: 15px;
  transform: rotate(0deg);
  transform-origin: center;
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.workspace-assistant-message-content__citation-toggle--expanded
  .workspace-assistant-message-content__citation-toggle-icon {
  transform: rotate(90deg);
}

.workspace-assistant-message-content__fallback-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.14);
  color: #475569;
  font-size: var(--workspace-assistant-font-2xs);
  font-weight: 700;
}

.workspace-assistant-message-content__citation-list {
  display: grid;
  gap: var(--workspace-assistant-gap-tight);
}

.workspace-assistant-citation-expand-enter-active,
.workspace-assistant-citation-expand-leave-active {
  overflow: hidden;
  transition:
    opacity 0.22s ease,
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    max-height 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.workspace-assistant-citation-expand-enter-from,
.workspace-assistant-citation-expand-leave-to {
  opacity: 0;
  transform: translateY(-6px);
  max-height: 0;
}

.workspace-assistant-citation-expand-enter-to,
.workspace-assistant-citation-expand-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 720px;
}

.workspace-assistant-message-content__citation-card {
  width: 100%;
  padding: var(--workspace-assistant-card-padding-y) var(--workspace-assistant-card-padding-x);
  border: 1px solid rgba(203, 213, 225, 0.9);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.9);
  text-align: left;
}

.workspace-assistant-message-content__citation-card--actionable {
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.workspace-assistant-message-content__citation-card--actionable:hover {
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.08);
  transform: translateY(-1px);
}

.workspace-assistant-message-content__citation-title-row {
  display: flex;
  align-items: flex-start;
  gap: var(--workspace-assistant-gap-tight);
}

.workspace-assistant-message-content__citation-title-stack {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: var(--wl-ws-space-1_5, 6px);
}

.workspace-assistant-message-content__citation-title {
  color: #0f172a;
  font-size: var(--workspace-assistant-font-sm);
  line-height: 1.5;
}

.workspace-assistant-message-content__citation-badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--wl-ws-space-1_5, 6px);
}

.workspace-assistant-message-content__citation-projection {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.1);
  color: #1d4ed8;
  font-size: var(--workspace-assistant-font-2xs);
  font-weight: 700;
}

.workspace-assistant-message-content__citation-stale {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(244, 114, 182, 0.12);
  color: #be185d;
  font-size: var(--workspace-assistant-font-2xs);
  font-weight: 700;
  text-transform: uppercase;
}

.workspace-assistant-message-content__citation-meta {
  margin-top: var(--wl-ws-space-1_5, 6px);
  color: #64748b;
  font-size: var(--workspace-assistant-font-xs);
  line-height: 1.5;
}

.workspace-assistant-message-content__citation-quote {
  margin-top: var(--wl-ws-space-1_5, 6px);
  color: #334155;
  font-size: var(--workspace-assistant-font-xs);
  line-height: 1.6;
  white-space: pre-wrap;
}

.workspace-assistant-message-content__knowledge-paths {
  padding: var(--workspace-assistant-card-padding-y) var(--workspace-assistant-card-padding-x);
  border: 1px solid rgba(125, 148, 179, 0.28);
  border-radius: 12px;
  background: rgba(248, 250, 252, 0.88);
}

.workspace-assistant-message-content__knowledge-paths-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--workspace-assistant-gap-tight);
  color: #334155;
  font-size: var(--workspace-assistant-font-xs);
}

.workspace-assistant-message-content__knowledge-paths-head strong {
  color: #0f172a;
  font-size: var(--workspace-assistant-font-sm);
}

.workspace-assistant-message-content__knowledge-paths-meta,
.workspace-assistant-message-content__knowledge-path-item {
  display: flex;
  flex-wrap: wrap;
  gap: var(--workspace-assistant-gap-tight);
  margin-top: var(--wl-ws-space-1_5, 6px);
  color: #64748b;
  font-size: var(--workspace-assistant-font-xs);
  line-height: 1.5;
}

.workspace-assistant-message-content__knowledge-path-list {
  display: grid;
  gap: var(--wl-ws-space-1_5, 6px);
  margin-top: var(--workspace-assistant-gap-tight);
}

.workspace-assistant-message-content__knowledge-path-item {
  justify-content: space-between;
  padding-top: var(--wl-ws-space-1_5, 6px);
  border-top: 1px solid rgba(203, 213, 225, 0.68);
}

.workspace-assistant-message-content__knowledge-path-item span {
  min-width: 0;
  color: #334155;
}

.workspace-assistant-message-content__knowledge-path-item small {
  flex: 0 0 auto;
  color: #64748b;
  font-size: var(--workspace-assistant-font-2xs);
  font-weight: 700;
}
</style>

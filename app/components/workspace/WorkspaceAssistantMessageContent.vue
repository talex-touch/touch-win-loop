<script setup lang="ts">
import type {
  ChatMessage,
  ProjectKnowledgeCitation,
  ProjectKnowledgeModality,
  ProjectKnowledgeProjectionType,
  ProjectKnowledgeSourceStatus,
} from '~~/shared/types/domain'
import type { ProjectKnowledgeMessagePayload } from '~~/shared/types/domain-legacy'
import { computed } from 'vue'

const props = defineProps<{
  message: ChatMessage
}>()

const emit = defineEmits<{
  openResource: [resourceId: string]
}>()

function normalizeString(value: unknown): string {
  return String(value || '').trim()
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
          sourceStatus: (normalizeString(item.sourceStatus) || undefined) as ProjectKnowledgeSourceStatus | undefined,
          modality: (normalizeString(item.modality) || undefined) as ProjectKnowledgeModality | undefined,
          projectionType: (normalizeString(item.projectionType) || undefined) as ProjectKnowledgeProjectionType | undefined,
          page: Number.isFinite(Number(item.page)) ? Number(item.page) : undefined,
          section: normalizeString(item.section) || undefined,
          quote: normalizeString(item.quote) || undefined,
        } satisfies ProjectKnowledgeCitation
      })
      .filter(item => item.sourceId && item.chunkId),
    warning: normalizeString(candidate.warning),
    usedFallback: candidate.usedFallback === true,
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
const hasKnowledgePanel = computed(() => Boolean(knowledge.value?.warning) || visibleCitations.value.length > 0)

function buildCitationMeta(citation: ProjectKnowledgeCitation): string {
  const parts: string[] = []
  if (citation.page != null)
    parts.push(`第 ${citation.page} 页`)
  if (normalizeString(citation.section))
    parts.push(String(citation.section).trim())
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
        v-if="visibleCitations.length > 0"
        class="workspace-assistant-message-content__citations"
      >
        <div class="workspace-assistant-message-content__citations-header">
          <span>资料引用</span>
          <span
            v-if="knowledge?.usedFallback"
            class="workspace-assistant-message-content__fallback-badge"
          >
            回退摘要
          </span>
        </div>

        <div class="workspace-assistant-message-content__citation-list">
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
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.workspace-assistant-message-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.workspace-assistant-message-content__knowledge {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-assistant-message-content__warning {
  padding: 8px 10px;
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 12px;
  background: rgba(251, 191, 36, 0.12);
  color: #92400e;
  font-size: 11px;
  line-height: 1.6;
}

.workspace-assistant-message-content__citations {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-assistant-message-content__citations-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #475569;
  font-size: 11px;
  font-weight: 600;
}

.workspace-assistant-message-content__fallback-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.14);
  color: #475569;
  font-size: 10px;
  font-weight: 700;
}

.workspace-assistant-message-content__citation-list {
  display: grid;
  gap: 8px;
}

.workspace-assistant-message-content__citation-card {
  width: 100%;
  padding: 10px 12px;
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
  gap: 8px;
}

.workspace-assistant-message-content__citation-title-stack {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.workspace-assistant-message-content__citation-title {
  color: #0f172a;
  font-size: 12px;
  line-height: 1.5;
}

.workspace-assistant-message-content__citation-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.workspace-assistant-message-content__citation-projection {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.1);
  color: #1d4ed8;
  font-size: 10px;
  font-weight: 700;
}

.workspace-assistant-message-content__citation-stale {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(244, 114, 182, 0.12);
  color: #be185d;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.workspace-assistant-message-content__citation-meta {
  margin-top: 6px;
  color: #64748b;
  font-size: 11px;
  line-height: 1.5;
}

.workspace-assistant-message-content__citation-quote {
  margin-top: 6px;
  color: #334155;
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
}
</style>

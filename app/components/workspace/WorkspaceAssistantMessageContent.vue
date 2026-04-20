<script setup lang="ts">
import type {
  ChatMessage,
  ProjectKnowledgeCitation,
  ProjectKnowledgeModality,
  ProjectKnowledgeProjectionType,
  ProjectKnowledgeSourceStatus,
} from '~~/shared/types/domain'
import type { ProjectKnowledgeMessagePayload } from '~~/shared/types/domain-legacy'
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
const citationsExpanded = ref(false)
const citationToggleLabel = computed(() => `资料引用(${visibleCitations.value.length})`)

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
</style>

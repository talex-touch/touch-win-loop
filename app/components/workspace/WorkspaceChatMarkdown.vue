<script setup lang="ts">
import { computed } from 'vue'
import { parseWorkspaceChatMarkdown } from '~~/shared/utils/workspace-chat-markdown'

const props = defineProps<{
  content: string
}>()

const parsed = computed(() => parseWorkspaceChatMarkdown(props.content || ''))
</script>

<template>
  <div class="workspace-chat-markdown">
    <pre v-if="!parsed.ok" class="workspace-chat-markdown__fallback">{{ parsed.fallbackText }}</pre>
    <template v-else-if="parsed.nodes.length > 0">
      <WorkspaceChatMarkdownNode
        v-for="(node, index) in parsed.nodes"
        :key="`markdown-node-${index}`"
        :node="node"
      />
    </template>
    <pre v-else class="workspace-chat-markdown__fallback">{{ parsed.fallbackText }}</pre>
  </div>
</template>

<style scoped>
.workspace-chat-markdown {
  --workspace-chat-markdown-font-xs: var(--wl-ws-font-xs, 11px);
  --workspace-chat-markdown-font-sm: var(--wl-ws-font-sm, 12px);
  --workspace-chat-markdown-font-md: var(--wl-ws-font-md, 13px);
  --workspace-chat-markdown-font-lg: var(--wl-ws-font-lg, 14px);
  --workspace-chat-markdown-font-xl: var(--wl-ws-font-xl, 16px);
  --workspace-chat-markdown-font-2xl: var(--wl-ws-font-2xl, 18px);
  --workspace-chat-markdown-space-1: var(--wl-ws-space-1, 4px);
  --workspace-chat-markdown-space-1_5: var(--wl-ws-space-1_5, 6px);
  --workspace-chat-markdown-space-2: var(--wl-ws-space-2, 8px);
  --workspace-chat-markdown-space-2_5: var(--wl-ws-space-2_5, 10px);
  --workspace-chat-markdown-space-3: var(--wl-ws-space-3, 12px);
  color: inherit;
  font-size: var(--workspace-chat-markdown-font-sm);
  line-height: 1.7;
  word-break: break-word;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__heading) {
  margin: 0;
  color: #0f172a;
  font-weight: 700;
  line-height: 1.45;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__heading--1) {
  font-size: var(--workspace-chat-markdown-font-2xl);
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__heading--2) {
  font-size: var(--workspace-chat-markdown-font-xl);
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__heading--3) {
  font-size: calc(var(--workspace-chat-markdown-font-lg) + 1px);
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__heading--4),
.workspace-chat-markdown :deep(.workspace-chat-markdown__heading--5),
.workspace-chat-markdown :deep(.workspace-chat-markdown__heading--6) {
  font-size: var(--workspace-chat-markdown-font-md);
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__heading + .workspace-chat-markdown__paragraph),
.workspace-chat-markdown :deep(.workspace-chat-markdown__paragraph + .workspace-chat-markdown__paragraph),
.workspace-chat-markdown :deep(.workspace-chat-markdown__paragraph + .workspace-chat-markdown__heading),
.workspace-chat-markdown :deep(.workspace-chat-markdown__paragraph + .workspace-chat-markdown__list),
.workspace-chat-markdown :deep(.workspace-chat-markdown__paragraph + .workspace-chat-markdown__blockquote),
.workspace-chat-markdown :deep(.workspace-chat-markdown__paragraph + .workspace-chat-markdown__code-block),
.workspace-chat-markdown :deep(.workspace-chat-markdown__paragraph + .workspace-chat-markdown__table-wrap),
.workspace-chat-markdown :deep(.workspace-chat-markdown__paragraph + .workspace-chat-markdown__thematic-break),
.workspace-chat-markdown :deep(.workspace-chat-markdown__list + .workspace-chat-markdown__paragraph),
.workspace-chat-markdown :deep(.workspace-chat-markdown__blockquote + .workspace-chat-markdown__paragraph),
.workspace-chat-markdown :deep(.workspace-chat-markdown__code-block + .workspace-chat-markdown__paragraph),
.workspace-chat-markdown :deep(.workspace-chat-markdown__table-wrap + .workspace-chat-markdown__paragraph),
.workspace-chat-markdown :deep(.workspace-chat-markdown__thematic-break + .workspace-chat-markdown__paragraph),
.workspace-chat-markdown :deep(.workspace-chat-markdown__heading + .workspace-chat-markdown__list),
.workspace-chat-markdown :deep(.workspace-chat-markdown__heading + .workspace-chat-markdown__blockquote),
.workspace-chat-markdown :deep(.workspace-chat-markdown__heading + .workspace-chat-markdown__code-block),
.workspace-chat-markdown :deep(.workspace-chat-markdown__heading + .workspace-chat-markdown__table-wrap) {
  margin-top: var(--workspace-chat-markdown-space-2_5);
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__paragraph) {
  margin: 0;
  white-space: normal;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__blockquote) {
  margin: var(--workspace-chat-markdown-space-2_5) 0 0;
  padding: var(--workspace-chat-markdown-space-2) 0 var(--workspace-chat-markdown-space-2)
    var(--workspace-chat-markdown-space-3);
  border-left: 3px solid #cbd5e1;
  color: #475569;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__list) {
  margin: var(--workspace-chat-markdown-space-2_5) 0 0;
  padding-left: calc(var(--workspace-chat-markdown-space-3) + var(--workspace-chat-markdown-space-1_5));
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__list--ordered) {
  list-style: decimal;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__list--unordered) {
  list-style: disc;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__list-item) {
  margin: var(--workspace-chat-markdown-space-1) 0;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__list-item > .workspace-chat-markdown__paragraph:first-child) {
  margin-top: 0;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__task-row) {
  display: flex;
  align-items: flex-start;
  gap: var(--workspace-chat-markdown-space-2);
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__task-checkbox) {
  margin-top: 3px;
  width: 13px;
  height: 13px;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__task-copy) {
  min-width: 0;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__inline-code) {
  padding: 1px calc(var(--workspace-chat-markdown-space-1) + 1px);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.08);
  color: #0f172a;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: var(--workspace-chat-markdown-font-xs);
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__code-block) {
  margin: var(--workspace-chat-markdown-space-2_5) 0 0;
  padding: var(--workspace-chat-markdown-space-2_5) var(--workspace-chat-markdown-space-3);
  overflow-x: auto;
  border-radius: 12px;
  background: #0f172a;
  color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: var(--workspace-chat-markdown-font-xs);
  line-height: 1.65;
  white-space: pre-wrap;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__code-block code) {
  font: inherit;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__link) {
  color: #2563eb;
  text-decoration: underline;
  text-decoration-color: rgba(37, 99, 235, 0.32);
  text-underline-offset: 2px;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__link:hover) {
  color: #1d4ed8;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__table-wrap) {
  margin-top: var(--workspace-chat-markdown-space-2_5);
  overflow-x: auto;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__table) {
  width: 100%;
  min-width: 320px;
  border-collapse: collapse;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__table-cell) {
  padding: var(--workspace-chat-markdown-space-2) var(--workspace-chat-markdown-space-2_5);
  border: 1px solid #dbe4f0;
  vertical-align: top;
  white-space: normal;
}

.workspace-chat-markdown :deep(th.workspace-chat-markdown__table-cell) {
  background: #eff6ff;
  color: #1e3a8a;
  font-size: var(--workspace-chat-markdown-font-xs);
  font-weight: 700;
}

.workspace-chat-markdown :deep(td.workspace-chat-markdown__table-cell) {
  background: rgba(255, 255, 255, 0.82);
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__table-cell--left) {
  text-align: left;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__table-cell--center) {
  text-align: center;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__table-cell--right) {
  text-align: right;
}

.workspace-chat-markdown :deep(.workspace-chat-markdown__thematic-break) {
  margin: var(--workspace-chat-markdown-space-2_5) 0 0;
  border: none;
  border-top: 1px solid #dbe4f0;
}

.workspace-chat-markdown__fallback {
  margin: 0;
  white-space: pre-wrap;
  font: inherit;
  color: inherit;
}
</style>

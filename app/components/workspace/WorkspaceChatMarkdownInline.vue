<script setup lang="ts">
import type { WorkspaceChatMarkdownInlineNode } from '~~/shared/utils/workspace-chat-markdown'

defineOptions({
  name: 'WorkspaceChatMarkdownInline',
})

const props = defineProps<{
  nodes: WorkspaceChatMarkdownInlineNode[]
}>()
</script>

<template>
  <template v-for="(node, index) in props.nodes" :key="`${node.type}-${index}`">
    <template v-if="node.type === 'text'">
      {{ node.value }}
    </template>
    <br v-else-if="node.type === 'break'">
    <code v-else-if="node.type === 'inline_code'" class="workspace-chat-markdown__inline-code">{{ node.value }}</code>
    <strong v-else-if="node.type === 'strong'" class="workspace-chat-markdown__strong">
      <WorkspaceChatMarkdownInline :nodes="node.children" />
    </strong>
    <em v-else-if="node.type === 'emphasis'" class="workspace-chat-markdown__emphasis">
      <WorkspaceChatMarkdownInline :nodes="node.children" />
    </em>
    <del v-else-if="node.type === 'delete'" class="workspace-chat-markdown__delete">
      <WorkspaceChatMarkdownInline :nodes="node.children" />
    </del>
    <a
      v-else-if="node.type === 'link'"
      class="workspace-chat-markdown__link"
      :href="node.url"
      :title="node.title || undefined"
      :target="node.scheme === 'relative' ? undefined : '_blank'"
      :rel="node.scheme === 'relative' ? undefined : 'noopener noreferrer nofollow'"
    >
      <WorkspaceChatMarkdownInline :nodes="node.children" />
    </a>
  </template>
</template>

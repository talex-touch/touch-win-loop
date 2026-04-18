<script setup lang="ts">
import type {
  WorkspaceChatMarkdownBlockNode,
  WorkspaceChatMarkdownInlineNode,
} from '~~/shared/utils/workspace-chat-markdown'

defineOptions({
  name: 'WorkspaceChatMarkdownNode',
})

const props = defineProps<{
  node: WorkspaceChatMarkdownBlockNode
}>()

function resolveTableAlignClass(align: 'left' | 'center' | 'right' | null | undefined): string {
  if (align === 'center')
    return 'workspace-chat-markdown__table-cell--center'
  if (align === 'right')
    return 'workspace-chat-markdown__table-cell--right'
  return 'workspace-chat-markdown__table-cell--left'
}

function resolveListStart(node: Extract<WorkspaceChatMarkdownBlockNode, { type: 'list' }>): number {
  return node.ordered ? Math.max(1, Number(node.start || 1)) : 1
}

function resolveListItemParagraphChildren(children: WorkspaceChatMarkdownBlockNode[]): WorkspaceChatMarkdownInlineNode[] | null {
  if (children.length !== 1)
    return null
  const onlyChild = children[0]
  if (!onlyChild || onlyChild.type !== 'paragraph')
    return null
  return onlyChild.children
}
</script>

<template>
  <p v-if="props.node.type === 'paragraph'" class="workspace-chat-markdown__paragraph">
    <WorkspaceChatMarkdownInline :nodes="props.node.children" />
  </p>

  <component
    :is="`h${props.node.depth}`"
    v-else-if="props.node.type === 'heading'"
    class="workspace-chat-markdown__heading"
    :class="`workspace-chat-markdown__heading--${props.node.depth}`"
  >
    <WorkspaceChatMarkdownInline :nodes="props.node.children" />
  </component>

  <blockquote v-else-if="props.node.type === 'blockquote'" class="workspace-chat-markdown__blockquote">
    <WorkspaceChatMarkdownNode
      v-for="(child, index) in props.node.children"
      :key="`blockquote-${index}`"
      :node="child"
    />
  </blockquote>

  <component
    :is="props.node.ordered ? 'ol' : 'ul'"
    v-else-if="props.node.type === 'list'"
    class="workspace-chat-markdown__list"
    :class="props.node.ordered ? 'workspace-chat-markdown__list--ordered' : 'workspace-chat-markdown__list--unordered'"
    :start="props.node.ordered ? resolveListStart(props.node) : undefined"
  >
    <li
      v-for="(item, index) in props.node.items"
      :key="`list-item-${index}`"
      class="workspace-chat-markdown__list-item"
      :class="{ 'workspace-chat-markdown__list-item--task': item.checked !== null }"
    >
      <div
        v-if="item.checked !== null && resolveListItemParagraphChildren(item.children)"
        class="workspace-chat-markdown__task-row"
      >
        <input
          class="workspace-chat-markdown__task-checkbox"
          type="checkbox"
          :checked="item.checked"
          disabled
        >
        <span class="workspace-chat-markdown__task-copy">
          <WorkspaceChatMarkdownInline :nodes="resolveListItemParagraphChildren(item.children) || []" />
        </span>
      </div>
      <template v-else>
        <WorkspaceChatMarkdownNode
          v-for="(child, childIndex) in item.children"
          :key="`list-item-${index}-${childIndex}`"
          :node="child"
        />
      </template>
    </li>
  </component>

  <pre v-else-if="props.node.type === 'code'" class="workspace-chat-markdown__code-block"><code>{{ props.node.value }}</code></pre>

  <div v-else-if="props.node.type === 'table'" class="workspace-chat-markdown__table-wrap">
    <table class="workspace-chat-markdown__table">
      <tbody>
        <tr
          v-for="(row, rowIndex) in props.node.rows"
          :key="`table-row-${rowIndex}`"
          class="workspace-chat-markdown__table-row"
        >
          <component
            :is="row.header ? 'th' : 'td'"
            v-for="(cell, cellIndex) in row.cells"
            :key="`table-cell-${rowIndex}-${cellIndex}`"
            class="workspace-chat-markdown__table-cell"
            :class="resolveTableAlignClass(props.node.align[cellIndex])"
          >
            <WorkspaceChatMarkdownInline :nodes="cell" />
          </component>
        </tr>
      </tbody>
    </table>
  </div>

  <hr v-else-if="props.node.type === 'thematic_break'" class="workspace-chat-markdown__thematic-break">
</template>

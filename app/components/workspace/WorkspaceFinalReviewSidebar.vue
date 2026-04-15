<script setup lang="ts">
import type { ChatMessage, ProjectIssue } from '~~/shared/types/domain'
import UnifiedAvatar from '~/components/UnifiedAvatar.vue'

const props = withDefaults(defineProps<{
  open?: boolean
  chatMessages?: ChatMessage[]
  chatInput?: string
  chatLoading?: boolean
  currentUserName?: string
  currentUserAvatarUrl?: string | null
  riskSummary?: string
  openIssues?: ProjectIssue[]
}>(), {
  open: false,
  chatMessages: () => [],
  chatInput: '',
  chatLoading: false,
  currentUserName: '',
  currentUserAvatarUrl: '',
  riskSummary: '',
  openIssues: () => [],
})

const emit = defineEmits<{
  close: []
  sendChat: []
  'update:chatInput': [value: string]
}>()

const inputPlaceholder = '输入终审问题，例如：这份材料还缺哪些证据？'
const visibleIssues = computed(() => props.openIssues.slice(0, 3))
</script>

<template>
  <div
    class="workspace-final-review-sidebar-layer"
    :class="{ 'workspace-final-review-sidebar-layer--open': props.open }"
  >
    <button
      class="workspace-final-review-sidebar-layer__scrim"
      type="button"
      aria-label="关闭终审助手抽屉"
      @click="emit('close')"
    />

    <aside
      data-testid="workspace-final-review-sidebar"
      class="workspace-final-review-sidebar"
      :aria-hidden="props.open ? 'false' : 'true'"
    >
      <header class="workspace-final-review-sidebar__header">
        <div class="space-y-1">
          <p class="workspace-final-review-sidebar__eyebrow">
            终审助手
          </p>
          <h2 class="workspace-final-review-sidebar__title">
            风险摘要与提问
          </h2>
          <p class="workspace-final-review-sidebar__summary">
            复用现有对话能力，但隐藏普通会话列表与 mode select，只保留终审语义的摘要和输入区。
          </p>
        </div>

        <button class="workspace-final-review-sidebar__close" type="button" @click="emit('close')">
          关闭
        </button>
      </header>

      <section class="workspace-final-review-sidebar__summary-card">
        <p class="workspace-final-review-sidebar__section-label">
          风险摘记
        </p>
        <p class="workspace-final-review-sidebar__summary-text">
          {{ props.riskSummary || '当前还没有终审问题报告，可先在研发工作台生成寻疑结果。' }}
        </p>
      </section>

      <section class="workspace-final-review-sidebar__issue-card">
        <p class="workspace-final-review-sidebar__section-label">
          当前关注
        </p>
        <ul v-if="visibleIssues.length > 0" class="workspace-final-review-sidebar__issue-list">
          <li v-for="issue in visibleIssues" :key="issue.id" class="workspace-final-review-sidebar__issue-item">
            <span class="workspace-final-review-sidebar__issue-severity">{{ issue.severity.toUpperCase() }}</span>
            <div class="space-y-1">
              <strong class="workspace-final-review-sidebar__issue-title">{{ issue.title }}</strong>
              <p class="workspace-final-review-sidebar__issue-text">
                {{ issue.recommendation || issue.evidence || '当前问题还没有补充建议。' }}
              </p>
            </div>
          </li>
        </ul>
        <p v-else class="workspace-final-review-sidebar__summary-text">
          当前没有需要优先关注的高优先级 issue。
        </p>
      </section>

      <section class="workspace-final-review-sidebar__chat">
        <div class="workspace-final-review-sidebar__chat-header">
          <p class="workspace-final-review-sidebar__section-label">
            对话记录
          </p>
          <span v-if="props.chatLoading" class="workspace-final-review-sidebar__loading">
            AI 分析中...
          </span>
        </div>

        <div class="workspace-final-review-sidebar__chat-messages">
          <div v-if="props.chatMessages.length === 0" class="workspace-final-review-sidebar__chat-empty">
            可以直接问终审材料、证据链或风险收敛建议。
          </div>
          <article
            v-for="(message, index) in props.chatMessages"
            :key="`${message.role}-${index}`"
            class="workspace-final-review-sidebar__message"
            :class="`workspace-final-review-sidebar__message--${message.role}`"
          >
            <div class="workspace-final-review-sidebar__message-avatar">
              <UnifiedAvatar
                v-if="message.role === 'user'"
                :name="props.currentUserName || '我'"
                :src="props.currentUserAvatarUrl || ''"
                :size="28"
              />
              <span v-else class="workspace-final-review-sidebar__assistant-badge">AI</span>
            </div>
            <div class="workspace-final-review-sidebar__message-bubble">
              {{ message.content }}
            </div>
          </article>
        </div>

        <div class="workspace-final-review-sidebar__composer">
          <textarea
            class="workspace-final-review-sidebar__textarea"
            :value="props.chatInput"
            :placeholder="inputPlaceholder"
            rows="4"
            @input="emit('update:chatInput', ($event.target as HTMLTextAreaElement).value)"
          />
          <button
            class="workspace-final-review-sidebar__send"
            type="button"
            :disabled="props.chatLoading"
            @click="emit('sendChat')"
          >
            发送给终审助手
          </button>
        </div>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.workspace-final-review-sidebar-layer {
  position: absolute;
  inset: 0;
  z-index: 24;
  pointer-events: none;
}

.workspace-final-review-sidebar-layer--open {
  pointer-events: auto;
}

.workspace-final-review-sidebar-layer__scrim {
  position: absolute;
  inset: 0;
  border: none;
  background: rgba(15, 23, 42, 0.08);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.workspace-final-review-sidebar-layer--open .workspace-final-review-sidebar-layer__scrim {
  opacity: 1;
  pointer-events: auto;
}

.workspace-final-review-sidebar {
  position: absolute;
  top: 16px;
  right: 16px;
  bottom: 16px;
  width: min(392px, calc(100% - 32px));
  border: 1px solid rgba(214, 224, 238, 0.95);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.97);
  backdrop-filter: blur(18px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  transform: translateX(108%);
  opacity: 0;
  transition:
    transform 0.22s ease,
    opacity 0.18s ease;
}

.workspace-final-review-sidebar-layer--open .workspace-final-review-sidebar {
  transform: translateX(0);
  opacity: 1;
}

.workspace-final-review-sidebar__header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.workspace-final-review-sidebar__eyebrow,
.workspace-final-review-sidebar__section-label {
  display: block;
  color: #5373a2;
  font-size: 11px;
  line-height: 1.4;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.workspace-final-review-sidebar__title {
  margin: 0;
  color: #0f172a;
  font-size: 20px;
  line-height: 1.2;
  font-weight: 700;
}

.workspace-final-review-sidebar__summary,
.workspace-final-review-sidebar__summary-text,
.workspace-final-review-sidebar__issue-text,
.workspace-final-review-sidebar__chat-empty,
.workspace-final-review-sidebar__loading {
  margin: 0;
  color: #617591;
  font-size: 12px;
  line-height: 1.7;
}

.workspace-final-review-sidebar__close,
.workspace-final-review-sidebar__send {
  border: 1px solid #d9e2ef;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease;
}

.workspace-final-review-sidebar__close {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: #ffffff;
  color: #264061;
  font-size: 12px;
  line-height: 1;
  font-weight: 600;
}

.workspace-final-review-sidebar__close:hover {
  border-color: #bfd1eb;
  background: #f7faff;
}

.workspace-final-review-sidebar__summary-card,
.workspace-final-review-sidebar__issue-card {
  border: 1px solid #e2eaf4;
  border-radius: 18px;
  background: #fbfdff;
  padding: 14px;
}

.workspace-final-review-sidebar__issue-list {
  list-style: none;
  padding: 0;
  margin: 10px 0 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workspace-final-review-sidebar__issue-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: flex-start;
}

.workspace-final-review-sidebar__issue-severity {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: #e9f1ff;
  color: #2454a7;
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.workspace-final-review-sidebar__issue-title {
  color: #14213a;
  font-size: 13px;
  line-height: 1.5;
  font-weight: 600;
}

.workspace-final-review-sidebar__chat {
  min-height: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
}

.workspace-final-review-sidebar__chat-header {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.workspace-final-review-sidebar__chat-messages {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 4px;
}

.workspace-final-review-sidebar__message {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: flex-start;
}

.workspace-final-review-sidebar__message-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
}

.workspace-final-review-sidebar__assistant-badge {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
}

.workspace-final-review-sidebar__message-bubble {
  border-radius: 16px;
  padding: 12px 13px;
  color: #20344f;
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.workspace-final-review-sidebar__message--assistant .workspace-final-review-sidebar__message-bubble,
.workspace-final-review-sidebar__message--system .workspace-final-review-sidebar__message-bubble {
  background: #f7faff;
  border: 1px solid #dfe8f5;
}

.workspace-final-review-sidebar__message--user .workspace-final-review-sidebar__message-bubble {
  background: #eef4ff;
  border: 1px solid #d3e1fb;
}

.workspace-final-review-sidebar__composer {
  border-top: 1px solid #e2e8f0;
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workspace-final-review-sidebar__textarea {
  width: 100%;
  resize: none;
  border: 1px solid #d6e0ec;
  border-radius: 16px;
  background: #ffffff;
  padding: 12px 13px;
  color: #10213a;
  font-size: 13px;
  line-height: 1.7;
}

.workspace-final-review-sidebar__textarea:focus {
  outline: none;
  border-color: #94b5ec;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

.workspace-final-review-sidebar__send {
  min-height: 42px;
  border-radius: 14px;
  background: #2563eb;
  border-color: #2f65d6;
  color: #ffffff;
  font-size: 13px;
  line-height: 1;
  font-weight: 600;
}

.workspace-final-review-sidebar__send:hover:not(:disabled) {
  background: #1f58d9;
  border-color: #275acd;
}

.workspace-final-review-sidebar__send:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>

<script setup lang="ts">
import type {
  AiCanvasAssistRequest,
  ChatMessage,
} from '~~/shared/types/domain'
import WorkspaceAssistantMessageContent from '../WorkspaceAssistantMessageContent.vue'

const props = withDefaults(defineProps<{
  template?: AiCanvasAssistRequest['template']
  prompt?: string
  inputDisabled?: boolean
  running?: boolean
  previewPending?: boolean
  statusLabel?: string
  statusClass?: string
  errorText?: string
  runtimeErrorText?: string
  messages?: ChatMessage[]
  generateEnabled?: boolean
  completeEnabled?: boolean
  refineEnabled?: boolean
  generateTitle?: string
  completeTitle?: string
  refineTitle?: string
}>(), {
  template: 'flowchart',
  prompt: '',
  inputDisabled: false,
  running: false,
  previewPending: false,
  statusLabel: '',
  statusClass: '',
  errorText: '',
  runtimeErrorText: '',
  messages: () => [],
  generateEnabled: false,
  completeEnabled: false,
  refineEnabled: false,
  generateTitle: '',
  completeTitle: '',
  refineTitle: '',
})

const emit = defineEmits<{
  'update:template': [value: AiCanvasAssistRequest['template']]
  'update:prompt': [value: string]
  'runAction': [action: 'generate' | 'complete' | 'refine']
  'openResource': [resourceId: string]
}>()
</script>

<template>
  <div class="mt-4 p-4 border border-slate-800 rounded-[24px] bg-slate-950/70">
    <div class="flex gap-3 items-start justify-between">
      <div>
        <h4 class="text-xs text-slate-300 tracking-[0.18em] font-semibold uppercase">
          画布 AI
        </h4>
        <p class="text-xs text-slate-400 leading-5 mt-1">
          生成、补全或续改结构源。AI 只回填到源文本区，仍需你手动点击“覆盖导入”。
        </p>
      </div>
      <span
        class="text-[10px] font-semibold px-2 py-1 border rounded-full"
        :class="props.statusClass"
      >
        {{ props.statusLabel }}
      </span>
    </div>

    <div class="mt-4 gap-3 grid xl:grid-cols-[220px,1fr]">
      <label class="block space-y-1">
        <span class="text-xs text-slate-300 font-semibold">图类型</span>
        <select
          :value="props.template"
          class="text-xs text-slate-100 px-3 outline-none border border-slate-700 rounded-xl bg-slate-950 h-10 w-full disabled:text-slate-500 disabled:border-slate-800 focus:border-sky-400 disabled:cursor-not-allowed"
          :disabled="props.inputDisabled"
          @change="emit('update:template', ($event.target as HTMLSelectElement).value as AiCanvasAssistRequest['template'])"
        >
          <option value="flowchart">流程图</option>
          <option value="mindmap">脑图</option>
          <option value="er">ER 图</option>
          <option value="architecture">架构图</option>
        </select>
      </label>
      <label class="block space-y-1">
        <span class="text-xs text-slate-300 font-semibold">AI 指令</span>
        <textarea
          :value="props.prompt"
          class="text-xs text-slate-100 leading-6 px-3 py-2 outline-none border border-slate-800 rounded-[18px] bg-slate-950 min-h-[84px] w-full disabled:text-slate-500 disabled:border-slate-900 focus:border-sky-400 disabled:cursor-not-allowed"
          :disabled="props.inputDisabled"
          placeholder="例如：生成一个从资料收集、评分映射、作品打磨到答辩准备的项目流程图。"
          @input="emit('update:prompt', ($event.target as HTMLTextAreaElement).value)"
        />
      </label>
    </div>

    <div class="mt-3 flex flex-wrap gap-2">
      <button
        class="text-xs text-slate-950 font-semibold px-3 py-2 rounded-2xl bg-sky-500 transition-colors disabled:text-slate-300 disabled:bg-slate-700 hover:bg-sky-400 disabled:cursor-not-allowed"
        type="button"
        :title="props.generateTitle"
        :disabled="props.running || !props.generateEnabled"
        @click="emit('runAction', 'generate')"
      >
        AI 生成
      </button>
      <button
        class="text-xs text-slate-100 font-semibold px-3 py-2 border border-slate-700 rounded-2xl bg-slate-900 transition-colors disabled:text-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed"
        type="button"
        :title="props.completeTitle"
        :disabled="props.running || !props.completeEnabled"
        @click="emit('runAction', 'complete')"
      >
        AI 补全
      </button>
      <button
        class="text-xs text-slate-100 font-semibold px-3 py-2 border border-slate-700 rounded-2xl bg-slate-900 transition-colors disabled:text-slate-500 hover:bg-slate-800 disabled:cursor-not-allowed"
        type="button"
        :title="props.refineTitle"
        :disabled="props.running || !props.refineEnabled"
        @click="emit('runAction', 'refine')"
      >
        AI 续改
      </button>
      <span
        v-if="props.previewPending"
        class="text-[10px] text-emerald-200 font-semibold px-2 py-1 border border-emerald-400/40 rounded-full bg-emerald-400/10 inline-flex items-center"
      >
        已生成预览，待手动导入
      </span>
    </div>

    <p
      v-if="props.errorText"
      class="text-xs text-rose-200 leading-5 mt-3 px-3 py-2 border border-rose-400/30 rounded-2xl bg-rose-400/10"
    >
      {{ props.errorText }}
    </p>
    <p
      v-else-if="props.runtimeErrorText"
      class="text-xs text-amber-200 leading-5 mt-3 px-3 py-2 border border-amber-400/30 rounded-2xl bg-amber-400/10"
    >
      {{ props.runtimeErrorText }}
    </p>

    <div
      v-if="props.messages.length > 0"
      class="mt-4 px-3 py-3 border border-slate-800 rounded-[20px] bg-slate-950/80"
      data-testid="workspace-canvas-ai-messages"
    >
      <div class="flex gap-3 items-center justify-between">
        <h5 class="text-[11px] text-slate-400 tracking-[0.16em] font-semibold uppercase">
          最近消息
        </h5>
        <span class="text-[10px] text-slate-500">
          最近 {{ props.messages.length }} 条
        </span>
      </div>

      <div class="mt-3 space-y-3">
        <article
          v-for="(message, index) in props.messages"
          :key="`canvas-ai-message-${index}`"
          class="px-3 py-3 border rounded-2xl"
          :class="message.role === 'assistant'
            ? 'border-slate-200 bg-white/95 text-slate-800'
            : 'border-sky-500/30 bg-sky-500/10 text-sky-100'"
        >
          <div class="text-[10px] tracking-[0.16em] font-semibold mb-2 opacity-70 uppercase">
            {{ message.role === 'assistant' ? 'AI' : '你' }}
          </div>
          <WorkspaceAssistantMessageContent
            v-if="message.role === 'assistant'"
            :message="message"
            @open-resource="emit('openResource', $event)"
          />
          <p
            v-else
            class="text-xs leading-6 whitespace-pre-wrap break-words"
          >
            {{ message.content }}
          </p>
        </article>
      </div>
    </div>
  </div>
</template>

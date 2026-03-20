<script setup lang="ts">
import type {
  AiChatSession,
  ChatMessage,
  Contest,
  Project,
  ProjectPayload,
  Resource,
  Track,
} from '~~/shared/types/domain'
import type { WorkspaceFormState, WorkspaceSidebarTab } from '~/types/workspace'

const props = withDefaults(defineProps<{
  sidebarTab?: WorkspaceSidebarTab
  chatSessions?: AiChatSession[]
  activeChatSessionId?: string
  chatSessionsLoading?: boolean
  chatMessages?: ChatMessage[]
  chatInput?: string
  chatLoading?: boolean
  chatDraft?: ProjectPayload | null
  chatMissingFields?: string[]
  normalizedInfo?: string
  selectedContest?: Contest | null
  selectedTrack?: Track | null
  selectedResources?: Resource[]
  formState: WorkspaceFormState
  formSubmitting?: boolean
  projects?: Project[]
}>(), {
  sidebarTab: 'chat',
  chatSessions: () => [],
  activeChatSessionId: '',
  chatSessionsLoading: false,
  chatMessages: () => [],
  chatInput: '',
  chatLoading: false,
  chatDraft: null,
  chatMissingFields: () => [],
  normalizedInfo: '',
  selectedContest: null,
  selectedTrack: null,
  selectedResources: () => [],
  formSubmitting: false,
  projects: () => [],
})

const emit = defineEmits<{
  'update:sidebarTab': [value: WorkspaceSidebarTab]
  'update:chatInput': [value: string]
  'update:formState': [value: WorkspaceFormState]
  'sendChat': []
  'switchChatSession': [sessionId: string]
  'createChatSession': []
  'fillForm': [draft: ProjectPayload]
  'submitProject': []
  'openProject': [projectId: string]
}>()

function updateFormField(key: keyof WorkspaceFormState, value: string) {
  emit('update:formState', {
    ...props.formState,
    [key]: value,
  })
}
</script>

<template>
  <aside class="w-full xl:w-88 border-l border-slate-200 bg-white flex flex-col shrink-0">
    <div class="flex border-b border-slate-200">
      <button
        class="flex-1 py-3 text-[11px] font-bold tracking-tight"
        :class="sidebarTab === 'chat' ? 'ide-tab-active' : 'ide-tab-inactive'"
        @click="emit('update:sidebarTab', 'chat')"
      >
        AI 辅助
      </button>
      <button
        class="flex-1 py-3 text-[11px] font-bold tracking-tight"
        :class="sidebarTab === 'rules' ? 'ide-tab-active' : 'ide-tab-inactive'"
        @click="emit('update:sidebarTab', 'rules')"
      >
        规则详情
      </button>
      <button
        class="flex-1 py-3 text-[11px] font-bold tracking-tight"
        :class="sidebarTab === 'submit' ? 'ide-tab-active' : 'ide-tab-inactive'"
        @click="emit('update:sidebarTab', 'submit')"
      >
        提交表单
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-4 no-scrollbar">
      <div v-if="sidebarTab === 'chat'" class="space-y-4 h-full flex flex-col">
        <div class="rounded border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div class="flex items-center justify-between">
            <div class="text-xs font-semibold text-slate-700">
              对话会话（{{ chatSessions.length }}）
            </div>
            <button
              class="h-7 rounded border border-slate-300 bg-white px-2 text-[11px] font-semibold hover:bg-slate-100"
              @click="emit('createChatSession')"
            >
              新建
            </button>
          </div>
          <div v-if="chatSessionsLoading" class="text-[11px] text-slate-500">
            会话加载中...
          </div>
          <div v-else-if="chatSessions.length === 0" class="text-[11px] text-slate-400">
            暂无会话，点击“新建”开始。
          </div>
          <div v-else class="max-h-28 overflow-y-auto space-y-1">
            <button
              v-for="session in chatSessions"
              :key="session.id"
              class="w-full rounded border px-2 py-1.5 text-left"
              :class="session.id === activeChatSessionId ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'"
              @click="emit('switchChatSession', session.id)"
            >
              <div class="truncate text-[11px] font-semibold text-slate-700">
                {{ session.title || 'AI 对话' }}
              </div>
              <div class="text-[10px] text-slate-500 mt-1">
                消息 {{ session.messageCount }} · {{ session.lastMessageAt || session.updatedAt }}
              </div>
            </button>
          </div>
        </div>

        <div class="flex-1 space-y-4">
          <div
            v-for="(message, index) in chatMessages"
            :key="`${message.role}-${index}`"
            class="flex items-start gap-2"
            :class="message.role === 'user' ? 'justify-end' : ''"
          >
            <div
              v-if="message.role !== 'user'"
              class="w-6 h-6 rounded bg-blue-600 text-white flex items-center justify-center shrink-0"
            >
              <span class="material-symbols-outlined text-sm">smart_toy</span>
            </div>
            <div
              class="max-w-[86%] p-3 rounded-lg text-[11px] leading-relaxed whitespace-pre-wrap"
              :class="message.role === 'user'
                ? 'bg-blue-50 border border-blue-100 text-blue-900 rounded-tr-none'
                : 'bg-slate-100 text-slate-700 rounded-tl-none'"
            >
              {{ message.content }}
            </div>
            <div
              v-if="message.role === 'user'"
              class="w-6 h-6 rounded bg-slate-200 flex items-center justify-center shrink-0 overflow-hidden"
            >
              <img
                alt="avatar"
                class="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCpeK3ZzVd7LtrOg5h6iFhJ5azRbuUFRmmaMGNaVkipoRx2KeXJvGzjOem-njmZ1X2K7E5eZq7iEGey_U1YoWT2pMOklyV-WBBdEXaeAsz-Gr76uirUlHq69Ry0Fs7j56my_Rkzmsqgd-IwpFzP7GnGQQLMOQ5ow_q8rIICxDOttJQY_PinNCZcLPjEAJaTIm6TZKjFhUquEDOc_dJHU_4nZZUHpVc9q77XvmnEtM5aBVMhBO4J0oNIfiA6rLO49eLZ9IVEQs_CTyPt"
              >
            </div>
          </div>
        </div>

        <div v-if="chatDraft" class="rounded border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div class="text-xs font-semibold text-slate-700">
            草案预览：{{ chatDraft.title }}
          </div>
          <div class="text-[11px] text-slate-500">
            {{ chatDraft.summary || '暂无摘要' }}
          </div>
          <div v-if="chatMissingFields.length > 0" class="text-[11px] text-amber-700">
            缺失字段：{{ chatMissingFields.join(', ') }}
          </div>
          <button
            class="h-8 w-full rounded border border-slate-300 bg-white text-xs font-semibold hover:bg-slate-100"
            @click="emit('fillForm', chatDraft)"
          >
            回填到表单继续完善
          </button>
        </div>

        <div class="mt-auto pt-4 border-t border-slate-100">
          <div class="relative">
            <textarea
              :value="chatInput"
              class="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 pr-10 text-xs focus:ring-1 focus:ring-blue-600 focus:border-blue-600 resize-none h-24 placeholder:text-slate-400"
              placeholder="询问 AI 或输入指令..."
              @input="emit('update:chatInput', ($event.target as HTMLTextAreaElement).value)"
            />
            <button
              class="absolute bottom-2 right-2 p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-500 disabled:opacity-60"
              :disabled="chatLoading"
              @click="emit('sendChat')"
            >
              <span class="material-symbols-outlined text-sm">{{ chatLoading ? 'hourglass_top' : 'send' }}</span>
            </button>
          </div>
        </div>
      </div>

      <div v-else-if="sidebarTab === 'rules'" class="space-y-3">
        <div class="rounded border border-slate-200 bg-slate-50 p-3">
          <div class="text-xs font-semibold text-slate-700">
            当前竞赛
          </div>
          <div class="text-[11px] text-slate-600 mt-1">
            {{ selectedContest?.name || '未选择竞赛' }}
          </div>
          <div class="text-[11px] text-slate-500 mt-1">
            赛道：{{ selectedTrack?.name || '未选择赛道' }}
          </div>
          <div class="text-[11px] text-slate-500 mt-1">
            主办方：{{ selectedContest?.organizer || '—' }}
          </div>
          <div class="text-[11px] text-slate-500 mt-1">
            报名窗口：{{ selectedContest?.registrationWindow || '—' }}
          </div>
        </div>
        <div class="rounded border border-slate-200 bg-white p-3">
          <div class="text-xs font-semibold text-slate-700 mb-2">
            标准化筛选结果
          </div>
          <pre class="m-0 text-[11px] whitespace-pre-wrap text-slate-600">{{ normalizedInfo || '{ }' }}</pre>
        </div>
        <div class="rounded border border-slate-200 bg-white p-3">
          <div class="text-xs font-semibold text-slate-700 mb-2">
            资料索引（{{ selectedResources.length }}）
          </div>
          <div class="space-y-2 max-h-72 overflow-y-auto">
            <div
              v-for="resource in selectedResources"
              :key="resource.id"
              class="rounded border border-slate-200 bg-slate-50 p-2"
            >
              <div class="text-[11px] font-semibold text-slate-700">
                {{ resource.title }}
              </div>
              <div class="text-[10px] text-slate-500 mt-1">
                {{ resource.type }} / {{ resource.year }} / {{ resource.availability }}
              </div>
            </div>
            <div v-if="selectedResources.length === 0" class="text-[11px] text-slate-400">
              当前暂无可展示资料。
            </div>
          </div>
        </div>
      </div>

      <div v-else class="space-y-3">
        <div class="rounded border border-slate-200 bg-white p-3 space-y-2">
          <div class="text-[11px] text-slate-500">
            当前竞赛：{{ selectedContest?.name || '未选择' }} / {{ selectedTrack?.name || '未选择赛道' }}
          </div>
          <input
            :value="formState.title"
            class="h-8 w-full rounded border border-slate-200 px-2 text-xs outline-none focus:border-blue-500"
            placeholder="项目标题"
            @input="updateFormField('title', ($event.target as HTMLInputElement).value)"
          >
          <textarea
            :value="formState.problemStatement"
            class="w-full rounded border border-slate-200 p-2 text-xs min-h-16 outline-none focus:border-blue-500"
            placeholder="问题定义"
            @input="updateFormField('problemStatement', ($event.target as HTMLTextAreaElement).value)"
          />
          <textarea
            :value="formState.innovationPointsText"
            class="w-full rounded border border-slate-200 p-2 text-xs min-h-14 outline-none focus:border-blue-500"
            placeholder="创新点（每行一条）"
            @input="updateFormField('innovationPointsText', ($event.target as HTMLTextAreaElement).value)"
          />
          <textarea
            :value="formState.techRouteStepsText"
            class="w-full rounded border border-slate-200 p-2 text-xs min-h-14 outline-none focus:border-blue-500"
            placeholder="技术路线（每行一步）"
            @input="updateFormField('techRouteStepsText', ($event.target as HTMLTextAreaElement).value)"
          />
          <textarea
            :value="formState.scoringMappingText"
            class="w-full rounded border border-slate-200 p-2 text-xs min-h-14 outline-none focus:border-blue-500"
            placeholder="评分映射（每行一条）"
            @input="updateFormField('scoringMappingText', ($event.target as HTMLTextAreaElement).value)"
          />
          <textarea
            :value="formState.risksText"
            class="w-full rounded border border-slate-200 p-2 text-xs min-h-14 outline-none focus:border-blue-500"
            placeholder="风险项（每行一条）"
            @input="updateFormField('risksText', ($event.target as HTMLTextAreaElement).value)"
          />
          <textarea
            :value="formState.deliverablesText"
            class="w-full rounded border border-slate-200 p-2 text-xs min-h-14 outline-none focus:border-blue-500"
            placeholder="交付物（每行一条）"
            @input="updateFormField('deliverablesText', ($event.target as HTMLTextAreaElement).value)"
          />
          <textarea
            :value="formState.summary"
            class="w-full rounded border border-slate-200 p-2 text-xs min-h-12 outline-none focus:border-blue-500"
            placeholder="摘要"
            @input="updateFormField('summary', ($event.target as HTMLTextAreaElement).value)"
          />
          <button
            class="h-9 w-full rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-60"
            :disabled="formSubmitting"
            @click="emit('submitProject')"
          >
            {{ formSubmitting ? '提交中...' : '创建项目' }}
          </button>
        </div>

        <div class="rounded border border-slate-200 bg-white p-3">
          <div class="text-xs font-semibold text-slate-700 mb-2">
            已创建项目（{{ projects.length }}）
          </div>
          <div class="space-y-2 max-h-62 overflow-y-auto">
            <button
              v-for="project in projects"
              :key="project.id"
              class="w-full rounded border border-slate-200 p-2 text-left hover:border-slate-300"
              @click="emit('openProject', project.id)"
            >
              <div class="text-xs font-semibold text-slate-700">
                {{ project.title }}
              </div>
              <div class="text-[10px] text-slate-500 mt-1">
                source={{ project.source }} / status={{ project.status }} / {{ project.updatedAt }}
              </div>
            </button>
            <div v-if="projects.length === 0" class="text-[11px] text-slate-400">
              还没有项目记录，先通过 AI 对话或表单创建一个。
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="p-4 border-t border-slate-200 bg-slate-50/60">
      <button class="w-full bg-slate-900 text-white font-bold py-2.5 rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-xs">
        <span>预览最终申报材料</span>
        <span class="material-symbols-outlined text-sm">visibility</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.ide-tab-active {
  border-bottom: 2px solid #2563eb;
  color: #2563eb;
}

.ide-tab-inactive {
  color: #64748b;
}

.ide-tab-inactive:hover {
  color: #1e293b;
  background-color: #f1f5f9;
}
</style>

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
  <aside class="border-l border-slate-200 bg-white flex shrink-0 flex-col w-full xl:w-88">
    <div class="border-b border-slate-200 flex">
      <button
        class="text-[11px] tracking-tight font-bold py-3 flex-1"
        :class="sidebarTab === 'chat' ? 'ide-tab-active' : 'ide-tab-inactive'"
        @click="emit('update:sidebarTab', 'chat')"
      >
        AI 辅助
      </button>
      <button
        class="text-[11px] tracking-tight font-bold py-3 flex-1"
        :class="sidebarTab === 'rules' ? 'ide-tab-active' : 'ide-tab-inactive'"
        @click="emit('update:sidebarTab', 'rules')"
      >
        规则详情
      </button>
      <button
        class="text-[11px] tracking-tight font-bold py-3 flex-1"
        :class="sidebarTab === 'submit' ? 'ide-tab-active' : 'ide-tab-inactive'"
        @click="emit('update:sidebarTab', 'submit')"
      >
        提交表单
      </button>
    </div>

    <div class="no-scrollbar p-4 flex-1 overflow-y-auto">
      <div v-if="sidebarTab === 'chat'" class="flex flex-col h-full space-y-4">
        <div class="p-3 border border-slate-200 rounded bg-slate-50 space-y-2">
          <div class="flex items-center justify-between">
            <div class="text-xs text-slate-700 font-semibold">
              对话会话（{{ chatSessions.length }}）
            </div>
            <button
              class="text-[11px] font-semibold px-2 border border-slate-300 rounded bg-white h-7 hover:bg-slate-100"
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
              class="px-2 py-1.5 text-left border rounded w-full"
              :class="session.id === activeChatSessionId ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'"
              @click="emit('switchChatSession', session.id)"
            >
              <div class="text-[11px] text-slate-700 font-semibold truncate">
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
            class="flex gap-2 items-start"
            :class="message.role === 'user' ? 'justify-end' : ''"
          >
            <div
              v-if="message.role !== 'user'"
              class="text-white rounded bg-blue-600 flex shrink-0 h-6 w-6 items-center justify-center"
            >
              <span class="material-symbols-outlined text-sm">smart_toy</span>
            </div>
            <div
              class="text-[11px] leading-relaxed p-3 rounded-lg max-w-[86%] whitespace-pre-wrap"
              :class="message.role === 'user'
                ? 'bg-blue-50 border border-blue-100 text-blue-900 rounded-tr-none'
                : 'bg-slate-100 text-slate-700 rounded-tl-none'"
            >
              {{ message.content }}
            </div>
            <div
              v-if="message.role === 'user'"
              class="rounded bg-slate-200 flex shrink-0 h-6 w-6 items-center justify-center overflow-hidden"
            >
              <img
                alt="avatar"
                class="h-full w-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCpeK3ZzVd7LtrOg5h6iFhJ5azRbuUFRmmaMGNaVkipoRx2KeXJvGzjOem-njmZ1X2K7E5eZq7iEGey_U1YoWT2pMOklyV-WBBdEXaeAsz-Gr76uirUlHq69Ry0Fs7j56my_Rkzmsqgd-IwpFzP7GnGQQLMOQ5ow_q8rIICxDOttJQY_PinNCZcLPjEAJaTIm6TZKjFhUquEDOc_dJHU_4nZZUHpVc9q77XvmnEtM5aBVMhBO4J0oNIfiA6rLO49eLZ9IVEQs_CTyPt"
              >
            </div>
          </div>
        </div>

        <div v-if="chatDraft" class="p-3 border border-slate-200 rounded bg-slate-50 space-y-2">
          <div class="text-xs text-slate-700 font-semibold">
            草案预览：{{ chatDraft.title }}
          </div>
          <div class="text-[11px] text-slate-500">
            {{ chatDraft.summary || '暂无摘要' }}
          </div>
          <div v-if="chatMissingFields.length > 0" class="text-[11px] text-amber-700">
            缺失字段：{{ chatMissingFields.join(', ') }}
          </div>
          <button
            class="text-xs font-semibold border border-slate-300 rounded bg-white h-8 w-full hover:bg-slate-100"
            @click="emit('fillForm', chatDraft)"
          >
            回填到表单继续完善
          </button>
        </div>

        <div class="mt-auto pt-4 border-t border-slate-100">
          <div class="relative">
            <textarea
              :value="chatInput"
              class="text-xs p-2.5 pr-10 border border-slate-200 rounded-lg bg-slate-50 h-24 w-full resize-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              placeholder="询问 AI 或输入指令..."
              @input="emit('update:chatInput', ($event.target as HTMLTextAreaElement).value)"
            />
            <button
              class="text-white p-1.5 rounded-md bg-blue-600 bottom-2 right-2 absolute hover:bg-blue-500 disabled:opacity-60"
              :disabled="chatLoading"
              @click="emit('sendChat')"
            >
              <span class="material-symbols-outlined text-sm">{{ chatLoading ? 'hourglass_top' : 'send' }}</span>
            </button>
          </div>
        </div>
      </div>

      <div v-else-if="sidebarTab === 'rules'" class="space-y-3">
        <div class="p-3 border border-slate-200 rounded bg-slate-50">
          <div class="text-xs text-slate-700 font-semibold">
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
        <div class="p-3 border border-slate-200 rounded bg-white">
          <div class="text-xs text-slate-700 font-semibold mb-2">
            标准化筛选结果
          </div>
          <pre class="text-[11px] text-slate-600 m-0 whitespace-pre-wrap">{{ normalizedInfo || '{ }' }}</pre>
        </div>
        <div class="p-3 border border-slate-200 rounded bg-white">
          <div class="text-xs text-slate-700 font-semibold mb-2">
            资料索引（{{ selectedResources.length }}）
          </div>
          <div class="max-h-72 overflow-y-auto space-y-2">
            <div
              v-for="resource in selectedResources"
              :key="resource.id"
              class="p-2 border border-slate-200 rounded bg-slate-50"
            >
              <div class="text-[11px] text-slate-700 font-semibold">
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
        <div class="p-3 border border-slate-200 rounded bg-white space-y-2">
          <div class="text-[11px] text-slate-500">
            当前竞赛：{{ selectedContest?.name || '未选择' }} / {{ selectedTrack?.name || '未选择赛道' }}
          </div>
          <input
            :value="formState.title"
            class="text-xs px-2 outline-none border border-slate-200 rounded h-8 w-full focus:border-blue-500"
            placeholder="项目标题"
            @input="updateFormField('title', ($event.target as HTMLInputElement).value)"
          >
          <textarea
            :value="formState.problemStatement"
            class="text-xs p-2 outline-none border border-slate-200 rounded min-h-16 w-full focus:border-blue-500"
            placeholder="问题定义"
            @input="updateFormField('problemStatement', ($event.target as HTMLTextAreaElement).value)"
          />
          <textarea
            :value="formState.innovationPointsText"
            class="text-xs p-2 outline-none border border-slate-200 rounded min-h-14 w-full focus:border-blue-500"
            placeholder="创新点（每行一条）"
            @input="updateFormField('innovationPointsText', ($event.target as HTMLTextAreaElement).value)"
          />
          <textarea
            :value="formState.techRouteStepsText"
            class="text-xs p-2 outline-none border border-slate-200 rounded min-h-14 w-full focus:border-blue-500"
            placeholder="技术路线（每行一步）"
            @input="updateFormField('techRouteStepsText', ($event.target as HTMLTextAreaElement).value)"
          />
          <textarea
            :value="formState.scoringMappingText"
            class="text-xs p-2 outline-none border border-slate-200 rounded min-h-14 w-full focus:border-blue-500"
            placeholder="评分映射（每行一条）"
            @input="updateFormField('scoringMappingText', ($event.target as HTMLTextAreaElement).value)"
          />
          <textarea
            :value="formState.risksText"
            class="text-xs p-2 outline-none border border-slate-200 rounded min-h-14 w-full focus:border-blue-500"
            placeholder="风险项（每行一条）"
            @input="updateFormField('risksText', ($event.target as HTMLTextAreaElement).value)"
          />
          <textarea
            :value="formState.deliverablesText"
            class="text-xs p-2 outline-none border border-slate-200 rounded min-h-14 w-full focus:border-blue-500"
            placeholder="交付物（每行一条）"
            @input="updateFormField('deliverablesText', ($event.target as HTMLTextAreaElement).value)"
          />
          <textarea
            :value="formState.summary"
            class="text-xs p-2 outline-none border border-slate-200 rounded min-h-12 w-full focus:border-blue-500"
            placeholder="摘要"
            @input="updateFormField('summary', ($event.target as HTMLTextAreaElement).value)"
          />
          <button
            class="text-xs text-white font-semibold rounded bg-blue-600 h-9 w-full hover:bg-blue-500 disabled:opacity-60"
            :disabled="formSubmitting"
            @click="emit('submitProject')"
          >
            {{ formSubmitting ? '提交中...' : '创建项目' }}
          </button>
        </div>

        <div class="p-3 border border-slate-200 rounded bg-white">
          <div class="text-xs text-slate-700 font-semibold mb-2">
            已创建项目（{{ projects.length }}）
          </div>
          <div class="max-h-62 overflow-y-auto space-y-2">
            <button
              v-for="project in projects"
              :key="project.id"
              class="p-2 text-left border border-slate-200 rounded w-full hover:border-slate-300"
              @click="emit('openProject', project.id)"
            >
              <div class="text-xs text-slate-700 font-semibold">
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
      <button class="text-xs text-white font-bold py-2.5 rounded-lg bg-slate-900 flex gap-2 w-full transition-opacity items-center justify-center hover:opacity-90">
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

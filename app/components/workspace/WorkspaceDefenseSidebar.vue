<script setup lang="ts">
import type {
  AiChatSession,
  AiDefenseJudgeRound,
  AiDefensePersona,
  AiDefensePersonaJudgeType,
  AiDefenseScorecard,
  AiDefenseSessionState,
  ProjectMeeting,
  ProjectMeetingDetail,
  ProjectMeetingRuntimeHealth,
} from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  contestName?: string
  trackName?: string
  sessionMeta?: AiChatSession | null
  sessionState?: AiDefenseSessionState | null
  personas?: AiDefensePersona[]
  scorecard?: AiDefenseScorecard | null
  rounds?: AiDefenseJudgeRound[]
  linkedMeeting?: ProjectMeeting | ProjectMeetingDetail | null
  meetingRuntimeHealth?: ProjectMeetingRuntimeHealth | null
}>(), {
  contestName: '',
  trackName: '',
  sessionMeta: null,
  sessionState: null,
  personas: () => [],
  scorecard: null,
  rounds: () => [],
  linkedMeeting: null,
  meetingRuntimeHealth: null,
})

const emit = defineEmits<{
  importPersonas: []
  savePersona: [payload: {
    personaId?: string
    judgeType: AiDefensePersonaJudgeType
    name: string
    summary: string
    systemPrompt: string
    focusAreas: string[]
    enabled: boolean
  }]
  deletePersona: [personaId: string]
}>()

const personaFormVisible = ref(false)
const personaEditingId = ref('')
const personaForm = reactive<{
  judgeType: AiDefensePersonaJudgeType
  name: string
  summary: string
  systemPrompt: string
  focusAreasText: string
  enabled: boolean
}>({
  judgeType: 'custom',
  name: '',
  summary: '',
  systemPrompt: '',
  focusAreasText: '',
  enabled: true,
})

const personaJudgeTypeOptions = [
  { value: 'technical', label: 'technical' },
  { value: 'business', label: 'business' },
  { value: 'expression', label: 'expression' },
  { value: 'custom', label: 'custom' },
] as const

const showcaseDefensePersonas: AiDefensePersona[] = [
  {
    id: 'showcase-technical',
    projectId: 'showcase-project',
    sourceContestId: null,
    sourceTrackId: null,
    sourceTemplateKey: 'technical-review',
    judgeType: 'technical',
    name: '技术评委 · 周启',
    summary: '关注架构边界、实时链路稳定性、知识索引可信度和工程落地成本。',
    systemPrompt: '你是技术评委，重点追问系统架构、数据流、权限边界、异常降级和可复现证据。',
    focusAreas: ['AI 编排', '知识索引', '实时链路', '异常降级'],
    scoringRubric: [
      {
        key: 'architecture',
        name: '架构完整性',
        weight: 0.34,
        description: '服务边界、状态流转和降级路径是否清晰。',
        scoringPoint: '能说明前端工作台、服务端编排和索引召回职责。',
        deductionPoint: '只描述功能效果，缺少工程边界。',
        evidenceRequirement: '技术路线图、provider 状态、索引引用示例。',
      },
      {
        key: 'reliability',
        name: '可靠性',
        weight: 0.33,
        description: '实时答辩和 AI provider 失败时是否具备可解释恢复路径。',
        scoringPoint: '能展示授权状态、重连入口和禁用原因。',
        deductionPoint: '失败时界面静默或给出不可信结果。',
        evidenceRequirement: '实时控制台、运行日志、降级说明。',
      },
    ],
    enabled: true,
    sortOrder: 10,
    isCustomized: false,
    createdByUserId: 'showcase-user',
    updatedByUserId: 'showcase-user',
    createdAt: '2026-05-06T08:30:00.000+08:00',
    updatedAt: '2026-05-06T09:42:00.000+08:00',
  },
  {
    id: 'showcase-business',
    projectId: 'showcase-project',
    sourceContestId: null,
    sourceTrackId: null,
    sourceTemplateKey: 'business-review',
    judgeType: 'business',
    name: '业务评委 · 何砚',
    summary: '关注参赛团队价值、流程闭环、量化收益和终审材料交付质量。',
    systemPrompt: '你是业务评委，重点追问用户价值、落地路径、团队协作收益和评分点映射。',
    focusAreas: ['用户价值', '流程闭环', '量化指标', '交付清单'],
    scoringRubric: [
      {
        key: 'value',
        name: '用户价值',
        weight: 0.4,
        description: '是否清楚回答目标团队为什么需要这个工作台。',
        scoringPoint: '能将资料沉淀、AI 协作和终审答辩串成闭环。',
        deductionPoint: '只罗列模块，缺少业务结果。',
        evidenceRequirement: '角色分工、流程画布、收益指标。',
      },
      {
        key: 'delivery',
        name: '交付质量',
        weight: 0.3,
        description: '终审材料是否可直接服务评委理解和复核。',
        scoringPoint: '材料命名、评分映射和证据路径清晰。',
        deductionPoint: '附件偏内部化，无法快速判断价值。',
        evidenceRequirement: '终审导出包、评分点映射表。',
      },
    ],
    enabled: true,
    sortOrder: 20,
    isCustomized: false,
    createdByUserId: 'showcase-user',
    updatedByUserId: 'showcase-user',
    createdAt: '2026-05-06T08:31:00.000+08:00',
    updatedAt: '2026-05-06T09:40:00.000+08:00',
  },
  {
    id: 'showcase-expression',
    projectId: 'showcase-project',
    sourceContestId: null,
    sourceTrackId: null,
    sourceTemplateKey: 'expression-review',
    judgeType: 'expression',
    name: '表达评委 · 陆晨',
    summary: '关注答辩结构、证据顺序、非技术评委理解成本和现场收束能力。',
    systemPrompt: '你是表达评委，重点追问开场结构、关键句、证据组织、时间控制和临场回应。',
    focusAreas: ['开场结构', '证据组织', '时间控制', '现场回应'],
    scoringRubric: [
      {
        key: 'structure',
        name: '表达结构',
        weight: 0.45,
        description: '是否能用清晰顺序完成项目介绍和答辩回应。',
        scoringPoint: '回答遵循问题、方案、证据、收益。',
        deductionPoint: '术语堆叠，关键价值出现过晚。',
        evidenceRequirement: '90 秒开场稿、结束页总结。',
      },
      {
        key: 'response',
        name: '临场回应',
        weight: 0.35,
        description: '是否能直接回答追问并主动补边界。',
        scoringPoint: '回答短、准、可验证。',
        deductionPoint: '绕开问题或引入新概念。',
        evidenceRequirement: '答辩时间线、追问记录。',
      },
    ],
    enabled: true,
    sortOrder: 30,
    isCustomized: false,
    createdByUserId: 'showcase-user',
    updatedByUserId: 'showcase-user',
    createdAt: '2026-05-06T08:32:00.000+08:00',
    updatedAt: '2026-05-06T09:39:00.000+08:00',
  },
  {
    id: 'showcase-data',
    projectId: 'showcase-project',
    sourceContestId: null,
    sourceTrackId: null,
    sourceTemplateKey: 'data-review',
    judgeType: 'custom',
    name: '数据评委 · 孟也',
    summary: '关注资料来源、引用一致性、指标口径和索引更新后的证据可信度。',
    systemPrompt: '你是数据评委，重点追问数据来源、指标口径、索引更新、引用路径和复核方式。',
    focusAreas: ['数据来源', '引用路径', '指标口径', '复核方式'],
    scoringRubric: [
      {
        key: 'traceability',
        name: '可追溯性',
        weight: 0.5,
        description: '关键结论是否能追溯到项目资料和引用片段。',
        scoringPoint: '能展示资源路径、引用片段和更新时间。',
        deductionPoint: '指标没有来源，引用无法复核。',
        evidenceRequirement: '知识引用、资源详情、索引更新时间。',
      },
      {
        key: 'metrics',
        name: '指标口径',
        weight: 0.3,
        description: '量化收益是否有明确采集范围和计算方式。',
        scoringPoint: '能说明耗时、轮次、追溯率等指标定义。',
        deductionPoint: '只给数字，缺少采集方式。',
        evidenceRequirement: '指标说明页、项目日志、终审摘要。',
      },
    ],
    enabled: true,
    sortOrder: 40,
    isCustomized: true,
    createdByUserId: 'showcase-user',
    updatedByUserId: 'showcase-user',
    createdAt: '2026-05-06T08:33:00.000+08:00',
    updatedAt: '2026-05-06T09:38:00.000+08:00',
  },
]

const showcaseDefenseRounds: AiDefenseJudgeRound[] = [
  {
    judge: '表达评委 · 陆晨',
    judgeType: 'expression',
    personaId: 'showcase-expression',
    stage: 'closing',
    turnIndex: 8,
    question: '如果只剩 45 秒收束，你会如何把项目价值、技术可信度和落地路径压成一个闭环？',
    score: 87,
    comment: '收束结构清楚，结束句需要更明确地回到评分指标。',
    followUp: '准备一句可直接放在结束页的总结。',
    evidenceRefs: [],
    createdAt: '2026-05-06T09:42:00.000+08:00',
  },
  {
    judge: '数据评委 · 孟也',
    judgeType: 'custom',
    personaId: 'showcase-data',
    stage: 'qa',
    turnIndex: 7,
    question: '知识索引返回的证据如何保证和当前项目资料一致？',
    score: 85,
    comment: '索引重建和引用路径已经说明，建议补充失败提示。',
    followUp: '现场展示资料更新后的重新索引入口。',
    evidenceRefs: [],
    createdAt: '2026-05-06T09:38:00.000+08:00',
  },
  {
    judge: '技术评委 · 周启',
    judgeType: 'technical',
    personaId: 'showcase-technical',
    stage: 'qa',
    turnIndex: 6,
    question: '实时答辩链路依赖外部 provider，断连或鉴权失败时产品如何降级？',
    score: 89,
    comment: '连接状态、媒体授权和重连入口说明完整。',
    followUp: '将安全边界补到技术答辩页。',
    evidenceRefs: [],
    createdAt: '2026-05-06T09:33:00.000+08:00',
  },
  {
    judge: '业务评委 · 何砚',
    judgeType: 'business',
    personaId: 'showcase-business',
    stage: 'qa',
    turnIndex: 5,
    question: '和普通协作文档相比，竞赛全过程闭环体现在哪里？',
    score: 90,
    comment: '业务链路完整，建议补充效率指标。',
    followUp: '补资料查找耗时和终审整理轮次。',
    evidenceRefs: [],
    createdAt: '2026-05-06T09:29:00.000+08:00',
  },
]

const showcaseDefenseScorecard: AiDefenseScorecard = {
  technical: 88,
  business: 90,
  expression: 86,
  total: 88,
  summary: '答辩已经形成项目资料、知识索引、AI 协作、实时答辩和终审导出的完整闭环。下一步重点补强量化指标、引用复核路径和 45 秒收束句。',
  materialGaps: [
    '资料更新后的重新索引说明',
    '效率提升指标采集口径',
    '实时链路失败后的降级截图',
  ],
  actionItems: [
    '把评分点映射表加入终审导出包',
    '补一页 AI 安全边界和人工确认机制',
    '整理 90 秒开场稿和 45 秒收束句',
  ],
}

const usingShowcasePersonas = computed(() => props.personas.length === 0)
const displayPersonas = computed(() => usingShowcasePersonas.value ? showcaseDefensePersonas : props.personas)
const displayRounds = computed(() => props.rounds.length > 0 ? props.rounds : showcaseDefenseRounds)
const displayScorecard = computed(() => props.scorecard || props.sessionState?.lastScorecard || showcaseDefenseScorecard)
const activePersonaPopoverId = ref('')
const activePersonaPopoverStyle = ref<Record<string, string>>({
  top: '0px',
  left: '0px',
})

const PERSONA_POPOVER_WIDTH = 300
const PERSONA_POPOVER_GAP = 12
const PERSONA_POPOVER_MARGIN = 12
const PERSONA_POPOVER_ESTIMATED_HEIGHT = 280

let personaPopoverTriggerElement: HTMLElement | null = null
let personaPopoverLayoutFrame: number | null = null

const currentPersonaIdSet = computed(() => {
  return new Set(
    displayRounds.value
      .map(item => String(item.personaId || '').trim())
      .filter(Boolean),
  )
})

const sortedPersonas = computed(() => {
  return [...displayPersonas.value].sort((left, right) => {
    if (left.enabled !== right.enabled)
      return left.enabled ? -1 : 1
    return Number(left.sortOrder || 0) - Number(right.sortOrder || 0)
  })
})

const activePersonaPopover = computed(() => {
  return sortedPersonas.value.find(persona => persona.id === activePersonaPopoverId.value) || null
})

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function buildPersonaPopoverStyle(triggerElement: HTMLElement): Record<string, string> {
  const rect = triggerElement.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const width = Math.min(
    PERSONA_POPOVER_WIDTH,
    Math.max(220, viewportWidth - PERSONA_POPOVER_MARGIN * 2),
  )
  const maxLeft = Math.max(PERSONA_POPOVER_MARGIN, viewportWidth - PERSONA_POPOVER_MARGIN - width)
  const rightSideLeft = rect.right + PERSONA_POPOVER_GAP
  const leftSideLeft = rect.left - PERSONA_POPOVER_GAP - width
  const preferredLeft = rightSideLeft + width <= viewportWidth - PERSONA_POPOVER_MARGIN
    ? rightSideLeft
    : leftSideLeft
  const maxTop = Math.max(
    PERSONA_POPOVER_MARGIN,
    viewportHeight - PERSONA_POPOVER_MARGIN - PERSONA_POPOVER_ESTIMATED_HEIGHT,
  )

  return {
    top: `${clampNumber(rect.top, PERSONA_POPOVER_MARGIN, maxTop)}px`,
    left: `${clampNumber(preferredLeft, PERSONA_POPOVER_MARGIN, maxLeft)}px`,
    width: `${width}px`,
  }
}

function cancelPersonaPopoverLayout(): void {
  if (!import.meta.client || personaPopoverLayoutFrame === null)
    return

  cancelAnimationFrame(personaPopoverLayoutFrame)
  personaPopoverLayoutFrame = null
}

function updatePersonaPopoverLayout(): void {
  if (!import.meta.client || !personaPopoverTriggerElement)
    return

  activePersonaPopoverStyle.value = buildPersonaPopoverStyle(personaPopoverTriggerElement)
}

function schedulePersonaPopoverLayout(): void {
  if (!import.meta.client || !activePersonaPopoverId.value || !personaPopoverTriggerElement)
    return

  cancelPersonaPopoverLayout()
  personaPopoverLayoutFrame = requestAnimationFrame(() => {
    personaPopoverLayoutFrame = null
    updatePersonaPopoverLayout()
  })
}

function showPersonaPopover(persona: AiDefensePersona, event: MouseEvent | FocusEvent): void {
  if (!import.meta.client || !(event.currentTarget instanceof HTMLElement))
    return

  personaPopoverTriggerElement = event.currentTarget
  activePersonaPopoverStyle.value = buildPersonaPopoverStyle(event.currentTarget)
  activePersonaPopoverId.value = persona.id
  schedulePersonaPopoverLayout()
}

function hidePersonaPopover(personaId?: string): void {
  if (personaId && activePersonaPopoverId.value !== personaId)
    return

  activePersonaPopoverId.value = ''
  personaPopoverTriggerElement = null
  cancelPersonaPopoverLayout()
}

function handlePersonaPopoverFocusOut(persona: AiDefensePersona, event: FocusEvent): void {
  const currentTarget = event.currentTarget
  const nextTarget = event.relatedTarget
  if (
    currentTarget instanceof HTMLElement
    && nextTarget instanceof Node
    && currentTarget.contains(nextTarget)
  ) {
    return
  }

  hidePersonaPopover(persona.id)
}

function handlePersonaPopoverViewportChange(): void {
  schedulePersonaPopoverLayout()
}

onMounted(() => {
  if (!import.meta.client)
    return

  window.addEventListener('resize', handlePersonaPopoverViewportChange)
  window.addEventListener('scroll', handlePersonaPopoverViewportChange, true)
})

onBeforeUnmount(() => {
  if (!import.meta.client)
    return

  window.removeEventListener('resize', handlePersonaPopoverViewportChange)
  window.removeEventListener('scroll', handlePersonaPopoverViewportChange, true)
  cancelPersonaPopoverLayout()
})

function resolvePersonaBadge(persona: AiDefensePersona): { label: string, className: string } {
  if (currentPersonaIdSet.value.has(String(persona.id || '').trim())) {
    return {
      label: '当前轮次',
      className: 'workspace-defense-sidebar__persona-badge workspace-defense-sidebar__persona-badge--active',
    }
  }
  if (persona.enabled) {
    return {
      label: '待命',
      className: 'workspace-defense-sidebar__persona-badge workspace-defense-sidebar__persona-badge--ready',
    }
  }
  return {
    label: '停用',
    className: 'workspace-defense-sidebar__persona-badge workspace-defense-sidebar__persona-badge--muted',
  }
}

function resetPersonaForm(): void {
  personaEditingId.value = ''
  personaForm.judgeType = 'custom'
  personaForm.name = ''
  personaForm.summary = ''
  personaForm.systemPrompt = ''
  personaForm.focusAreasText = ''
  personaForm.enabled = true
}

function openCreatePersonaForm(): void {
  resetPersonaForm()
  personaFormVisible.value = true
}

function openEditPersonaForm(persona: AiDefensePersona): void {
  personaEditingId.value = persona.id
  personaForm.judgeType = persona.judgeType
  personaForm.name = persona.name
  personaForm.summary = persona.summary
  personaForm.systemPrompt = persona.systemPrompt
  personaForm.focusAreasText = (persona.focusAreas || []).join('\n')
  personaForm.enabled = persona.enabled
  personaFormVisible.value = true
}

function submitPersonaForm(): void {
  const name = personaForm.name.trim()
  const systemPrompt = personaForm.systemPrompt.trim()
  if (!name || !systemPrompt)
    return

  emit('savePersona', {
    personaId: personaEditingId.value || undefined,
    judgeType: personaForm.judgeType,
    name,
    summary: personaForm.summary.trim(),
    systemPrompt,
    focusAreas: personaForm.focusAreasText
      .split(/\n+/)
      .map(item => item.trim())
      .filter(Boolean),
    enabled: personaForm.enabled,
  })
  personaFormVisible.value = false
  resetPersonaForm()
}

function quickTogglePersona(persona: AiDefensePersona): void {
  emit('savePersona', {
    personaId: persona.id,
    judgeType: persona.judgeType,
    name: persona.name,
    summary: persona.summary,
    systemPrompt: persona.systemPrompt,
    focusAreas: persona.focusAreas || [],
    enabled: !persona.enabled,
  })
}
</script>

<template>
  <aside
    data-testid="workspace-defense-sidebar"
    class="workspace-defense-sidebar"
  >
    <section
      data-testid="workspace-defense-persona-list"
      class="workspace-defense-sidebar__personas"
    >
      <header class="workspace-defense-sidebar__personas-header">
        <div>
          <p class="workspace-defense-sidebar__eyebrow">
            评委列表
          </p>
          <h3 class="workspace-defense-sidebar__personas-title">
            当前答辩席
          </h3>
        </div>
        <div class="workspace-defense-sidebar__personas-actions">
          <button
            class="workspace-defense-sidebar__text-action"
            type="button"
            @click="emit('importPersonas')"
          >
            导入
          </button>
          <button
            class="workspace-defense-sidebar__text-action"
            type="button"
            @click="openCreatePersonaForm"
          >
            新增
          </button>
        </div>
      </header>

      <div v-if="sortedPersonas.length === 0" class="workspace-defense-sidebar__empty">
        当前项目还没有答辩评委人设。可在这里导入比赛预设或新增评委。
      </div>

      <div v-else class="workspace-defense-sidebar__persona-list">
        <article
          v-for="persona in sortedPersonas"
          :key="persona.id"
          class="workspace-defense-sidebar__persona"
          :data-active="currentPersonaIdSet.has(String(persona.id || '').trim()) ? 'true' : 'false'"
          tabindex="0"
          :aria-describedby="activePersonaPopoverId === persona.id ? 'workspace-defense-sidebar-persona-popover' : undefined"
          @mouseenter="showPersonaPopover(persona, $event)"
          @mouseleave="hidePersonaPopover(persona.id)"
          @focusin="showPersonaPopover(persona, $event)"
          @focusout="handlePersonaPopoverFocusOut(persona, $event)"
          @keydown.esc="hidePersonaPopover(persona.id)"
        >
          <div class="workspace-defense-sidebar__persona-topline">
            <div>
              <strong class="workspace-defense-sidebar__persona-name">{{ persona.name }}</strong>
              <p class="workspace-defense-sidebar__persona-meta">
                {{ persona.judgeType }} · {{ persona.focusAreas.slice(0, 2).join('、') || '未设置关注点' }}
              </p>
            </div>
            <span :class="resolvePersonaBadge(persona).className">
              {{ resolvePersonaBadge(persona).label }}
            </span>
          </div>

          <p class="workspace-defense-sidebar__persona-summary">
            {{ persona.summary || '当前评委暂无摘要描述。' }}
          </p>

          <div v-if="!usingShowcasePersonas" class="workspace-defense-sidebar__persona-actions">
            <button
              class="workspace-defense-sidebar__mini-action"
              type="button"
              @click="quickTogglePersona(persona)"
            >
              {{ persona.enabled ? '停用' : '启用' }}
            </button>
            <button
              class="workspace-defense-sidebar__mini-action"
              type="button"
              @click="openEditPersonaForm(persona)"
            >
              编辑
            </button>
            <button
              class="workspace-defense-sidebar__mini-action workspace-defense-sidebar__mini-action--danger"
              type="button"
              @click="emit('deletePersona', persona.id)"
            >
              删除
            </button>
          </div>
        </article>
      </div>

      <Teleport to="body">
        <aside
          v-if="activePersonaPopover"
          id="workspace-defense-sidebar-persona-popover"
          class="workspace-defense-sidebar__persona-popover"
          :style="activePersonaPopoverStyle"
          role="tooltip"
        >
          <div class="workspace-defense-sidebar__popover-header">
            <strong>{{ activePersonaPopover.name }}</strong>
            <span>{{ activePersonaPopover.judgeType }} · {{ activePersonaPopover.enabled ? '已启用' : '已停用' }}</span>
          </div>
          <p>{{ activePersonaPopover.summary || '当前评委暂无摘要描述。' }}</p>
          <p v-if="activePersonaPopover.focusAreas.length > 0">
            关注点：{{ activePersonaPopover.focusAreas.join('、') }}
          </p>
          <p v-if="activePersonaPopover.scoringRubric.length > 0">
            评分维度：{{ activePersonaPopover.scoringRubric.map(item => item.name).join('、') }}
          </p>
          <p class="workspace-defense-sidebar__popover-prompt">
            {{ activePersonaPopover.systemPrompt }}
          </p>
        </aside>
      </Teleport>

      <form
        v-if="personaFormVisible"
        class="workspace-defense-sidebar__persona-form"
        @submit.prevent="submitPersonaForm"
      >
        <div class="workspace-defense-sidebar__form-header">
          <strong>{{ personaEditingId ? '编辑人设' : '新增人设' }}</strong>
          <button
            class="workspace-defense-sidebar__mini-action"
            type="button"
            @click="personaFormVisible = false"
          >
            取消
          </button>
        </div>
        <UiSelect
          v-model="personaForm.judgeType"
          :options="personaJudgeTypeOptions"
          size="xs"
          aria-label="评委类型"
          class="w-full"
        />
        <input v-model="personaForm.name" class="workspace-defense-sidebar__input" placeholder="人设名称">
        <textarea v-model="personaForm.summary" class="workspace-defense-sidebar__textarea" placeholder="一句话说明评委关注点" />
        <textarea v-model="personaForm.systemPrompt" class="workspace-defense-sidebar__textarea workspace-defense-sidebar__textarea--prompt" placeholder="系统提示词" />
        <textarea v-model="personaForm.focusAreasText" class="workspace-defense-sidebar__textarea" placeholder="关注点，每行一个" />
        <label class="workspace-defense-sidebar__check">
          <input v-model="personaForm.enabled" type="checkbox">
          保存后启用
        </label>
        <button
          class="workspace-defense-sidebar__submit"
          type="submit"
          :disabled="!personaForm.name.trim() || !personaForm.systemPrompt.trim()"
        >
          保存人设
        </button>
      </form>
    </section>

    <section
      data-testid="workspace-defense-scorecard"
      class="workspace-defense-sidebar__scorecard"
    >
      <header class="workspace-defense-sidebar__scorecard-header">
        <p class="workspace-defense-sidebar__eyebrow">
          最新评分
        </p>
        <h3 class="workspace-defense-sidebar__scorecard-title">
          评分卡
        </h3>
      </header>

      <div v-if="displayScorecard" class="workspace-defense-sidebar__score-list">
        <div class="workspace-defense-sidebar__score-row">
          <span>技术</span>
          <strong>{{ displayScorecard.technical }}</strong>
        </div>
        <div class="workspace-defense-sidebar__score-row">
          <span>业务</span>
          <strong>{{ displayScorecard.business }}</strong>
        </div>
        <div class="workspace-defense-sidebar__score-row">
          <span>表达</span>
          <strong>{{ displayScorecard.expression }}</strong>
        </div>
        <div class="workspace-defense-sidebar__score-row workspace-defense-sidebar__score-row--total">
          <span>总分</span>
          <strong>{{ displayScorecard.total }}</strong>
        </div>
        <p class="workspace-defense-sidebar__score-summary">
          {{ displayScorecard.summary }}
        </p>
      </div>
      <p v-else class="workspace-defense-sidebar__empty workspace-defense-sidebar__empty--score">
        当前还没有最新评分卡，进入一轮答辩后会在这里汇总技术、业务和表达得分。
      </p>
    </section>
  </aside>
</template>

<style scoped>
.workspace-defense-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  margin: 0;
  padding: 0;
  border-right: 1px solid rgba(213, 223, 238, 0.94);
  background: #f8fafc;
}

.workspace-defense-sidebar__personas,
.workspace-defense-sidebar__scorecard {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.workspace-defense-sidebar__personas {
  flex: 1 1 auto;
}

.workspace-defense-sidebar__scorecard {
  flex: 0 0 auto;
  border-top: 1px solid #e5edf7;
}

.workspace-defense-sidebar__eyebrow {
  margin: 0;
  color: #5f7598;
  font-size: 11px;
  line-height: 1.4;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.workspace-defense-sidebar__persona-meta,
.workspace-defense-sidebar__persona-summary,
.workspace-defense-sidebar__score-summary,
.workspace-defense-sidebar__empty {
  margin: 0;
  color: #617591;
  font-size: 12px;
  line-height: 1.7;
}

.workspace-defense-sidebar__personas-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 14px;
  border-bottom: 1px solid #edf2fb;
}

.workspace-defense-sidebar__personas-title,
.workspace-defense-sidebar__scorecard-title {
  margin: 4px 0 0;
  color: #14233a;
  font-size: 18px;
  line-height: 1.3;
  font-weight: 700;
}

.workspace-defense-sidebar__personas-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
}

.workspace-defense-sidebar__text-action,
.workspace-defense-sidebar__mini-action,
.workspace-defense-sidebar__submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #35537f;
  font-weight: 700;
  cursor: pointer;
}

.workspace-defense-sidebar__text-action {
  height: 28px;
  padding: 0 10px;
  border-radius: 7px;
  font-size: 11px;
}

.workspace-defense-sidebar__mini-action {
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 10px;
}

.workspace-defense-sidebar__mini-action--danger {
  border-color: #fecdd3;
  color: #e11d48;
}

.workspace-defense-sidebar__submit {
  height: 30px;
  border-color: #2563eb;
  border-radius: 7px;
  background: #2563eb;
  color: #ffffff;
  font-size: 11px;
}

.workspace-defense-sidebar__submit:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.workspace-defense-sidebar__persona-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.workspace-defense-sidebar__persona {
  position: relative;
  padding: 14px 18px;
  border-bottom: 1px solid #edf2fb;
}

.workspace-defense-sidebar__persona:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: -2px;
}

.workspace-defense-sidebar__persona[data-active='true'] {
  background: #eff6ff;
}

.workspace-defense-sidebar__persona-topline {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.workspace-defense-sidebar__persona-name {
  color: #102138;
  font-size: 14px;
  line-height: 1.4;
  font-weight: 700;
}

.workspace-defense-sidebar__persona-summary {
  margin-top: 8px;
}

.workspace-defense-sidebar__persona-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.workspace-defense-sidebar__persona-popover {
  position: fixed;
  z-index: 80;
  width: 300px;
  padding: 12px;
  border: 1px solid #d7e1ef;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.16);
  opacity: 1;
  pointer-events: none;
  transform: translateX(0);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.workspace-defense-sidebar__popover-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.workspace-defense-sidebar__popover-header strong {
  color: #102138;
  font-size: 13px;
  line-height: 1.4;
}

.workspace-defense-sidebar__popover-header span,
.workspace-defense-sidebar__persona-popover p {
  margin: 0;
  color: #617591;
  font-size: 11px;
  line-height: 1.65;
}

.workspace-defense-sidebar__persona-popover p {
  margin-top: 8px;
}

.workspace-defense-sidebar__popover-prompt {
  max-height: 120px;
  overflow: auto;
  padding-top: 8px;
  border-top: 1px solid #edf2fb;
}

.workspace-defense-sidebar__persona-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 18px;
  border-bottom: 1px solid #edf2fb;
  background: #f1f7ff;
}

.workspace-defense-sidebar__form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.workspace-defense-sidebar__form-header strong {
  color: #14233a;
  font-size: 12px;
  line-height: 1.4;
}

.workspace-defense-sidebar__input,
.workspace-defense-sidebar__textarea {
  width: 100%;
  border: 1px solid #d9e3f2;
  border-radius: 7px;
  background: #ffffff;
  color: #14233a;
  font-size: 11px;
}

.workspace-defense-sidebar__input {
  height: 30px;
  padding: 0 9px;
}

.workspace-defense-sidebar__textarea {
  min-height: 54px;
  padding: 8px 9px;
  resize: vertical;
}

.workspace-defense-sidebar__textarea--prompt {
  min-height: 92px;
}

.workspace-defense-sidebar__check {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #617591;
  font-size: 11px;
}

.workspace-defense-sidebar__scorecard-header {
  padding: 16px 18px 10px;
}

.workspace-defense-sidebar__score-list {
  display: flex;
  flex-direction: column;
}

.workspace-defense-sidebar__score-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 18px;
  border-top: 1px solid #edf2fb;
}

.workspace-defense-sidebar__score-row span {
  color: #617591;
  font-size: 12px;
  line-height: 1.4;
}

.workspace-defense-sidebar__score-row strong {
  color: #14233a;
  font-size: 16px;
  line-height: 1.3;
  font-weight: 750;
}

.workspace-defense-sidebar__score-row--total strong {
  color: #1d4ed8;
}

.workspace-defense-sidebar__score-summary {
  padding: 12px 18px 16px;
  border-top: 1px solid #edf2fb;
}

.workspace-defense-sidebar__persona-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 62px;
  height: 24px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
}

.workspace-defense-sidebar__persona-badge--active {
  background: #dbeafe;
  color: #1d4ed8;
}

.workspace-defense-sidebar__persona-badge--ready {
  background: #ecfdf3;
  color: #047857;
}

.workspace-defense-sidebar__persona-badge--muted {
  background: #f1f5f9;
  color: #64748b;
}

.workspace-defense-sidebar__empty {
  padding: 14px 18px;
}

.workspace-defense-sidebar__empty--score {
  border-top: 1px solid #edf2fb;
}

@media (max-width: 1279px) {
  .workspace-defense-sidebar {
    border-right: none;
    border-bottom: 1px solid rgba(213, 223, 238, 0.94);
  }
}
</style>

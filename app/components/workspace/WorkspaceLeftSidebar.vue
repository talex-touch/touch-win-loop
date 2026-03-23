<script setup lang="ts">
import type { Contest, ProjectOutlineNode, Resource } from '~~/shared/types/domain'

type WorkspaceLeftModuleId = 'resource_manager' | 'analysis' | 'project_config'

interface WorkspaceLeftModule {
  id: WorkspaceLeftModuleId
  title: string
  icon: string
  hint: string
}

interface FilterPreset {
  id: string
  title: string
  level: string
  trackType: string
  topK: number
}

interface OutlineItem {
  id: string
  label: string
  level: number
}

type ResourceSectionId = 'projectResources' | 'recycleBin' | 'systemLibrary' | 'outline'

const props = withDefaults(defineProps<{
  naturalQuery: string
  major: string
  discipline: string
  level: string
  trackType: string
  topK: number
  selectedContestId: string
  contests: Contest[]
  selectedResources?: Resource[]
  recycleResources?: Resource[]
  resourceLibrary?: Resource[]
  projectOutline?: ProjectOutlineNode[]
  resourceMutating?: boolean
  hasActiveProject?: boolean
  aiReasoning: string
  normalizedInfo?: string
  statusLine: string
  listLoading: boolean
  aiFiltering: boolean
  isAdminView?: boolean
}>(), {
  selectedResources: () => [],
  recycleResources: () => [],
  resourceLibrary: () => [],
  projectOutline: () => [],
  resourceMutating: false,
  hasActiveProject: false,
  normalizedInfo: '',
  isAdminView: false,
})

const emit = defineEmits<{
  'update:naturalQuery': [value: string]
  'update:major': [value: string]
  'update:discipline': [value: string]
  'update:level': [value: string]
  'update:trackType': [value: string]
  'update:topK': [value: number]
  'update:selectedContestId': [value: string]
  'loadContests': []
  'runAiFilter': []
  'openSettingsPanel': []
  'addResourceFromLibrary': [resourceId: string]
  'removeProjectResource': [resourceId: string]
  'restoreProjectResource': [resourceId: string]
  'purgeProjectResource': [resourceId: string]
  'uploadResources': [files: File[]]
}>()

const LEFT_MODULE_STORAGE_KEY = 'workspace.leftSidebar.activeModule'

const levelLabels: Record<string, string> = {
  national: '国赛',
  provincial: '省赛',
  school: '校赛',
  industry: '行业赛',
}

const modules: WorkspaceLeftModule[] = [
  {
    id: 'resource_manager',
    title: '资源管理器',
    icon: 'description',
    hint: '项目资料与结构大纲',
  },
  {
    id: 'analysis',
    title: '竞赛分析',
    icon: 'grid_view',
    hint: '筛选与排序',
  },
  {
    id: 'project_config',
    title: '项目分析',
    icon: 'manage_search',
    hint: '分析偏好与 AI 建议',
  },
]

const filterPresets: FilterPreset[] = [
  {
    id: 'national-ai',
    title: '国赛 + AI',
    level: 'national',
    trackType: 'AI',
    topK: 6,
  },
  {
    id: 'industry-practice',
    title: '行业实战',
    level: 'industry',
    trackType: '工程落地',
    topK: 8,
  },
  {
    id: 'school-sprint',
    title: '校赛冲刺',
    level: 'school',
    trackType: '',
    topK: 5,
  },
]

const activeModule = ref<WorkspaceLeftModuleId>('resource_manager')
const activeResourceId = ref('')
const activeOutlineId = ref('')
const resourceActionOpenId = ref('')
const removeTargetResourceId = ref('')
const removeResourceModalVisible = ref(false)
const purgeTargetResourceId = ref('')
const purgeResourceModalVisible = ref(false)
const libraryModalKeyword = ref('')
const libraryModalVisible = ref(false)
const sidebarPanelRef = ref<HTMLElement | null>(null)
const sectionExpanded = reactive<Record<ResourceSectionId, boolean>>({
  projectResources: true,
  recycleBin: true,
  systemLibrary: true,
  outline: true,
})

const showReason = ref(false)
const showAdminDetails = ref(false)

const activeModuleMeta = computed<WorkspaceLeftModule>(() => {
  return modules.find(item => item.id === activeModule.value) ?? modules[0]!
})

const visibleResources = computed(() => props.selectedResources.slice(0, 10))
const visibleRecycleResources = computed(() => props.recycleResources.slice(0, 20))
const visibleLibraryResources = computed(() => {
  const keyword = libraryModalKeyword.value.trim().toLowerCase()
  if (!keyword)
    return props.resourceLibrary

  return props.resourceLibrary
    .filter((item) => {
      const context = [item.title, item.summary, item.type, item.year].join(' ').toLowerCase()
      return context.includes(keyword)
    })
})

const recycleRetentionDays = 30

const removeTargetResourceLabel = computed(() => {
  if (!removeTargetResourceId.value)
    return '该文件'
  const target = visibleResources.value.find(item => item.id === removeTargetResourceId.value)
  return target ? resourceDisplayTitle(target) : '该文件'
})

const purgeTargetResourceLabel = computed(() => {
  if (!purgeTargetResourceId.value)
    return '该文件'
  const target = props.recycleResources.find(item => item.id === purgeTargetResourceId.value)
  return target ? resourceDisplayTitle(target) : '该文件'
})

function normalizeOutlineLabel(value: string): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[：:;；，。,、]+$/g, '')
    .trim()
}

function stripOutlineHeadingPrefix(value: string): string {
  return normalizeOutlineLabel(value)
    .replace(/^#{1,6}\s+/, '')
    .replace(/^第[一二三四五六七八九十百千\d]+[章节部分篇]\s*/, '')
    .replace(/^\d+(?:\.\d+){0,3}[、.．\s]+/, '')
    .replace(/^[一二三四五六七八九十]+[、.．\s]+/, '')
    .replace(/^[（(]?[一二三四五六七八九十\d]+[)）][、.．\s]*/, '')
    .replace(/^[-*•]\s+/, '')
    .trim()
}

function isHeadingLine(line: string): boolean {
  if (!line)
    return false

  return /^#{1,6}\s+/.test(line)
    || /^\d+(?:\.\d+){0,3}[、.．\s]+/.test(line)
    || /^[一二三四五六七八九十]+[、.．\s]+/.test(line)
    || /^第[一二三四五六七八九十百千\d]+[章节部分篇]\s*/.test(line)
    || /^[（(]?[一二三四五六七八九十\d]+[)）][、.．\s]*/.test(line)
    || /^[-*•]\s+/.test(line)
}

function extractResourceOutlineChildren(resource: Resource): string[] {
  const source = [resource.summary, resource.content].map(value => String(value || '').trim()).filter(Boolean).join('\n')
  if (!source)
    return []

  const title = normalizeOutlineLabel(resourceDisplayTitle(resource))
  const titleKey = title.toLowerCase()
  const dedupe = new Set<string>()
  const result: string[] = []
  const lines = source
    .split(/\r?\n+/)
    .map(item => normalizeOutlineLabel(item))
    .filter(Boolean)

  for (const line of lines) {
    if (result.length >= 4)
      break
    if (line.length < 2 || line.length > 48)
      continue
    if (!isHeadingLine(line))
      continue

    const normalized = stripOutlineHeadingPrefix(line)
    const dedupeKey = normalized.toLowerCase()
    if (!normalized || normalized === title || dedupeKey === titleKey || dedupe.has(dedupeKey))
      continue
    if (normalized.length > 36)
      continue

    dedupe.add(dedupeKey)
    result.push(normalized)
  }

  return result
}

function flattenProjectOutlineNodes(
  nodes: ProjectOutlineNode[],
  parentOrders: number[] = [],
): OutlineItem[] {
  const result: OutlineItem[] = []
  const sorted = [...nodes].sort((left, right) => Number(left.order || 0) - Number(right.order || 0))

  for (const node of sorted) {
    const order = Math.max(1, Number(node.order || 1))
    const numberChain = [...parentOrders, order]
    const title = normalizeOutlineLabel(String(node.title || ''))
    if (!title)
      continue

    result.push({
      id: String(node.id || numberChain.join('.')),
      label: `${numberChain.join('.')} ${title}`,
      level: Math.max(0, numberChain.length - 1),
    })

    if (Array.isArray(node.children) && node.children.length > 0) {
      result.push(...flattenProjectOutlineNodes(node.children, numberChain))
    }
  }

  return result
}

const fallbackOutlineItems = computed<OutlineItem[]>(() => {
  const items: OutlineItem[] = []

  visibleResources.value.forEach((resource, resourceIndex) => {
    const topIndex = resourceIndex + 1
    const topId = `resource-${resource.id || topIndex}`
    const topLabel = normalizeOutlineLabel(resourceDisplayTitle(resource)) || `资料 ${topIndex}`

    items.push({
      id: topId,
      label: `${topIndex}. ${topLabel}`,
      level: 0,
    })

    const children = extractResourceOutlineChildren(resource)
    children.forEach((childLabel, childIndex) => {
      items.push({
        id: `${topId}-child-${childIndex + 1}`,
        label: `${topIndex}.${childIndex + 1} ${childLabel}`,
        level: 1,
      })
    })
  })

  return items
})

const outlineItems = computed<OutlineItem[]>(() => {
  const backendItems = flattenProjectOutlineNodes(props.projectOutline)
  if (backendItems.length > 0)
    return backendItems
  return fallbackOutlineItems.value
})

const hasReasoning = computed(() => Boolean(props.aiReasoning?.trim()))

const analysisStateLabel = computed(() => {
  if (props.aiFiltering)
    return '分析中'
  if (hasReasoning.value)
    return '分析完成'
  return '等待分析'
})

const configSummary = computed(() => {
  const chunks: string[] = []
  if (props.major.trim())
    chunks.push(`专业：${props.major.trim()}`)
  if (props.discipline.trim())
    chunks.push(`方向：${props.discipline.trim()}`)
  if (props.level.trim())
    chunks.push(`级别：${levelLabels[props.level] || props.level}`)
  if (props.trackType.trim())
    chunks.push(`赛道：${props.trackType.trim()}`)
  chunks.push(`返回：${props.topK}`)
  return chunks.join(' · ')
})

const compactHint = computed(() => {
  if (props.aiFiltering)
    return '正在执行筛选，请稍候。'

  const status = props.statusLine?.trim() || ''
  if (status.includes('失败') || status.includes('不可用'))
    return status

  if (hasReasoning.value)
    return '点击“展开原因”查看本次筛选依据。'

  return '点击“AI筛选竞赛”后可查看分析结果。'
})

const analysisSuggestions = computed(() => {
  const suggestions: string[] = []

  if (!props.selectedContestId)
    suggestions.push('先在“竞赛分析”中锁定至少 1 个目标竞赛与赛道。')

  if (!hasReasoning.value)
    suggestions.push('执行一次 AI 筛选，系统会输出可解释排序与推荐理由。')

  if (hasReasoning.value)
    suggestions.push('已得到 AI 分析结果，下一步建议进入“项目设置”补全项目底座与竞赛适配稿。')

  if (props.selectedResources.length === 0)
    suggestions.push('资料池当前为空，建议先在资源管理器补齐规则文档和往届样例。')

  if (suggestions.length === 0)
    suggestions.push('当前信息较完整，可直接进入 Dashboard 推进提交与终审准备。')

  return suggestions.slice(0, 4)
})

function switchModule(moduleId: string) {
  if (!isWorkspaceLeftModuleId(moduleId))
    return
  activeModule.value = moduleId
}

function selectResource(resourceId: string) {
  activeResourceId.value = resourceId
  resourceActionOpenId.value = ''
}

function selectOutline(itemId: string) {
  activeOutlineId.value = itemId
}

function toggleSection(sectionId: ResourceSectionId) {
  sectionExpanded[sectionId] = !sectionExpanded[sectionId]
}

function openSettingsPanel() {
  emit('openSettingsPanel')
}

function onTopKInput(event: Event) {
  const target = event.target as HTMLInputElement
  const value = Number(target.value)
  emit('update:topK', Number.isNaN(value) ? 1 : value)
}

function applyFilterPreset(preset: FilterPreset) {
  emit('update:level', preset.level)
  emit('update:trackType', preset.trackType)
  emit('update:topK', preset.topK)
}

function normalizeResourceType(resource: Resource): string {
  return String(resource.type || '').trim().toLowerCase()
}

function resourceIcon(resource: Resource): string {
  const type = normalizeResourceType(resource)
  if (type.includes('pdf'))
    return 'picture_as_pdf'
  if (type.includes('tab') || type.includes('excel') || type.includes('sheet'))
    return 'table_chart'
  if (type.includes('doc') || type.includes('md') || type.includes('markdown'))
    return 'article'
  return 'draft'
}

function resourceIconClass(resource: Resource): string {
  const type = normalizeResourceType(resource)
  if (type.includes('pdf'))
    return 'workspace-icon--pdf'
  if (type.includes('tab') || type.includes('excel') || type.includes('sheet'))
    return 'workspace-icon--table'
  return 'workspace-icon--doc'
}

function resourceDisplayTitle(resource: Resource): string {
  const title = String(resource.title || '').trim()
  if (title)
    return title

  const type = String(resource.type || 'doc').trim().toLowerCase()
  if (type)
    return `未命名文档.${type}`

  return '未命名文档'
}

function isWorkspaceLeftModuleId(value: string): value is WorkspaceLeftModuleId {
  return value === 'resource_manager' || value === 'analysis' || value === 'project_config'
}

function openLibraryModal() {
  if (props.resourceMutating)
    return

  libraryModalKeyword.value = ''
  libraryModalVisible.value = true
}

function handleResourceUpload(files: File[] | null | undefined) {
  const normalizedFiles = Array.from(files || []).filter(file => file instanceof File)
  if (!normalizedFiles.length || props.resourceMutating || !props.hasActiveProject)
    return
  emit('uploadResources', normalizedFiles)
}

function addLibraryResource(resourceId: string) {
  if (!resourceId || props.resourceMutating || !props.hasActiveProject)
    return
  emit('addResourceFromLibrary', resourceId)
}

function toggleResourceActionMenu(resourceId: string) {
  if (!resourceId || props.resourceMutating || !props.hasActiveProject)
    return
  if (resourceActionOpenId.value === resourceId) {
    resourceActionOpenId.value = ''
    return
  }
  resourceActionOpenId.value = resourceId
}

function handleResourceItemContextMenu(resourceId: string, event: MouseEvent) {
  event.preventDefault()
  if (!resourceId || props.resourceMutating || !props.hasActiveProject)
    return
  activeResourceId.value = resourceId
  resourceActionOpenId.value = resourceId
}

function requestRemoveResource(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!targetResourceId || props.resourceMutating || !props.hasActiveProject)
    return

  resourceActionOpenId.value = ''
  removeTargetResourceId.value = targetResourceId
  removeResourceModalVisible.value = true
}

function closeRemoveResourceModal() {
  if (props.resourceMutating)
    return
  removeResourceModalVisible.value = false
  removeTargetResourceId.value = ''
}

function confirmRemoveResource() {
  if (props.resourceMutating || !props.hasActiveProject)
    return

  const targetResourceId = String(removeTargetResourceId.value || '').trim()
  if (!targetResourceId)
    return

  removeResourceModalVisible.value = false
  removeTargetResourceId.value = ''
  emit('removeProjectResource', targetResourceId)
}

function restoreRecycleResource(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!targetResourceId || props.resourceMutating || !props.hasActiveProject)
    return

  emit('restoreProjectResource', targetResourceId)
}

function requestPurgeRecycleResource(resourceId: string) {
  const targetResourceId = String(resourceId || '').trim()
  if (!targetResourceId || props.resourceMutating || !props.hasActiveProject)
    return

  purgeTargetResourceId.value = targetResourceId
  purgeResourceModalVisible.value = true
}

function closePurgeResourceModal() {
  if (props.resourceMutating)
    return
  purgeResourceModalVisible.value = false
  purgeTargetResourceId.value = ''
}

function confirmPurgeResource() {
  if (props.resourceMutating || !props.hasActiveProject)
    return

  const targetResourceId = String(purgeTargetResourceId.value || '').trim()
  if (!targetResourceId)
    return

  purgeResourceModalVisible.value = false
  purgeTargetResourceId.value = ''
  emit('purgeProjectResource', targetResourceId)
}

function recycleDaysLeft(resource: Resource): number {
  const deletedAt = new Date(String(resource.updatedAt || resource.createdAt || '')).getTime()
  if (!Number.isFinite(deletedAt) || deletedAt <= 0)
    return recycleRetentionDays

  const oneDayMs = 24 * 60 * 60 * 1000
  const expiresAt = deletedAt + recycleRetentionDays * oneDayMs
  const leftMs = expiresAt - Date.now()
  if (leftMs <= 0)
    return 0
  return Math.ceil(leftMs / oneDayMs)
}

function recycleHint(resource: Resource): string {
  const leftDays = recycleDaysLeft(resource)
  if (leftDays <= 0)
    return '即将自动清理'
  return `${leftDays} 天后自动清理`
}

function closeResourceActionMenuByOutside(event: PointerEvent) {
  if (!resourceActionOpenId.value)
    return

  const target = event.target as HTMLElement | null
  if (target?.closest('.workspace-resource-actions') || target?.closest('.workspace-recycle-item__actions'))
    return

  resourceActionOpenId.value = ''
}

function closeResourceActionMenuByEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape')
    return
  resourceActionOpenId.value = ''
}

watch(() => props.selectedResources, (nextResources) => {
  if (resourceActionOpenId.value && !nextResources.some(item => item.id === resourceActionOpenId.value))
    resourceActionOpenId.value = ''
  if (removeTargetResourceId.value && !nextResources.some(item => item.id === removeTargetResourceId.value)) {
    removeTargetResourceId.value = ''
    removeResourceModalVisible.value = false
  }

  if (!nextResources.length) {
    activeResourceId.value = ''
    return
  }

  const stillExists = nextResources.some(item => item.id === activeResourceId.value)
  if (stillExists)
    return

  activeResourceId.value = nextResources[0]?.id || ''
}, { immediate: true, deep: true })

watch(() => props.recycleResources, (nextResources) => {
  if (purgeTargetResourceId.value && !nextResources.some(item => item.id === purgeTargetResourceId.value)) {
    purgeTargetResourceId.value = ''
    purgeResourceModalVisible.value = false
  }
}, { immediate: true, deep: true })

watch(outlineItems, (nextItems) => {
  if (!nextItems.length) {
    activeOutlineId.value = ''
    return
  }

  const stillExists = nextItems.some(item => item.id === activeOutlineId.value)
  if (stillExists)
    return

  activeOutlineId.value = nextItems[0]?.id || ''
}, { immediate: true })

watch(() => props.aiFiltering, (next) => {
  if (!next)
    return
  showReason.value = false
  showAdminDetails.value = false
})

watch(hasReasoning, (next) => {
  if (next)
    return
  showReason.value = false
})

watch(() => props.hasActiveProject, (next) => {
  if (next)
    return
  libraryModalVisible.value = false
  resourceActionOpenId.value = ''
  removeTargetResourceId.value = ''
  removeResourceModalVisible.value = false
  purgeTargetResourceId.value = ''
  purgeResourceModalVisible.value = false
})

watch(() => sectionExpanded.projectResources, (expanded) => {
  if (expanded)
    return
  resourceActionOpenId.value = ''
})

watch(() => props.resourceMutating, (next) => {
  if (!next)
    return
  resourceActionOpenId.value = ''
})

onMounted(() => {
  if (!import.meta.client)
    return

  const saved = localStorage.getItem(LEFT_MODULE_STORAGE_KEY)
  if (!saved)
    return

  if (isWorkspaceLeftModuleId(saved))
    activeModule.value = saved

  document.addEventListener('pointerdown', closeResourceActionMenuByOutside)
  document.addEventListener('keydown', closeResourceActionMenuByEscape)
})

watch(activeModule, (value) => {
  if (!import.meta.client)
    return
  localStorage.setItem(LEFT_MODULE_STORAGE_KEY, value)
})

onBeforeUnmount(() => {
  if (!import.meta.client)
    return
  document.removeEventListener('pointerdown', closeResourceActionMenuByOutside)
  document.removeEventListener('keydown', closeResourceActionMenuByEscape)
})
</script>

<template>
  <aside ref="sidebarPanelRef" class="workspace-left-dock">
    <WorkspaceLeftRail
      :items="modules"
      :active-id="activeModule"
      @select="switchModule"
      @open-settings="openSettingsPanel"
    />

    <section class="workspace-left-panel">
      <header class="workspace-left-panel__header">
        <div>
          <h2>{{ activeModuleMeta.title }}</h2>
          <p>{{ activeModuleMeta.hint }}</p>
        </div>
        <button class="workspace-left-panel__more" title="更多操作" aria-label="更多操作" type="button">
          <span class="material-symbols-outlined">more_horiz</span>
        </button>
      </header>

      <div class="workspace-left-panel__body no-scrollbar">
        <template v-if="activeModule === 'resource_manager'">
          <section class="workspace-tree-block">
            <div class="workspace-tree-block__title-row">
              <button
                class="workspace-tree-block__title"
                type="button"
                :aria-expanded="sectionExpanded.projectResources"
                @click="toggleSection('projectResources')"
              >
                <span class="material-symbols-outlined" :class="{ 'workspace-tree-block__arrow--collapsed': !sectionExpanded.projectResources }">
                  keyboard_arrow_down
                </span>
                <span>项目资料</span>
              </button>
              <button
                class="workspace-tree-block__title-action"
                type="button"
                title="添加资源"
                aria-label="添加资源"
                :disabled="resourceMutating"
                @click="openLibraryModal"
              >
                <span class="material-symbols-outlined">add</span>
              </button>
            </div>

            <div v-show="sectionExpanded.projectResources">
              <div
                v-for="resource in visibleResources"
                :key="resource.id"
                class="workspace-tree-item-row"
                :class="{
                  'workspace-tree-item-row--active': resource.id === activeResourceId,
                  'workspace-tree-item-row--menu-open': resourceActionOpenId === resource.id,
                }"
                @contextmenu="handleResourceItemContextMenu(resource.id, $event)"
              >
                <button
                  class="workspace-tree-item"
                  :class="{ 'workspace-tree-item--active': resource.id === activeResourceId }"
                  type="button"
                  @click="selectResource(resource.id)"
                >
                  <span class="material-symbols-outlined workspace-tree-item__icon" :class="resourceIconClass(resource)">
                    {{ resourceIcon(resource) }}
                  </span>
                  <span class="workspace-tree-item__label" :title="resourceDisplayTitle(resource)">{{ resourceDisplayTitle(resource) }}</span>
                </button>

                <div class="workspace-resource-actions">
                  <button
                    class="workspace-resource-actions__trigger"
                    type="button"
                    title="资源操作"
                    aria-label="资源操作"
                    :disabled="resourceMutating || !hasActiveProject"
                    @click.stop="toggleResourceActionMenu(resource.id)"
                  >
                    <span class="material-symbols-outlined">more_horiz</span>
                  </button>

                  <div
                    v-if="resourceActionOpenId === resource.id"
                    class="workspace-resource-actions__menu"
                    role="menu"
                  >
                    <button
                      class="workspace-resource-actions__menu-item workspace-resource-actions__menu-item--danger"
                      type="button"
                      :disabled="resourceMutating || !hasActiveProject"
                      @click.stop="requestRemoveResource(resource.id)"
                    >
                      删除文件
                    </button>
                  </div>
                </div>
              </div>

              <p v-if="visibleResources.length === 0" class="workspace-empty-text">
                暂无资源
              </p>
            </div>
          </section>

          <section class="workspace-tree-block">
            <button
              class="workspace-tree-block__title"
              type="button"
              :aria-expanded="sectionExpanded.recycleBin"
              @click="toggleSection('recycleBin')"
            >
              <span class="material-symbols-outlined" :class="{ 'workspace-tree-block__arrow--collapsed': !sectionExpanded.recycleBin }">
                keyboard_arrow_down
              </span>
              <span>项目回收站</span>
            </button>

            <div v-show="sectionExpanded.recycleBin">
              <div
                v-for="resource in visibleRecycleResources"
                :key="`recycle-${resource.id}`"
                class="workspace-recycle-item"
              >
                <div class="workspace-recycle-item__content">
                  <div class="workspace-recycle-item__title" :title="resourceDisplayTitle(resource)">
                    {{ resourceDisplayTitle(resource) }}
                  </div>
                  <div class="workspace-recycle-item__meta">
                    {{ recycleHint(resource) }}
                  </div>
                </div>

                <div class="workspace-recycle-item__actions">
                  <button
                    class="workspace-recycle-item__action workspace-recycle-item__action--ghost"
                    type="button"
                    :disabled="resourceMutating || !hasActiveProject"
                    @click="restoreRecycleResource(resource.id)"
                  >
                    恢复
                  </button>
                  <button
                    class="workspace-recycle-item__action workspace-recycle-item__action--danger"
                    type="button"
                    :disabled="resourceMutating || !hasActiveProject"
                    @click="requestPurgeRecycleResource(resource.id)"
                  >
                    彻底删除
                  </button>
                </div>
              </div>

              <p v-if="visibleRecycleResources.length === 0" class="workspace-empty-text">
                暂无已删除文件
              </p>
            </div>
          </section>

          <section class="workspace-tree-block">
            <button
              class="workspace-tree-block__title"
              type="button"
              :aria-expanded="sectionExpanded.systemLibrary"
              @click="toggleSection('systemLibrary')"
            >
              <span class="material-symbols-outlined" :class="{ 'workspace-tree-block__arrow--collapsed': !sectionExpanded.systemLibrary }">
                keyboard_arrow_down
              </span>
              <span>系统资料库</span>
            </button>

            <div v-show="sectionExpanded.systemLibrary" class="workspace-tree-block__content">
              <p class="workspace-empty-text">
                暂无资源
              </p>
            </div>
          </section>

          <section class="workspace-tree-block">
            <button
              class="workspace-tree-block__title"
              type="button"
              :aria-expanded="sectionExpanded.outline"
              @click="toggleSection('outline')"
            >
              <span class="material-symbols-outlined" :class="{ 'workspace-tree-block__arrow--collapsed': !sectionExpanded.outline }">
                keyboard_arrow_down
              </span>
              <span>结构大纲</span>
            </button>

            <div v-show="sectionExpanded.outline">
              <button
                v-for="item in outlineItems"
                :key="item.id"
                class="workspace-outline-item"
                :class="[
                  item.level > 0 ? 'workspace-outline-item--child' : '',
                  activeOutlineId === item.id ? 'workspace-outline-item--active' : '',
                ]"
                type="button"
                :title="item.label"
                @click="selectOutline(item.id)"
              >
                {{ item.label }}
              </button>

              <p v-if="outlineItems.length === 0" class="workspace-empty-text">
                上传文件后自动生成大纲
              </p>
            </div>
          </section>

          <a-modal
            v-model:visible="libraryModalVisible"
            title="添加项目资源"
            width="560px"
            :footer="false"
            :esc-to-close="!resourceMutating"
            :mask-closable="!resourceMutating"
          >
            <div class="workspace-library-modal">
              <input
                v-model="libraryModalKeyword"
                class="workspace-library-search"
                placeholder="搜索系统库资源"
                type="text"
              >

              <div class="workspace-library-list no-scrollbar">
                <div
                  v-for="item in visibleLibraryResources"
                  :key="item.id"
                  class="workspace-library-item"
                >
                  <div class="workspace-library-item__content">
                    <div class="workspace-library-item__title">
                      {{ resourceDisplayTitle(item) }}
                    </div>
                    <div class="workspace-library-item__meta">
                      {{ item.type }} · {{ item.year }}
                    </div>
                  </div>
                  <button
                    class="workspace-library-item__add"
                    type="button"
                    :disabled="resourceMutating || !hasActiveProject"
                    @click="addLibraryResource(item.id)"
                  >
                    添加
                  </button>
                </div>
              </div>

              <p v-if="visibleLibraryResources.length === 0" class="workspace-empty-text workspace-empty-text--modal">
                暂无资源
              </p>
            </div>
          </a-modal>

          <a-modal
            v-model:visible="removeResourceModalVisible"
            title="删除项目资源"
            width="460px"
            :footer="false"
            :esc-to-close="!resourceMutating"
            :mask-closable="!resourceMutating"
          >
            <div class="workspace-delete-modal">
              <p>
                确认删除资源「{{ removeTargetResourceLabel }}」吗？
              </p>
              <p class="workspace-delete-modal__hint">
                删除后文件将移入项目回收站，30 天后自动清理；你也可在回收站手动彻底删除。
              </p>

              <div class="workspace-delete-modal__actions">
                <button
                  class="workspace-delete-modal__btn workspace-delete-modal__btn--ghost"
                  type="button"
                  :disabled="resourceMutating"
                  @click="closeRemoveResourceModal"
                >
                  取消
                </button>
                <button
                  class="workspace-delete-modal__btn workspace-delete-modal__btn--danger"
                  type="button"
                  :disabled="resourceMutating"
                  @click="confirmRemoveResource"
                >
                  {{ resourceMutating ? '删除中...' : '确认删除' }}
                </button>
              </div>
            </div>
          </a-modal>

          <a-modal
            v-model:visible="purgeResourceModalVisible"
            title="彻底删除资源"
            width="460px"
            :footer="false"
            :esc-to-close="!resourceMutating"
            :mask-closable="!resourceMutating"
          >
            <div class="workspace-delete-modal">
              <p>
                确认彻底删除「{{ purgeTargetResourceLabel }}」吗？
              </p>
              <p class="workspace-delete-modal__hint">
                彻底删除后将立即释放存储空间，且无法恢复。
              </p>

              <div class="workspace-delete-modal__actions">
                <button
                  class="workspace-delete-modal__btn workspace-delete-modal__btn--ghost"
                  type="button"
                  :disabled="resourceMutating"
                  @click="closePurgeResourceModal"
                >
                  取消
                </button>
                <button
                  class="workspace-delete-modal__btn workspace-delete-modal__btn--danger"
                  type="button"
                  :disabled="resourceMutating"
                  @click="confirmPurgeResource"
                >
                  {{ resourceMutating ? '删除中...' : '确认彻底删除' }}
                </button>
              </div>
            </div>
          </a-modal>
        </template>

        <template v-else-if="activeModule === 'analysis'">
          <section class="workspace-card">
            <h3>AI 竞赛分析</h3>
            <textarea
              :value="naturalQuery"
              class="workspace-textarea"
              placeholder="例：计算机专业，偏 AI + 工程落地，优先国赛。"
              @input="emit('update:naturalQuery', ($event.target as HTMLTextAreaElement).value)"
            />

            <div class="workspace-config-summary">
              {{ configSummary }}
            </div>

            <div class="workspace-action-row">
              <button
                class="workspace-btn workspace-btn--ghost"
                :disabled="listLoading"
                @click="emit('loadContests')"
              >
                {{ listLoading ? '加载中...' : '结构化筛选' }}
              </button>

              <button
                class="workspace-btn workspace-btn--primary"
                :disabled="aiFiltering"
                @click="emit('runAiFilter')"
              >
                {{ aiFiltering ? 'AI处理中...' : 'AI筛选竞赛' }}
              </button>
            </div>

            <div class="workspace-analysis-status">
              <div class="workspace-analysis-status__head">
                <span>分析状态</span>
                <span class="workspace-pill" :class="{ 'workspace-pill--done': hasReasoning && !aiFiltering }">
                  {{ analysisStateLabel }}
                </span>
              </div>
              <p>{{ compactHint }}</p>

              <button
                v-if="hasReasoning"
                class="workspace-inline-action"
                type="button"
                @click="showReason = !showReason"
              >
                {{ showReason ? '收起原因' : '展开原因' }}
              </button>

              <pre v-if="showReason" class="workspace-log-text">{{ aiReasoning }}</pre>

              <template v-if="isAdminView">
                <button
                  class="workspace-inline-action workspace-inline-action--dark"
                  type="button"
                  @click="showAdminDetails = !showAdminDetails"
                >
                  {{ showAdminDetails ? '收起详情' : '查看详情' }}
                </button>

                <div v-if="showAdminDetails" class="workspace-admin-detail">
                  <div>
                    <div class="workspace-admin-detail__label">
                      运行状态
                    </div>
                    <div>{{ statusLine || '-' }}</div>
                  </div>
                  <div>
                    <div class="workspace-admin-detail__label">
                      标准化筛选参数
                    </div>
                    <pre>{{ normalizedInfo || '{ }' }}</pre>
                  </div>
                </div>
              </template>
            </div>
          </section>

          <section class="workspace-card">
            <h3>竞赛清单（{{ contests.length }}）</h3>
            <div class="workspace-contest-list no-scrollbar">
              <button
                v-for="contest in contests"
                :key="contest.id"
                class="workspace-contest-item"
                :class="{ 'workspace-contest-item--active': contest.id === selectedContestId }"
                type="button"
                @click="emit('update:selectedContestId', contest.id)"
              >
                <div class="workspace-contest-item__name">
                  {{ contest.name }}
                </div>
                <div class="workspace-contest-item__meta">
                  {{ levelLabels[contest.level] || contest.level }} · {{ contest.registrationWindow }}
                </div>
              </button>
            </div>
          </section>
        </template>

        <template v-else>
          <section class="workspace-card">
            <h3>项目分析</h3>
            <ul class="workspace-suggestion-list">
              <li
                v-for="(item, index) in analysisSuggestions"
                :key="`suggestion-${index}-${item}`"
              >
                {{ item }}
              </li>
            </ul>
          </section>

          <section class="workspace-card">
            <h3>分析参数</h3>
            <div class="workspace-form-grid">
              <input
                :value="major"
                class="workspace-input"
                placeholder="专业"
                @input="emit('update:major', ($event.target as HTMLInputElement).value)"
              >
              <input
                :value="discipline"
                class="workspace-input"
                placeholder="学科/方向"
                @input="emit('update:discipline', ($event.target as HTMLInputElement).value)"
              >
              <select
                :value="level"
                class="workspace-input"
                @change="emit('update:level', ($event.target as HTMLSelectElement).value)"
              >
                <option value="">
                  级别（全部）
                </option>
                <option value="national">
                  national
                </option>
                <option value="provincial">
                  provincial
                </option>
                <option value="school">
                  school
                </option>
                <option value="industry">
                  industry
                </option>
              </select>
              <input
                :value="trackType"
                class="workspace-input"
                placeholder="赛道偏好"
                @input="emit('update:trackType', ($event.target as HTMLInputElement).value)"
              >
            </div>

            <div class="workspace-topk-row">
              <label>返回条数</label>
              <input
                :value="topK"
                class="workspace-input workspace-input--small"
                max="20"
                min="1"
                type="number"
                @input="onTopKInput"
              >
            </div>
          </section>

          <section class="workspace-card">
            <h3>快速配置模板</h3>
            <div class="workspace-preset-list">
              <button
                v-for="preset in filterPresets"
                :key="preset.id"
                class="workspace-preset-item"
                type="button"
                @click="applyFilterPreset(preset)"
              >
                {{ preset.title }}：{{ levelLabels[preset.level] || preset.level }} / {{ preset.topK }} 条
              </button>
            </div>
            <button
              class="workspace-btn workspace-btn--primary"
              :disabled="aiFiltering"
              @click="emit('runAiFilter')"
            >
              以当前配置执行 AI 分析
            </button>
          </section>
        </template>
      </div>

      <WorkspaceResourceUploadHint
        v-if="activeModule === 'resource_manager'"
        class="workspace-left-panel__footer"
        :busy="resourceMutating"
        :disabled="!hasActiveProject || resourceMutating"
        @select-files="handleResourceUpload"
      />
    </section>
  </aside>
</template>

<style scoped>
.workspace-left-dock {
  border-right: 1px solid #d3d8e4;
  background: #ffffff;
  display: flex;
  flex-shrink: 0;
  min-height: 0;
  width: 100%;
}

@media (min-width: 1280px) {
  .workspace-left-dock {
    width: 362px;
  }
}

.workspace-left-panel {
  background: #ffffff;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.workspace-left-panel__header {
  border-bottom: 1px solid #e2e8f2;
  padding: 16px 16px 12px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  background: #ffffff;
}

.workspace-left-panel__header h2 {
  font-size: 16px;
  line-height: 1.2;
  font-weight: 700;
  color: #3b4d6d;
  margin: 0;
}

.workspace-left-panel__header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #8a97ae;
}

.workspace-left-panel__more {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #8a95ab;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.workspace-left-panel__more:hover {
  background: #f2f5fa;
  color: #4a5e83;
}

.workspace-left-panel__body {
  padding: 10px 0 14px;
  overflow-y: auto;
  flex: 1;
}

.workspace-left-panel__footer {
  padding: 8px 12px 12px;
  border-top: 1px solid #e2e8f2;
  background: #ffffff;
  flex-shrink: 0;
}

.workspace-tree-block {
  margin-bottom: 8px;
}

.workspace-tree-block__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 10px;
}

.workspace-tree-block__title {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #7888a2;
  padding: 4px 14px;
  text-transform: uppercase;
  text-align: left;
  cursor: pointer;
}

.workspace-tree-block__title:hover {
  color: #556888;
}

.workspace-tree-block__title .material-symbols-outlined {
  font-size: 18px;
  transition: transform 0.2s ease;
}

.workspace-tree-block__arrow--collapsed {
  transform: rotate(-90deg);
}

.workspace-tree-block__title-action {
  border: 1px solid #d3dbe8;
  background: #ffffff;
  color: #43629c;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.workspace-tree-block__title-action:hover:enabled {
  background: #edf3ff;
}

.workspace-tree-block__title-action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.workspace-tree-block__title-action .material-symbols-outlined {
  font-size: 16px;
}

.workspace-tree-block__content {
  padding-bottom: 6px;
}

.workspace-tree-item-row {
  position: relative;
}

.workspace-tree-item {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 42px 0 14px;
  color: #4f5f7f;
  cursor: pointer;
  text-align: left;
  position: relative;
  transition: background-color 0.2s ease;
}

.workspace-tree-item:hover {
  background: #f3f6fb;
}

.workspace-tree-item--active {
  background: #edf3ff;
  color: #2f4368;
}

.workspace-tree-item__icon {
  font-size: 18px;
  width: 18px;
  height: 18px;
  line-height: 18px;
}

.workspace-tree-item__label {
  font-size: 14px;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-resource-actions {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  z-index: 10;
}

.workspace-resource-actions__trigger {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #7f8ba0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;
}

.workspace-tree-item-row:hover .workspace-resource-actions__trigger,
.workspace-tree-item-row--menu-open .workspace-resource-actions__trigger {
  opacity: 1;
  pointer-events: auto;
}

.workspace-resource-actions__trigger:hover:enabled {
  background: #e9effa;
  color: #3f5d96;
}

.workspace-resource-actions__trigger:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.workspace-resource-actions__trigger .material-symbols-outlined {
  font-size: 16px;
}

.workspace-resource-actions__menu {
  position: absolute;
  top: 28px;
  right: 0;
  min-width: 116px;
  border: 1px solid #d6deec;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 12px 24px rgba(31, 45, 70, 0.14);
  padding: 4px;
  z-index: 20;
}

.workspace-resource-actions__menu-item {
  width: 100%;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #475977;
  height: 30px;
  font-size: 12px;
  text-align: left;
  padding: 0 8px;
  cursor: pointer;
}

.workspace-resource-actions__menu-item:hover:enabled {
  background: #edf2fb;
}

.workspace-resource-actions__menu-item--danger {
  color: #cb3b3b;
}

.workspace-resource-actions__menu-item--danger:hover:enabled {
  background: #fff0f0;
}

.workspace-resource-actions__menu-item:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.workspace-recycle-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
}

.workspace-recycle-item:hover {
  background: #f7f9fd;
}

.workspace-recycle-item__content {
  min-width: 0;
  flex: 1;
}

.workspace-recycle-item__title {
  font-size: 12px;
  color: #52617c;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-recycle-item__meta {
  margin-top: 2px;
  font-size: 10px;
  color: #8d99ae;
}

.workspace-recycle-item__actions {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.workspace-recycle-item__action {
  border: 1px solid #d4dce9;
  border-radius: 6px;
  background: #ffffff;
  color: #4a5f84;
  height: 24px;
  min-width: 56px;
  padding: 0 8px;
  font-size: 11px;
  cursor: pointer;
}

.workspace-recycle-item__action--ghost:hover:enabled {
  background: #edf3ff;
}

.workspace-recycle-item__action--danger {
  color: #c74343;
  border-color: #efc0c0;
}

.workspace-recycle-item__action--danger:hover:enabled {
  background: #fff4f4;
}

.workspace-recycle-item__action:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.workspace-icon--doc {
  color: #3d6cdd;
}

.workspace-icon--table {
  color: #7b879f;
}

.workspace-icon--pdf {
  color: #f04d4d;
}

.workspace-outline-item {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 13px;
  line-height: 1.28;
  text-align: left;
  color: #6f7e98;
  padding: 9px 14px;
  cursor: pointer;
  position: relative;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-outline-item:hover {
  background: #f3f6fb;
}

.workspace-outline-item--child {
  padding-left: 36px;
  font-size: 12px;
}

.workspace-outline-item--active {
  background: #edf3ff;
  color: #1f2f4d;
  font-weight: 600;
}

.workspace-outline-item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 3px;
  background: #2f6af2;
}

.workspace-empty-text {
  margin: 6px 0 0;
  color: #9ba7bc;
  font-size: 12px;
  text-align: center;
}

.workspace-library-search {
  width: 100%;
  border: 1px solid #d5dce9;
  border-radius: 8px;
  height: 30px;
  padding: 0 10px;
  font-size: 12px;
  color: #344866;
  background: #ffffff;
  outline: none;
}

.workspace-library-search:focus {
  border-color: #2f6af2;
  box-shadow: 0 0 0 2px rgba(47, 106, 242, 0.14);
}

.workspace-library-list {
  max-height: 196px;
  overflow-y: auto;
}

.workspace-library-modal {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workspace-library-modal .workspace-library-list {
  border: 1px solid #dbe2ef;
  border-radius: 8px;
  max-height: 300px;
}

.workspace-empty-text--modal {
  margin: 0;
}

.workspace-library-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 14px;
}

.workspace-library-item:hover {
  background: #f5f8ff;
}

.workspace-library-item__content {
  min-width: 0;
  flex: 1;
}

.workspace-library-item__title {
  font-size: 12px;
  color: #415474;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-library-item__meta {
  margin-top: 2px;
  color: #8694ac;
  font-size: 10px;
}

.workspace-library-item__add {
  border: 1px solid #c9d3e6;
  background: #ffffff;
  color: #3f5f9f;
  border-radius: 7px;
  height: 26px;
  min-width: 48px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.workspace-library-item__add:hover:enabled {
  background: #edf3ff;
}

.workspace-library-item__add:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.workspace-delete-modal {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-delete-modal p {
  margin: 0;
  color: #405272;
  font-size: 13px;
  line-height: 1.5;
}

.workspace-delete-modal__hint {
  color: #7b89a0 !important;
  font-size: 12px !important;
}

.workspace-delete-modal__actions {
  margin-top: 6px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.workspace-delete-modal__btn {
  border: 1px solid #d4dbe8;
  border-radius: 8px;
  min-width: 86px;
  height: 34px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.workspace-delete-modal__btn--ghost {
  background: #ffffff;
  color: #405272;
}

.workspace-delete-modal__btn--ghost:hover:enabled {
  background: #f4f7fc;
}

.workspace-delete-modal__btn--danger {
  border-color: #dd5a5a;
  background: #e55252;
  color: #ffffff;
}

.workspace-delete-modal__btn--danger:hover:enabled {
  background: #d84b4b;
}

.workspace-delete-modal__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.workspace-card {
  margin: 0 12px 12px;
  border: 1px solid #d5dbe8;
  border-radius: 10px;
  background: #ffffff;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workspace-card h3 {
  margin: 0;
  color: #3b4a66;
  font-size: 13px;
  font-weight: 700;
}

.workspace-suggestion-list {
  margin: 0;
  padding: 0 0 0 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #4b5a75;
  font-size: 12px;
  line-height: 1.5;
}

.workspace-textarea {
  border: 1px solid #d8deea;
  border-radius: 8px;
  padding: 10px;
  min-height: 100px;
  resize: vertical;
  font-size: 12px;
  color: #344866;
  outline: none;
}

.workspace-textarea:focus {
  border-color: #2f6af2;
  box-shadow: 0 0 0 2px rgba(47, 106, 242, 0.15);
}

.workspace-config-summary {
  font-size: 11px;
  color: #60708e;
  padding: 8px;
  border: 1px solid #dde3ee;
  border-radius: 8px;
  background: #f5f7fb;
}

.workspace-action-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.workspace-btn {
  height: 34px;
  border-radius: 8px;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.workspace-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.workspace-btn--ghost {
  border: 1px solid #ced6e4;
  background: #ffffff;
  color: #3f506f;
}

.workspace-btn--ghost:hover:enabled {
  background: #f5f8ff;
}

.workspace-btn--primary {
  background: #2f6af2;
  color: #ffffff;
}

.workspace-btn--primary:hover:enabled {
  background: #2456cb;
}

.workspace-analysis-status {
  border: 1px solid #dde3ee;
  border-radius: 8px;
  background: #f7f9fc;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-analysis-status__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: #5e6f8d;
}

.workspace-pill {
  padding: 2px 6px;
  border-radius: 999px;
  background: #e5eaf3;
  color: #5e6f8d;
  font-size: 10px;
  font-weight: 700;
}

.workspace-pill--done {
  background: #d9f4e6;
  color: #1f8f5f;
}

.workspace-analysis-status p {
  margin: 0;
  color: #6a7a96;
  font-size: 11px;
}

.workspace-inline-action {
  border: none;
  background: transparent;
  color: #2f6af2;
  font-size: 11px;
  font-weight: 600;
  text-align: left;
  padding: 0;
  cursor: pointer;
}

.workspace-inline-action--dark {
  color: #42516f;
}

.workspace-log-text {
  margin: 0;
  border: 1px solid #dbe2ef;
  border-radius: 6px;
  background: #ffffff;
  padding: 8px;
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  color: #445273;
}

.workspace-admin-detail {
  border: 1px solid #dbe2ef;
  border-radius: 6px;
  background: #ffffff;
  padding: 8px;
  font-size: 11px;
  color: #425172;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-admin-detail__label {
  color: #7a88a1;
  font-size: 10px;
  margin-bottom: 2px;
}

.workspace-admin-detail pre {
  margin: 0;
  white-space: pre-wrap;
}

.workspace-contest-list {
  max-height: 230px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-contest-item {
  width: 100%;
  border: 1px solid #d8dfec;
  border-radius: 8px;
  background: #f8faff;
  padding: 8px;
  text-align: left;
  cursor: pointer;
}

.workspace-contest-item--active {
  border-color: #7ca3f8;
  background: #ebf2ff;
}

.workspace-contest-item__name {
  font-size: 12px;
  font-weight: 600;
  color: #3a4c6d;
}

.workspace-contest-item__meta {
  margin-top: 4px;
  font-size: 10px;
  color: #7483a0;
}

.workspace-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.workspace-input {
  width: 100%;
  border: 1px solid #d5dce9;
  border-radius: 8px;
  height: 34px;
  padding: 0 10px;
  font-size: 12px;
  color: #344866;
  background: #ffffff;
  outline: none;
}

.workspace-input:focus {
  border-color: #2f6af2;
  box-shadow: 0 0 0 2px rgba(47, 106, 242, 0.14);
}

.workspace-input--small {
  width: 84px;
}

.workspace-topk-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.workspace-topk-row label {
  color: #627492;
  font-size: 11px;
}

.workspace-preset-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workspace-preset-item {
  width: 100%;
  border: 1px solid #d8dfea;
  border-radius: 8px;
  background: #f7f9fd;
  color: #475b7e;
  font-size: 11px;
  text-align: left;
  padding: 7px 8px;
  cursor: pointer;
}

.workspace-preset-item:hover {
  background: #edf3ff;
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>

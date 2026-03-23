<script setup lang="ts">
import type { Contest, Resource } from '~~/shared/types/domain'

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
  resourceLibrary?: Resource[]
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
  resourceLibrary: () => [],
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
  'uploadResource': [file: File]
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
    title: '项目配置',
    icon: 'manage_search',
    hint: '偏好参数',
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
const activeOutlineId = ref('advantage')
const isDragOver = ref(false)
const libraryKeyword = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

const showReason = ref(false)
const showAdminDetails = ref(false)

const activeModuleMeta = computed<WorkspaceLeftModule>(() => {
  return modules.find(item => item.id === activeModule.value) ?? modules[0]!
})

const selectedContest = computed(() => {
  return props.contests.find(contest => contest.id === props.selectedContestId) || null
})

const visibleResources = computed(() => props.selectedResources.slice(0, 10))
const visibleLibraryResources = computed(() => {
  const keyword = libraryKeyword.value.trim().toLowerCase()
  if (!keyword)
    return props.resourceLibrary.slice(0, 10)

  return props.resourceLibrary
    .filter((item) => {
      const context = [item.title, item.summary, item.type, item.year].join(' ').toLowerCase()
      return context.includes(keyword)
    })
    .slice(0, 10)
})

const outlineItems = computed<OutlineItem[]>(() => {
  const dynamicTail = selectedContest.value?.tracks?.slice(0, 2).map((track, index) => ({
    id: `track-${track.id}`,
    label: `${4 + index}. ${track.name}`,
    level: 0,
  })) || []

  return [
    { id: 'background', label: '1. 项目背景', level: 0 },
    { id: 'pain', label: '2. 核心技术痛点', level: 0 },
    { id: 'advantage', label: '3. 竞争优势分析', level: 0 },
    { id: 'barrier', label: '3.1 技术壁垒', level: 1 },
    { id: 'business-model', label: '3.2 商业模式', level: 1 },
    ...dynamicTail,
    { id: 'commercial', label: '6. 商业化路径', level: 0 },
  ]
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

function switchModule(moduleId: string) {
  if (!isWorkspaceLeftModuleId(moduleId))
    return
  activeModule.value = moduleId
}

function selectResource(resourceId: string) {
  activeResourceId.value = resourceId
}

function selectOutline(itemId: string) {
  activeOutlineId.value = itemId
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

function triggerFilePicker() {
  fileInputRef.value?.click()
}

function handleFile(file: File | null | undefined) {
  if (!file || props.resourceMutating || !props.hasActiveProject)
    return
  emit('uploadResource', file)
}

function onFileInputChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  handleFile(file)
  target.value = ''
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  handleFile(file)
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (!props.hasActiveProject || props.resourceMutating)
    return
  isDragOver.value = true
}

function onDragLeave() {
  isDragOver.value = false
}

function addLibraryResource(resourceId: string) {
  if (!resourceId || props.resourceMutating || !props.hasActiveProject)
    return
  emit('addResourceFromLibrary', resourceId)
}

watch(() => props.selectedResources, (nextResources) => {
  if (!nextResources.length) {
    activeResourceId.value = ''
    return
  }

  const stillExists = nextResources.some(item => item.id === activeResourceId.value)
  if (stillExists)
    return

  activeResourceId.value = nextResources[0]?.id || ''
}, { immediate: true, deep: true })

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

onMounted(() => {
  if (!import.meta.client)
    return

  const saved = localStorage.getItem(LEFT_MODULE_STORAGE_KEY)
  if (!saved)
    return

  if (isWorkspaceLeftModuleId(saved))
    activeModule.value = saved
})

watch(activeModule, (value) => {
  if (!import.meta.client)
    return
  localStorage.setItem(LEFT_MODULE_STORAGE_KEY, value)
})
</script>

<template>
  <aside class="workspace-left-dock">
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
          <section class="workspace-upload-block">
            <input
              ref="fileInputRef"
              type="file"
              class="workspace-upload-block__input"
              @change="onFileInputChange"
            >

            <button
              class="workspace-upload-block__drop"
              :class="{
                'workspace-upload-block__drop--active': isDragOver,
                'workspace-upload-block__drop--disabled': !hasActiveProject || resourceMutating,
              }"
              type="button"
              :disabled="!hasActiveProject || resourceMutating"
              @click="triggerFilePicker"
              @drop="onDrop"
              @dragover="onDragOver"
              @dragleave="onDragLeave"
            >
              <span class="material-symbols-outlined">upload_file</span>
              <div>
                <p>{{ resourceMutating ? '处理中...' : '拖拽文件到这里上传，或点击选择文件' }}</p>
                <small>支持从本地添加到当前项目资源</small>
              </div>
            </button>
          </section>

          <section class="workspace-tree-block">
            <div class="workspace-tree-block__title">
              <span class="material-symbols-outlined">keyboard_arrow_down</span>
              <span>PROJECT_RESOURCES</span>
            </div>

            <button
              v-for="resource in visibleResources"
              :key="resource.id"
              class="workspace-tree-item"
              :class="{ 'workspace-tree-item--active': resource.id === activeResourceId }"
              type="button"
              @click="selectResource(resource.id)"
            >
              <span class="material-symbols-outlined workspace-tree-item__icon" :class="resourceIconClass(resource)">
                {{ resourceIcon(resource) }}
              </span>
              <span class="workspace-tree-item__label">{{ resourceDisplayTitle(resource) }}</span>
            </button>

            <p v-if="visibleResources.length === 0" class="workspace-empty-text">
              {{ hasActiveProject ? '当前项目暂无资源。可拖拽上传，或从系统库手动添加。' : '请先创建或选择项目。' }}
            </p>
          </section>

          <section class="workspace-tree-block">
            <div class="workspace-tree-block__title">
              <span class="material-symbols-outlined">keyboard_arrow_down</span>
              <span>SYSTEM_LIBRARY</span>
            </div>

            <div class="workspace-library-toolbar">
              <input
                v-model="libraryKeyword"
                class="workspace-library-search"
                placeholder="搜索系统库资源"
                type="text"
              >
            </div>

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

            <p v-if="visibleLibraryResources.length === 0" class="workspace-empty-text">
              {{ hasActiveProject ? '系统库暂无可添加资源。' : '请先创建或选择项目。' }}
            </p>
          </section>

          <section class="workspace-tree-block">
            <div class="workspace-tree-block__title">
              <span class="material-symbols-outlined">keyboard_arrow_down</span>
              <span>OUTLINE (结构大纲)</span>
            </div>

            <button
              v-for="item in outlineItems"
              :key="item.id"
              class="workspace-outline-item"
              :class="[
                item.level > 0 ? 'workspace-outline-item--child' : '',
                activeOutlineId === item.id ? 'workspace-outline-item--active' : '',
              ]"
              type="button"
              @click="selectOutline(item.id)"
            >
              {{ item.label }}
            </button>
          </section>
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
            <h3>项目配置</h3>
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

.workspace-upload-block {
  margin: 0 12px 10px;
}

.workspace-upload-block__input {
  display: none;
}

.workspace-upload-block__drop {
  width: 100%;
  border: 1px dashed #b8c7e3;
  background: #f7faff;
  border-radius: 10px;
  color: #3f567e;
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.workspace-upload-block__drop .material-symbols-outlined {
  font-size: 22px;
  color: #2f6af2;
}

.workspace-upload-block__drop p {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
}

.workspace-upload-block__drop small {
  display: block;
  margin-top: 2px;
  color: #7283a4;
  font-size: 11px;
}

.workspace-upload-block__drop:hover {
  border-color: #7ca3f8;
  background: #edf4ff;
}

.workspace-upload-block__drop--active {
  border-color: #2f6af2;
  background: #e6efff;
}

.workspace-upload-block__drop--disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.workspace-tree-block {
  margin-bottom: 8px;
}

.workspace-tree-block__title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: #7888a2;
  padding: 4px 14px;
  text-transform: uppercase;
}

.workspace-tree-block__title .material-symbols-outlined {
  font-size: 18px;
}

.workspace-tree-item {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 14px;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  margin: 6px 14px 0;
  color: #9ba7bc;
  font-size: 12px;
}

.workspace-library-toolbar {
  padding: 4px 14px 8px;
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

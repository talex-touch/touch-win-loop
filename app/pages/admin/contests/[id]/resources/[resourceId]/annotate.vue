<script setup lang="ts">
import type {
  ApiResponse,
  DocumentAnalysis,
  DocumentBBox,
  DocumentBlock,
  DocumentField,
  ResourceDocument,
  ResourceDocumentTask,
} from '~~/shared/types/domain'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

definePageMeta({
  layout: 'admin',
})

GlobalWorkerOptions.workerSrc = pdfWorkerSrc

const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'
const route = useRoute()

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

const contestId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.id
  return Array.isArray(value) ? (value[0] || '') : (value || '')
})

const resourceId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params.resourceId
  return Array.isArray(value) ? (value[0] || '') : (value || '')
})

const isEmbedMode = computed(() => {
  const value = route.query.embed
  if (Array.isArray(value))
    return value[0] === '1'
  return value === '1'
})

function withEmbed(path: string): string | { path: string, query: { embed: string } } {
  if (isEmbedMode.value)
    return { path, query: { embed: '1' } }
  return path
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeBbox(input: Partial<DocumentBBox>): DocumentBBox {
  const x = Math.max(0, Math.min(1, Number(input.x || 0)))
  const y = Math.max(0, Math.min(1, Number(input.y || 0)))
  const w = Math.max(0.01, Math.min(1 - x, Number(input.w || 0.1)))
  const h = Math.max(0.01, Math.min(1 - y, Number(input.h || 0.05)))
  return { x, y, w, h }
}

const loading = ref(false)
const saving = ref(false)
const renderLoading = ref(false)
const errorText = ref('')
const successText = ref('')
const selectedPage = ref(1)
const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const pdfDoc = ref<any>(null)
const canvasSize = reactive({
  width: 1,
  height: 1,
})

const documentInfo = ref<(ResourceDocument & {
  latestTask: ResourceDocumentTask | null
  previewUrl: string
}) | null>(null)
const analysisPayload = ref<{
  analysisJson: DocumentAnalysis | null
  annotationJson: DocumentAnalysis | null
  parseStatus: string
  parseError: string
  previewUrl: string
} | null>(null)
const editableAnalysis = ref<DocumentAnalysis | null>(null)
const selectedType = ref<'block' | 'field'>('block')
const selectedIndex = ref<number>(-1)

const effectiveAnalysis = computed(() => editableAnalysis.value)

const pageList = computed(() => {
  const pages = effectiveAnalysis.value?.pages || []
  return pages.map(item => item.page)
})

const currentPage = computed(() => {
  const analysis = effectiveAnalysis.value
  if (!analysis)
    return null
  return analysis.pages.find(item => item.page === selectedPage.value) || null
})

const selectedBlock = computed(() => {
  if (selectedType.value !== 'block' || selectedIndex.value < 0)
    return null
  return currentPage.value?.blocks[selectedIndex.value] || null
})

const selectedField = computed(() => {
  if (selectedType.value !== 'field' || selectedIndex.value < 0)
    return null
  return currentPage.value?.fields[selectedIndex.value] || null
})

interface DragState {
  mode: 'move' | 'resize'
  type: 'block' | 'field'
  index: number
  startX: number
  startY: number
  initial: DocumentBBox
}

const dragState = ref<DragState | null>(null)

function findEditableItem(type: 'block' | 'field', index: number): DocumentBlock | DocumentField | null {
  if (!currentPage.value)
    return null
  if (type === 'block')
    return currentPage.value.blocks[index] || null
  return currentPage.value.fields[index] || null
}

function updateSelectedBox(partial: Partial<DocumentBBox>) {
  const target = selectedType.value === 'block' ? selectedBlock.value : selectedField.value
  if (!target)
    return
  target.bbox = normalizeBbox({
    ...target.bbox,
    ...partial,
  })
}

function startDrag(event: MouseEvent, type: 'block' | 'field', index: number, mode: 'move' | 'resize') {
  const item = findEditableItem(type, index)
  if (!item)
    return
  event.preventDefault()
  selectedType.value = type
  selectedIndex.value = index
  dragState.value = {
    mode,
    type,
    index,
    startX: event.clientX,
    startY: event.clientY,
    initial: deepClone(item.bbox),
  }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', stopDrag)
}

function onDragMove(event: MouseEvent) {
  const state = dragState.value
  if (!state || !canvasSize.width || !canvasSize.height)
    return

  const target = findEditableItem(state.type, state.index)
  if (!target)
    return

  const dx = (event.clientX - state.startX) / canvasSize.width
  const dy = (event.clientY - state.startY) / canvasSize.height
  if (state.mode === 'move') {
    target.bbox = normalizeBbox({
      x: state.initial.x + dx,
      y: state.initial.y + dy,
      w: state.initial.w,
      h: state.initial.h,
    })
    return
  }

  target.bbox = normalizeBbox({
    x: state.initial.x,
    y: state.initial.y,
    w: state.initial.w + dx,
    h: state.initial.h + dy,
  })
}

function stopDrag() {
  dragState.value = null
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', stopDrag)
}

function addBlock() {
  if (!currentPage.value)
    return
  currentPage.value.blocks.push({
    id: createId(),
    page: selectedPage.value,
    type: 'paragraph',
    text: '新建文本块',
    bbox: {
      x: 0.1,
      y: 0.1,
      w: 0.3,
      h: 0.08,
    },
    confidence: 0.5,
  })
  selectedType.value = 'block'
  selectedIndex.value = currentPage.value.blocks.length - 1
}

function addField() {
  if (!currentPage.value)
    return
  currentPage.value.fields.push({
    id: createId(),
    page: selectedPage.value,
    key: '字段名',
    value: '字段值',
    bbox: {
      x: 0.1,
      y: 0.22,
      w: 0.3,
      h: 0.08,
    },
    confidence: 0.5,
  })
  selectedType.value = 'field'
  selectedIndex.value = currentPage.value.fields.length - 1
}

function removeSelected() {
  if (!currentPage.value)
    return
  if (selectedType.value === 'block' && selectedIndex.value >= 0) {
    currentPage.value.blocks.splice(selectedIndex.value, 1)
  }
  if (selectedType.value === 'field' && selectedIndex.value >= 0) {
    currentPage.value.fields.splice(selectedIndex.value, 1)
  }
  selectedIndex.value = -1
}

function setSelected(type: 'block' | 'field', index: number) {
  selectedType.value = type
  selectedIndex.value = index
}

async function renderPage(pageNo: number) {
  if (!pdfDoc.value || !canvasRef.value)
    return
  renderLoading.value = true
  try {
    const page = await pdfDoc.value.getPage(pageNo)
    const viewport = page.getViewport({ scale: 1.35 })
    const canvas = canvasRef.value
    const context = canvas.getContext('2d')
    if (!context)
      return

    canvas.width = viewport.width
    canvas.height = viewport.height
    canvasSize.width = viewport.width
    canvasSize.height = viewport.height
    await page.render({
      canvasContext: context,
      viewport,
    }).promise
  }
  finally {
    renderLoading.value = false
  }
}

async function loadPdf() {
  if (!analysisPayload.value?.previewUrl)
    return

  pdfDoc.value = await getDocument({
    url: analysisPayload.value.previewUrl,
    withCredentials: true,
  }).promise

  if (selectedPage.value < 1 || selectedPage.value > pdfDoc.value.numPages)
    selectedPage.value = 1
  await renderPage(selectedPage.value)
}

async function loadAll() {
  loading.value = true
  errorText.value = ''
  successText.value = ''
  try {
    const docResponse = await $fetch<ApiResponse<(ResourceDocument & {
      latestTask: ResourceDocumentTask | null
      previewUrl: string
    })>>(endpoint(`/admin/contests/${contestId.value}/resources/${resourceId.value}/document`))
    documentInfo.value = docResponse.data

    const analysisResponse = await $fetch<ApiResponse<{
      analysisJson: DocumentAnalysis | null
      annotationJson: DocumentAnalysis | null
      parseStatus: string
      parseError: string
      previewUrl: string
    }>>(endpoint(`/admin/documents/${docResponse.data.id}/analysis`))

    analysisPayload.value = analysisResponse.data
    const source = analysisResponse.data.annotationJson || analysisResponse.data.analysisJson
    editableAnalysis.value = source
      ? deepClone(source)
      : {
          version: 'v1',
          source: 'manual',
          pages: [],
        }

    if (pageList.value.length > 0 && !pageList.value.includes(selectedPage.value))
      selectedPage.value = pageList.value[0]!

    await loadPdf()
    startPollingIfNeeded()
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '加载标注数据失败。')
  }
  finally {
    loading.value = false
  }
}

function startPollingIfNeeded() {
  if (pollTimer.value) {
    clearInterval(pollTimer.value)
    pollTimer.value = null
  }

  const status = analysisPayload.value?.parseStatus
  if (status !== 'queued' && status !== 'processing')
    return

  pollTimer.value = setInterval(async () => {
    try {
      if (!documentInfo.value)
        return
      const response = await $fetch<ApiResponse<{
        analysisJson: DocumentAnalysis | null
        annotationJson: DocumentAnalysis | null
        parseStatus: string
        parseError: string
        previewUrl: string
      }>>(endpoint(`/admin/documents/${documentInfo.value.id}/analysis`))
      analysisPayload.value = response.data
      if (response.data.parseStatus === 'succeeded') {
        const source = response.data.annotationJson || response.data.analysisJson
        editableAnalysis.value = source ? deepClone(source) : editableAnalysis.value
        if (pageList.value.length > 0 && !pageList.value.includes(selectedPage.value))
          selectedPage.value = pageList.value[0]!
        await renderPage(selectedPage.value)
        if (pollTimer.value) {
          clearInterval(pollTimer.value)
          pollTimer.value = null
        }
      }
    }
    catch {
      // 轮询失败忽略，下次继续。
    }
  }, 3000)
}

async function saveAnnotation() {
  if (!documentInfo.value || !editableAnalysis.value)
    return

  saving.value = true
  errorText.value = ''
  successText.value = ''
  try {
    await $fetch(endpoint(`/admin/documents/${documentInfo.value.id}/analysis`), {
      method: 'PATCH',
      body: {
        annotationJson: editableAnalysis.value,
      },
    })
    successText.value = '标注已保存。'
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '保存失败。')
  }
  finally {
    saving.value = false
  }
}

watch(selectedPage, async (value) => {
  selectedIndex.value = -1
  if (value > 0)
    await renderPage(value)
})

onMounted(loadAll)
onBeforeUnmount(() => {
  stopDrag()
  if (pollTimer.value)
    clearInterval(pollTimer.value)
})
</script>

<template>
  <div class="space-y-4">
    <section class="rounded-lg border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 class="text-lg font-semibold text-slate-900">
            PDF 标注编辑
          </h1>
          <p class="mt-1 text-xs text-slate-500">
            resource_id：{{ resourceId }}；解析状态：{{ analysisPayload?.parseStatus || '-' }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <NuxtLink class="dense-btn" :to="withEmbed(`/admin/contests/${contestId}/resources/${resourceId}/edit`)">
            返回资料编辑
          </NuxtLink>
          <a-button type="primary" size="small" :loading="saving" @click="saveAnnotation">
            {{ saving ? '保存中...' : '保存标注' }}
          </a-button>
        </div>
      </div>
    </section>

    <section v-if="errorText" class="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
      {{ errorText }}
    </section>
    <section v-if="successText" class="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
      {{ successText }}
    </section>

    <section v-if="loading" class="rounded-lg border border-slate-200 bg-white p-4">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="8" />
      </a-skeleton>
    </section>

    <section v-else class="grid gap-4 lg:grid-cols-[minmax(0,1fr),340px]">
      <div class="rounded-lg border border-slate-200 bg-white p-3">
        <div class="mb-2 flex items-center gap-2">
          <label class="text-xs text-slate-600">页码</label>
          <select v-model.number="selectedPage" class="dense-input w-28">
            <option v-for="pageNo in pageList" :key="pageNo" :value="pageNo">
              第 {{ pageNo }} 页
            </option>
          </select>
          <span v-if="renderLoading" class="text-xs text-slate-500">渲染中...</span>
        </div>

        <div class="relative overflow-auto rounded border border-slate-200 bg-slate-50">
          <canvas ref="canvasRef" class="mx-auto block" />

          <template v-if="currentPage">
            <div
              v-for="(item, index) in currentPage.blocks"
              :key="item.id"
              class="absolute cursor-move border-2 border-blue-500 bg-blue-500/8"
              :class="{ 'ring-2 ring-blue-300': selectedType === 'block' && selectedIndex === index }"
              :style="{
                left: `${item.bbox.x * canvasSize.width}px`,
                top: `${item.bbox.y * canvasSize.height}px`,
                width: `${item.bbox.w * canvasSize.width}px`,
                height: `${item.bbox.h * canvasSize.height}px`,
              }"
              @mousedown="event => startDrag(event, 'block', index, 'move')"
              @click.stop="setSelected('block', index)"
            >
              <span class="absolute -top-5 left-0 rounded bg-blue-600 px-1 text-[10px] text-white">{{ item.type }}</span>
              <button
                class="absolute -right-2 -bottom-2 h-3 w-3 cursor-se-resize rounded-full border border-blue-700 bg-blue-300"
                @mousedown.stop="event => startDrag(event, 'block', index, 'resize')"
              />
            </div>

            <div
              v-for="(item, index) in currentPage.fields"
              :key="item.id"
              class="absolute cursor-move border-2 border-emerald-500 bg-emerald-500/8"
              :class="{ 'ring-2 ring-emerald-300': selectedType === 'field' && selectedIndex === index }"
              :style="{
                left: `${item.bbox.x * canvasSize.width}px`,
                top: `${item.bbox.y * canvasSize.height}px`,
                width: `${item.bbox.w * canvasSize.width}px`,
                height: `${item.bbox.h * canvasSize.height}px`,
              }"
              @mousedown="event => startDrag(event, 'field', index, 'move')"
              @click.stop="setSelected('field', index)"
            >
              <span class="absolute -top-5 left-0 rounded bg-emerald-600 px-1 text-[10px] text-white">{{ item.key }}</span>
              <button
                class="absolute -right-2 -bottom-2 h-3 w-3 cursor-se-resize rounded-full border border-emerald-700 bg-emerald-300"
                @mousedown.stop="event => startDrag(event, 'field', index, 'resize')"
              />
            </div>
          </template>
        </div>
      </div>

      <div class="space-y-3">
        <section class="rounded-lg border border-slate-200 bg-white p-3">
          <div class="flex flex-wrap items-center gap-2">
            <a-button size="small" @click="addBlock">
              新增块
            </a-button>
            <a-button size="small" @click="addField">
              新增字段
            </a-button>
            <a-button size="small" status="danger" @click="removeSelected">
              删除选中
            </a-button>
          </div>
        </section>

        <section class="rounded-lg border border-slate-200 bg-white p-3">
          <h3 class="mb-2 text-sm font-semibold text-slate-800">
            选中元素
          </h3>
          <div v-if="selectedBlock" class="space-y-2">
            <a-input v-model="selectedBlock.type" size="small" placeholder="类型" />
            <a-textarea v-model="selectedBlock.text" :auto-size="{ minRows: 2, maxRows: 4 }" />
          </div>
          <div v-else-if="selectedField" class="space-y-2">
            <a-input v-model="selectedField.key" size="small" placeholder="字段名" />
            <a-input v-model="selectedField.value" size="small" placeholder="字段值" />
          </div>
          <p v-else class="text-xs text-slate-500">
            请先在左侧画布中选择一个框。
          </p>

          <div v-if="selectedBlock || selectedField" class="mt-2 grid grid-cols-2 gap-2">
            <a-input-number
              :model-value="(selectedBlock || selectedField)?.bbox.x"
              size="small"
              :step="0.01"
              :min="0"
              :max="1"
              placeholder="x"
              @change="(value: string | number | undefined) => updateSelectedBox({ x: Number(value || 0) })"
            />
            <a-input-number
              :model-value="(selectedBlock || selectedField)?.bbox.y"
              size="small"
              :step="0.01"
              :min="0"
              :max="1"
              placeholder="y"
              @change="(value: string | number | undefined) => updateSelectedBox({ y: Number(value || 0) })"
            />
            <a-input-number
              :model-value="(selectedBlock || selectedField)?.bbox.w"
              size="small"
              :step="0.01"
              :min="0.01"
              :max="1"
              placeholder="w"
              @change="(value: string | number | undefined) => updateSelectedBox({ w: Number(value || 0.1) })"
            />
            <a-input-number
              :model-value="(selectedBlock || selectedField)?.bbox.h"
              size="small"
              :step="0.01"
              :min="0.01"
              :max="1"
              placeholder="h"
              @change="(value: string | number | undefined) => updateSelectedBox({ h: Number(value || 0.05) })"
            />
          </div>
        </section>

        <section class="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <p>解析错误：{{ analysisPayload?.parseError || '-' }}</p>
          <p>最近任务：{{ documentInfo?.latestTask?.status || '-' }}</p>
          <p>提示：蓝框=版面块，绿框=字段。</p>
        </section>
      </div>
    </section>
  </div>
</template>

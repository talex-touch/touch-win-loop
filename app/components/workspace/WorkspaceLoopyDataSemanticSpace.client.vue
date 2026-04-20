<script setup lang="ts">
import type {
  ApiResponse,
  ProjectKnowledgeEmbeddingStatus,
  ProjectKnowledgeNodeDetail,
  ProjectKnowledgeSemanticLayoutLevel,
  ProjectKnowledgeSemanticLayoutPayload,
  ProjectKnowledgeSemanticLayoutType,
  ProjectKnowledgeSemanticPoint,
} from '~~/shared/types/domain'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WorkspaceLoopyDataNodeDetail from '~/components/workspace/WorkspaceLoopyDataNodeDetail.vue'
import { useApiEndpoint } from '~/composables/useApiEndpoint'

const props = defineProps<{
  projectId?: string
}>()

const { endpoint } = useApiEndpoint()
const containerRef = ref<HTMLDivElement | null>(null)
const loading = ref(false)
const error = ref('')
const payload = ref<ProjectKnowledgeSemanticLayoutPayload | null>(null)
const detail = ref<ProjectKnowledgeNodeDetail | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
const layoutType = ref<ProjectKnowledgeSemanticLayoutType>('chunk_space')
const level = ref<ProjectKnowledgeSemanticLayoutLevel>('chunk')
const embeddingStatus = ref<ProjectKnowledgeEmbeddingStatus | ''>('')

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let frameHandle = 0
let pointRoot: THREE.Object3D | null = null
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

function toneColor(point: ProjectKnowledgeSemanticPoint): THREE.Color {
  const modality = point.modality
  if (modality === 'text')
    return new THREE.Color('#3c82f6')
  if (modality === 'image')
    return new THREE.Color('#14b8a6')
  if (modality === 'audio')
    return new THREE.Color('#f59e0b')
  if (modality === 'video')
    return new THREE.Color('#ef5a8b')
  if (modality === 'draw')
    return new THREE.Color('#8b5cf6')
  return new THREE.Color('#64748b')
}

function statusOpacity(status: ProjectKnowledgeEmbeddingStatus): number {
  if (status === 'native')
    return 0.96
  if (status === 'derived')
    return 0.82
  if (status === 'fallback')
    return 0.56
  if (status === 'failed')
    return 0.32
  return 0.24
}

function pointScale(point: ProjectKnowledgeSemanticPoint): number {
  return Math.max(0.16, Math.min(1.1, 0.14 + (point.importance / 10)))
}

function pointGeometry(point: ProjectKnowledgeSemanticPoint): THREE.BufferGeometry {
  if (point.nodeType === 'cluster')
    return new THREE.IcosahedronGeometry(0.52, 0)
  if (point.modality === 'image')
    return new THREE.BoxGeometry(0.44, 0.44, 0.44)
  if (point.modality === 'audio')
    return new THREE.ConeGeometry(0.32, 0.62, 6)
  if (point.modality === 'draw')
    return new THREE.OctahedronGeometry(0.4, 0)
  return new THREE.SphereGeometry(0.28, 14, 14)
}

function disposeObject(object: THREE.Object3D | null): void {
  if (!object)
    return
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry)
      mesh.geometry.dispose()
    const material = mesh.material
    if (Array.isArray(material))
      material.forEach(item => item.dispose())
    else
      material?.dispose?.()
  })
  if (scene)
    scene.remove(object)
}

function rebuildScene(): void {
  if (!scene)
    return

  disposeObject(pointRoot)
  pointRoot = new THREE.Group()
  const points = payload.value?.points || []

  if (points.length > 1000) {
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(points.length * 3)
    const colors = new Float32Array(points.length * 3)
    points.forEach((point, index) => {
      positions[index * 3] = point.x
      positions[(index * 3) + 1] = point.y
      positions[(index * 3) + 2] = point.z
      const color = toneColor(point)
      colors[index * 3] = color.r
      colors[(index * 3) + 1] = color.g
      colors[(index * 3) + 2] = color.b
    })
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const material = new THREE.PointsMaterial({
      size: 0.19,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      sizeAttenuation: true,
    })
    const cloud = new THREE.Points(geometry, material)
    cloud.userData.points = points
    pointRoot.add(cloud)
  }
  else {
    for (const point of points) {
      const geometry = pointGeometry(point)
      const material = new THREE.MeshStandardMaterial({
        color: toneColor(point),
        transparent: true,
        opacity: statusOpacity(point.embeddingStatus),
        emissive: toneColor(point).clone().multiplyScalar(point.nodeType === 'cluster' ? 0.22 : 0.08),
        metalness: 0.06,
        roughness: 0.42,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(point.x, point.y, point.z)
      mesh.scale.setScalar(pointScale(point))
      mesh.userData.point = point
      pointRoot.add(mesh)
    }
  }

  scene.add(pointRoot)
}

function animate(): void {
  if (!renderer || !scene || !camera)
    return
  frameHandle = window.requestAnimationFrame(animate)
  controls?.update()
  renderer.render(scene, camera)
}

function handleResize(): void {
  if (!renderer || !camera || !containerRef.value)
    return
  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight
  renderer.setSize(width, height, false)
  camera.aspect = width / Math.max(height, 1)
  camera.updateProjectionMatrix()
}

async function loadNodeDetail(point: ProjectKnowledgeSemanticPoint): Promise<void> {
  const projectId = String(props.projectId || '').trim()
  const resolvedType = point.nodeType === 'cluster' ? 'source' : point.nodeType
  const resolvedNodeId = point.nodeType === 'cluster'
    ? String(point.metadata.sourceId || point.clusterId || '').trim()
    : point.nodeId
  if (!projectId || !resolvedNodeId || (resolvedType !== 'source' && resolvedType !== 'chunk'))
    return

  detailLoading.value = true
  detailError.value = ''
  try {
    const query = new URLSearchParams({
      nodeId: resolvedNodeId,
      nodeType: resolvedType,
    })
    const response = await unsafeFetch<ApiResponse<ProjectKnowledgeNodeDetail>>(
      `${endpoint(`/projects/${projectId}/knowledge/node-detail`)}?${query.toString()}`,
    )
    detail.value = response.data || null
  }
  catch (fetchError: any) {
    detail.value = null
    detailError.value = String(fetchError?.data?.message || '加载节点详情失败，请稍后重试。').trim() || '加载节点详情失败，请稍后重试。'
  }
  finally {
    detailLoading.value = false
  }
}

function pickPoint(event: PointerEvent): void {
  if (!renderer || !camera || !containerRef.value || !pointRoot)
    return
  const rect = containerRef.value.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
  raycaster.setFromCamera(pointer, camera)
  const intersections = raycaster.intersectObjects(pointRoot.children, true)
  const hit = intersections[0]
  if (!hit)
    return
  const directPoint = hit.object.userData.point as ProjectKnowledgeSemanticPoint | undefined
  if (directPoint) {
    void loadNodeDetail(directPoint)
    return
  }

  const points = hit.object.userData.points as ProjectKnowledgeSemanticPoint[] | undefined
  if (points && typeof hit.index === 'number' && points[hit.index])
    void loadNodeDetail(points[hit.index]!)
}

async function loadLayout(): Promise<void> {
  const projectId = String(props.projectId || '').trim()
  if (!projectId) {
    payload.value = null
    return
  }

  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({
      layoutType: layoutType.value,
      level: level.value,
    })
    if (embeddingStatus.value)
      params.set('embeddingStatus', embeddingStatus.value)
    const response = await unsafeFetch<ApiResponse<ProjectKnowledgeSemanticLayoutPayload>>(
      `${endpoint(`/projects/${projectId}/knowledge/semantic-layout`)}?${params.toString()}`,
    )
    payload.value = response.data || null
    rebuildScene()
  }
  catch (fetchError: any) {
    payload.value = null
    error.value = String(fetchError?.data?.message || '加载语义空间失败，请稍后重试。').trim() || '加载语义空间失败，请稍后重试。'
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  if (!containerRef.value)
    return

  scene = new THREE.Scene()
  scene.background = new THREE.Color('#f4f9ff')
  scene.fog = new THREE.Fog('#f4f9ff', 10, 42)

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500)
  camera.position.set(0, 0, 15)

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  containerRef.value.appendChild(renderer.domElement)

  const ambient = new THREE.AmbientLight('#ffffff', 1.1)
  const keyLight = new THREE.DirectionalLight('#d5f1ff', 1.4)
  keyLight.position.set(6, 8, 10)
  const fillLight = new THREE.DirectionalLight('#ffd6d6', 0.5)
  fillLight.position.set(-5, -4, 8)
  scene.add(ambient, keyLight, fillLight)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.minDistance = 5
  controls.maxDistance = 40

  renderer.domElement.addEventListener('click', pickPoint)
  window.addEventListener('resize', handleResize)
  handleResize()
  rebuildScene()
  animate()
})

onBeforeUnmount(() => {
  if (renderer?.domElement)
    renderer.domElement.removeEventListener('click', pickPoint)
  window.removeEventListener('resize', handleResize)
  if (frameHandle)
    window.cancelAnimationFrame(frameHandle)
  disposeObject(pointRoot)
  controls?.dispose()
  renderer?.dispose()
  if (renderer?.domElement.parentNode)
    renderer.domElement.parentNode.removeChild(renderer.domElement)
  renderer = null
  controls = null
  camera = null
  scene = null
})

watch(() => [props.projectId, layoutType.value, level.value, embeddingStatus.value], () => {
  detail.value = null
  detailError.value = ''
  void loadLayout()
}, { immediate: true })
</script>

<template>
  <div class="loopy-space">
    <section class="loopy-space__shell">
      <div class="loopy-space__toolbar">
        <div class="loopy-space__segmented">
          <button
            v-for="item in [
              { key: 'chunk_space', label: 'Chunk Space' },
              { key: 'document_galaxy', label: 'Document Galaxy' },
              { key: 'multimodal_bridge', label: 'Multimodal Bridge' },
            ]"
            :key="item.key"
            class="loopy-space__tab"
            :data-active="layoutType === item.key"
            type="button"
            @click="layoutType = item.key as ProjectKnowledgeSemanticLayoutType"
          >
            {{ item.label }}
          </button>
        </div>

        <div class="loopy-space__segmented">
          <button
            v-for="item in ['cluster', 'document', 'chunk']"
            :key="item"
            class="loopy-space__tab"
            :data-active="level === item"
            type="button"
            @click="level = item as ProjectKnowledgeSemanticLayoutLevel"
          >
            {{ item }}
          </button>
        </div>

        <label class="loopy-space__field">
          <span>Embedding 状态</span>
          <select v-model="embeddingStatus">
            <option value="">全部</option>
            <option value="native">native</option>
            <option value="derived">derived</option>
            <option value="fallback">fallback</option>
            <option value="missing">missing</option>
            <option value="failed">failed</option>
          </select>
        </label>
      </div>

      <div class="loopy-space__meta">
        <span>算法 {{ payload?.layout?.algorithm || '-' }}</span>
        <span>状态 {{ payload?.layout?.status || '-' }}</span>
        <span>返回 {{ payload?.selectionSummary.returnedPoints || 0 }} / {{ payload?.selectionSummary.totalPoints || 0 }}</span>
        <span>最近刷新 {{ payload?.layout?.updatedAt || payload?.analytics.semanticLayoutUpdatedAt || '-' }}</span>
      </div>

      <div v-if="loading" class="loopy-space__empty">
        正在计算真实语义布局...
      </div>
      <div v-else-if="error" class="loopy-space__empty loopy-space__empty--error">
        {{ error }}
      </div>
      <div v-else-if="!payload || !payload.layout" class="loopy-space__empty">
        当前还没有可用的语义空间布局。
      </div>
      <div v-else ref="containerRef" class="loopy-space__canvas" />

      <div class="loopy-space__legend">
        <span class="loopy-space__legend-item"><i style="background:#3c82f6" />text</span>
        <span class="loopy-space__legend-item"><i style="background:#14b8a6" />image</span>
        <span class="loopy-space__legend-item"><i style="background:#f59e0b" />audio</span>
        <span class="loopy-space__legend-item"><i style="background:#ef5a8b" />video</span>
        <span class="loopy-space__legend-item"><i style="background:#8b5cf6" />draw</span>
      </div>
    </section>

    <WorkspaceLoopyDataNodeDetail
      :detail="detail"
      :loading="detailLoading"
      :error="detailError"
      empty-label="点击 3D 空间中的点位查看 source / chunk 详情"
    />
  </div>
</template>

<style scoped>
.loopy-space {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  min-height: 760px;
}

.loopy-space__shell {
  display: flex;
  flex-direction: column;
  gap: 14px;
  border: 1px solid #dbe7f3;
  border-radius: 24px;
  background:
    radial-gradient(circle at top left, rgba(61, 173, 197, 0.11), transparent 30%),
    linear-gradient(160deg, #ffffff 0%, #f7fbff 100%);
  padding: 18px;
  box-shadow: 0 12px 30px rgba(36, 73, 125, 0.05);
}

.loopy-space__toolbar,
.loopy-space__meta,
.loopy-space__legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.loopy-space__segmented {
  display: inline-flex;
  gap: 6px;
  padding: 4px;
  border: 1px solid #dbe7f3;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
}

.loopy-space__tab,
.loopy-space__field select {
  min-height: 34px;
  border-radius: 999px;
  border: 1px solid #d7e4f1;
  background: #fff;
  color: #3a5677;
  font-size: 12px;
  font-weight: 700;
}

.loopy-space__tab {
  padding: 0 12px;
}

.loopy-space__tab[data-active='true'] {
  background: #11253a;
  border-color: #11253a;
  color: #fff;
}

.loopy-space__field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  color: #5d7698;
  font-size: 12px;
}

.loopy-space__field select {
  padding: 0 10px;
}

.loopy-space__meta {
  color: #6980a0;
  font-size: 12px;
}

.loopy-space__canvas,
.loopy-space__empty {
  width: 100%;
  height: 620px;
  border: 1px solid #dbe7f3;
  border-radius: 22px;
  background:
    radial-gradient(circle at center, rgba(255, 255, 255, 0.88), rgba(244, 249, 255, 0.96)),
    linear-gradient(180deg, #f7fbff 0%, #ffffff 100%);
}

.loopy-space__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6980a0;
  font-size: 13px;
}

.loopy-space__empty--error {
  color: #b45309;
}

.loopy-space__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  min-height: 30px;
  border-radius: 999px;
  border: 1px solid #dce7f4;
  background: rgba(255, 255, 255, 0.92);
  color: #506985;
  font-size: 12px;
}

.loopy-space__legend-item i {
  display: inline-flex;
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

@media (max-width: 1440px) {
  .loopy-space {
    grid-template-columns: 1fr;
  }

  .loopy-space__field {
    margin-left: 0;
  }
}
</style>

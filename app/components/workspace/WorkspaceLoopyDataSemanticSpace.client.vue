<script setup lang="ts">
import type {
  ApiResponse,
  ProjectKnowledgeEmbeddingStatus,
  ProjectKnowledgeIndexDashboard,
  ProjectKnowledgeSemanticCluster,
  ProjectKnowledgeSemanticLayoutPayload,
  ProjectKnowledgeSemanticPoint,
} from '~~/shared/types/domain'
import { useApiEndpoint } from '~/composables/useApiEndpoint'

type ThreeRuntime = Record<string, any>

interface ScenePoint extends ProjectKnowledgeSemanticPoint {
  sceneX: number
  sceneY: number
  sceneZ: number
  radius: number
  color: string
}

interface SceneCluster extends ProjectKnowledgeSemanticCluster {
  sceneX: number
  sceneY: number
  sceneZ: number
  color: string
  radius: number
}

const props = withDefaults(defineProps<{
  projectId?: string
  dashboard?: ProjectKnowledgeIndexDashboard | null
}>(), {
  projectId: '',
  dashboard: null,
})

const { endpoint } = useApiEndpoint()

const sceneHost = ref<HTMLElement | null>(null)
const loading = ref(false)
const error = ref('')
const payload = ref<ProjectKnowledgeSemanticLayoutPayload | null>(null)
const hoveredPointId = ref('')
const selectedPointId = ref('')
const rendererReady = ref(false)

let three: ThreeRuntime | null = null
let scene: any = null
let camera: any = null
let renderer: any = null
let controls: any = null
let raycaster: any = null
let pointer: any = null
let dataGroup: any = null
let resizeObserver: ResizeObserver | null = null
let animationFrame = 0
let pointMeshes: any[] = []
let clusterMeshes: any[] = []

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeText(value: unknown, fallback = ''): string {
  const text = String(value || '').trim()
  return text || fallback
}

function resolveAlgorithmLabel(value?: string | null): string {
  return String(value || '').trim().toLowerCase() === 'pca3d' ? 'PCA 3D' : 'UMAP 3D'
}

function resolveClusterColor(index: number, total: number): string {
  const palette = ['#4f7cff', '#14b8a6', '#f59e0b', '#ef476f', '#7c3aed', '#22c55e', '#06b6d4', '#f97316']
  return palette[index % Math.max(1, Math.min(total || palette.length, palette.length))] || palette[0]!
}

function resolvePointOpacity(status: ProjectKnowledgeEmbeddingStatus): number {
  if (status === 'native')
    return 0.94
  if (status === 'derived')
    return 0.78
  if (status === 'fallback')
    return 0.54
  if (status === 'failed')
    return 0.3
  return 0.24
}

function formatSimilarity(value: number): string {
  const normalized = Number(value || 0)
  if (!Number.isFinite(normalized) || normalized <= 0)
    return '0.00'
  return normalized.toFixed(2)
}

function resolveDensityLabel(value: number): string {
  if (value >= 0.78)
    return '高'
  if (value >= 0.52)
    return '中'
  return '低'
}

function createAnalyticsFallback(): ProjectKnowledgeSemanticLayoutPayload['analytics'] {
  return props.dashboard?.analytics || {
    relationsUpdatedAt: null,
    snapshotUpdatedAt: null,
    semanticLayoutUpdatedAt: null,
    latestSnapshotType: null,
    relationsJobStatus: null,
    snapshotJobStatus: null,
    semanticLayoutJobStatus: null,
    staleKinds: ['relations', 'snapshot', 'semantic_layout'],
    allReady: false,
  }
}

function buildSimulatedLayoutPayload(projectId: string): ProjectKnowledgeSemanticLayoutPayload {
  const now = new Date().toISOString()
  const sourceLabels = (props.dashboard?.sources || [])
    .map(source => normalizeText(source.resourceTitle))
    .filter(Boolean)
    .slice(0, 6)
  const fallbackLabels = ['竞赛规则解读', '项目材料证据', '技术架构说明', '答辩风险识别', '数据治理方案', '多模态素材索引']
  const clusterLabels = [...sourceLabels, ...fallbackLabels].slice(0, 6)
  const statuses: ProjectKnowledgeEmbeddingStatus[] = ['native', 'derived', 'native', 'fallback', 'native', 'derived']
  const modalities: Array<ProjectKnowledgeSemanticPoint['modality']> = ['text', 'image', 'draw', 'audio', 'video', 'mixed']
  const clusters: ProjectKnowledgeSemanticCluster[] = []
  const points: ProjectKnowledgeSemanticPoint[] = []

  clusterLabels.forEach((label, clusterIndex) => {
    const angle = (clusterIndex / Math.max(1, clusterLabels.length)) * Math.PI * 2
    const center = {
      x: Math.cos(angle) * 7.6,
      y: Math.sin(angle * 1.7) * 2.4,
      z: Math.sin(angle) * 6.2,
    }
    const nodeCount = 15 + ((clusterIndex * 7) % 12)
    const clusterId = `sim-cluster-${clusterIndex + 1}`
    const status = statuses[clusterIndex % statuses.length] || 'native'
    const modality = modalities[clusterIndex % modalities.length] || 'unknown'

    clusters.push({
      id: clusterId,
      label,
      nodeCount,
      modality,
      embeddingStatus: status,
      densityScore: Number((0.58 + ((clusterIndex % 4) * 0.09)).toFixed(2)),
      topicLabel: label,
      similarityScore: Number((0.72 + ((clusterIndex % 5) * 0.04)).toFixed(2)),
      centroid: center,
    })

    for (let pointIndex = 0; pointIndex < nodeCount; pointIndex += 1) {
      const localAngle = (pointIndex * 2.399) + (clusterIndex * 0.71)
      const ring = 0.55 + ((pointIndex % 8) * 0.18)
      const wave = Math.sin((pointIndex + 1) * 0.61)
      points.push({
        id: `sim-point-${clusterIndex + 1}-${pointIndex + 1}`,
        layoutId: 'simulated-layout',
        nodeType: 'chunk',
        nodeId: `sim-node-${clusterIndex + 1}-${pointIndex + 1}`,
        level: 'chunk',
        x: center.x + (Math.cos(localAngle) * ring) + (wave * 0.4),
        y: center.y + (Math.sin(localAngle * 0.72) * ring * 0.86),
        z: center.z + (Math.sin(localAngle) * ring) + (Math.cos(pointIndex * 0.37) * 0.48),
        clusterId,
        modality,
        embeddingStatus: pointIndex % 13 === 0 ? 'fallback' : pointIndex % 17 === 0 ? 'missing' : status,
        importance: 1 + ((pointIndex * 5 + clusterIndex * 3) % 18) / 2,
        label: `${label} · 证据片段 ${pointIndex + 1}`,
        metadata: {
          simulated: true,
          source: 'loopy-data-local-simulation',
          chunkIndex: pointIndex,
          embeddingModel: props.dashboard?.runtime.embeddingModel || 'dashscope-compatible-simulated',
        },
      })
    }
  })

  const totalNodes = clusters.reduce((sum, cluster) => sum + cluster.nodeCount, 0)
  const averageSimilarity = totalNodes > 0
    ? clusters.reduce((sum, cluster) => sum + (cluster.similarityScore * cluster.nodeCount), 0) / totalNodes
    : 0

  return {
    projectId: projectId || 'simulated-project',
    analytics: {
      ...createAnalyticsFallback(),
      semanticLayoutUpdatedAt: createAnalyticsFallback().semanticLayoutUpdatedAt || now,
    },
    layout: {
      id: 'simulated-layout',
      projectId: projectId || 'simulated-project',
      layoutType: 'chunk_space',
      algorithm: 'umap3d',
      pointCount: points.length,
      clusterCount: clusters.length,
      status: 'ready',
      metadata: {
        simulated: true,
        source: 'loopy-data-local-simulation',
      },
      createdAt: now,
      updatedAt: now,
    },
    summary: {
      clusterCount: clusters.length,
      pointCount: points.length,
      averageSimilarity: Number(averageSimilarity.toFixed(4)),
      maxSimilarity: clusters.reduce((max, cluster) => Math.max(max, cluster.similarityScore), 0),
    },
    clusters,
    points,
    selectionSummary: {
      totalPoints: points.length,
      returnedPoints: points.length,
      level: 'chunk',
      layoutType: 'chunk_space',
    },
  }
}

function clearActivePoint(): void {
  hoveredPointId.value = ''
  selectedPointId.value = ''
}

function handlePointSelect(pointId: string): void {
  selectedPointId.value = selectedPointId.value === pointId ? '' : pointId
  hoveredPointId.value = selectedPointId.value
}

const clusterIndexMap = computed(() => {
  return new Map((payload.value?.clusters || []).map((cluster, index) => [cluster.id, index + 1]))
})

const clusterMap = computed(() => {
  return new Map((payload.value?.clusters || []).map(cluster => [cluster.id, cluster]))
})

const bounds = computed(() => {
  const points = payload.value?.points || []
  if (points.length === 0) {
    return {
      centerX: 0,
      centerY: 0,
      centerZ: 0,
      range: 1,
    }
  }
  const valuesX = points.map(point => point.x)
  const valuesY = points.map(point => point.y)
  const valuesZ = points.map(point => point.z)
  const minX = Math.min(...valuesX)
  const maxX = Math.max(...valuesX)
  const minY = Math.min(...valuesY)
  const maxY = Math.max(...valuesY)
  const minZ = Math.min(...valuesZ)
  const maxZ = Math.max(...valuesZ)
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    centerZ: (minZ + maxZ) / 2,
    range: Math.max(1, maxX - minX, maxY - minY, maxZ - minZ),
  }
})

function toScenePosition(x: number, y: number, z: number): [number, number, number] {
  const scale = 18 / bounds.value.range
  return [
    (x - bounds.value.centerX) * scale,
    (y - bounds.value.centerY) * scale,
    (z - bounds.value.centerZ) * scale,
  ]
}

const clusterColorMap = computed(() => {
  const clusters = payload.value?.clusters || []
  return new Map(clusters.map((cluster, index) => [cluster.id, resolveClusterColor(index, clusters.length)]))
})

const scenePoints = computed<ScenePoint[]>(() => {
  return (payload.value?.points || []).map((point) => {
    const [sceneX, sceneY, sceneZ] = toScenePosition(point.x, point.y, point.z)
    return {
      ...point,
      sceneX,
      sceneY,
      sceneZ,
      radius: clampNumber(0.11 + (point.importance * 0.026), 0.12, 0.34),
      color: clusterColorMap.value.get(point.clusterId) || resolveClusterColor(0, 1),
    }
  })
})

const sceneClusters = computed<SceneCluster[]>(() => {
  const clusters = payload.value?.clusters || []
  return clusters.map((cluster, index) => {
    const [sceneX, sceneY, sceneZ] = toScenePosition(cluster.centroid.x, cluster.centroid.y, cluster.centroid.z)
    return {
      ...cluster,
      sceneX,
      sceneY,
      sceneZ,
      color: resolveClusterColor(index, clusters.length),
      radius: clampNumber(1.55 + Math.sqrt(cluster.nodeCount || 1) * 0.22, 2, 4.7),
    }
  })
})

const scenePointMap = computed(() => {
  return new Map(scenePoints.value.map(point => [point.id, point]))
})

const activeScenePoint = computed(() => {
  return scenePointMap.value.get(selectedPointId.value || hoveredPointId.value) || null
})

const activeCluster = computed(() => {
  if (!activeScenePoint.value)
    return null
  return clusterMap.value.get(activeScenePoint.value.clusterId) || null
})

const algorithmLabel = computed(() => resolveAlgorithmLabel(payload.value?.layout?.algorithm))

const embeddingDimensionLabel = computed(() => {
  const dimensions = Math.max(0, Math.round(Number(props.dashboard?.runtime.embeddingDimensions || 0)))
  return dimensions > 0 ? `${dimensions} 维` : '模拟维度'
})

const statusBreakdown = computed(() => {
  const counts = new Map<ProjectKnowledgeEmbeddingStatus, number>()
  for (const point of payload.value?.points || [])
    counts.set(point.embeddingStatus, (counts.get(point.embeddingStatus) || 0) + 1)
  return [
    { status: 'native' as const, label: 'Native', count: counts.get('native') || 0 },
    { status: 'derived' as const, label: 'Derived', count: counts.get('derived') || 0 },
    { status: 'fallback' as const, label: 'Fallback', count: counts.get('fallback') || 0 },
    { status: 'missing' as const, label: 'Missing', count: counts.get('missing') || 0 },
  ].filter(item => item.count > 0)
})

const metricCards = computed(() => {
  const summary = payload.value?.summary
  return [
    {
      label: '聚类数',
      value: (summary?.clusterCount || 0).toLocaleString('zh-CN'),
    },
    {
      label: '点数量',
      value: (summary?.pointCount || 0).toLocaleString('zh-CN'),
    },
    {
      label: '平均相似度',
      value: formatSimilarity(summary?.averageSimilarity || 0),
    },
    {
      label: '最大相似度',
      value: formatSimilarity(summary?.maxSimilarity || 0),
    },
  ]
})

function disposeObject(object: any): void {
  if (!object?.traverse)
    return
  object.traverse((child: any) => {
    if (child.geometry?.dispose)
      child.geometry.dispose()
    const material = child.material
    if (Array.isArray(material))
      material.forEach(item => item?.dispose?.())
    else if (material?.dispose)
      material.dispose()
  })
}

function clearSceneData(): void {
  if (!scene || !dataGroup)
    return
  scene.remove(dataGroup)
  disposeObject(dataGroup)
  dataGroup = null
  pointMeshes = []
  clusterMeshes = []
}

function resizeRenderer(): void {
  const host = sceneHost.value
  if (!host || !renderer || !camera)
    return
  const width = Math.max(320, host.clientWidth || 960)
  const height = Math.max(420, host.clientHeight || 620)
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

function buildSceneData(): void {
  if (!three || !scene)
    return

  clearSceneData()
  dataGroup = new three.Group()
  scene.add(dataGroup)

  const haloGeometry = new three.SphereGeometry(1, 36, 18)
  for (const cluster of sceneClusters.value) {
    const halo = new three.Mesh(
      haloGeometry,
      new three.MeshBasicMaterial({
        color: cluster.color,
        transparent: true,
        opacity: 0.12,
        wireframe: true,
        depthWrite: false,
      }),
    )
    halo.position.set(cluster.sceneX, cluster.sceneY, cluster.sceneZ)
    halo.scale.setScalar(cluster.radius)
    halo.userData = { clusterId: cluster.id }
    clusterMeshes.push(halo)
    dataGroup.add(halo)
  }

  const clusterPositionMap = new Map(sceneClusters.value.map(cluster => [cluster.id, cluster]))
  const linePositions: number[] = []
  scenePoints.value.slice(0, 360).forEach((point, index) => {
    if (index % 2 !== 0)
      return
    const cluster = clusterPositionMap.get(point.clusterId)
    if (!cluster)
      return
    linePositions.push(cluster.sceneX, cluster.sceneY, cluster.sceneZ, point.sceneX, point.sceneY, point.sceneZ)
  })
  if (linePositions.length > 0) {
    const lineGeometry = new three.BufferGeometry()
    lineGeometry.setAttribute('position', new three.BufferAttribute(new Float32Array(linePositions), 3))
    const lines = new three.LineSegments(
      lineGeometry,
      new three.LineBasicMaterial({
        color: '#7a8da8',
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }),
    )
    dataGroup.add(lines)
  }

  for (const point of scenePoints.value) {
    const material = new three.MeshStandardMaterial({
      color: point.color,
      emissive: point.color,
      emissiveIntensity: 0.18,
      roughness: 0.34,
      metalness: 0.12,
      transparent: true,
      opacity: resolvePointOpacity(point.embeddingStatus),
    })
    const mesh = new three.Mesh(new three.SphereGeometry(point.radius, 18, 14), material)
    mesh.position.set(point.sceneX, point.sceneY, point.sceneZ)
    mesh.userData = {
      pointId: point.id,
      clusterId: point.clusterId,
      baseOpacity: resolvePointOpacity(point.embeddingStatus),
    }
    pointMeshes.push(mesh)
    dataGroup.add(mesh)
  }

  updatePointFocus()
}

function updatePointFocus(): void {
  const activeId = selectedPointId.value || hoveredPointId.value
  for (const mesh of pointMeshes) {
    const pointId = String(mesh.userData?.pointId || '')
    const isActive = Boolean(activeId && pointId === activeId)
    const isMuted = Boolean(selectedPointId.value && pointId !== selectedPointId.value)
    mesh.scale.setScalar(isActive ? 1.85 : isMuted ? 0.82 : 1)
    if (mesh.material) {
      mesh.material.opacity = isActive
        ? 1
        : isMuted
          ? Math.max(0.16, Number(mesh.userData?.baseOpacity || 0.6) * 0.48)
          : Number(mesh.userData?.baseOpacity || 0.6)
    }
  }
}

function pickPoint(event: PointerEvent): string {
  if (!renderer || !camera || !raycaster || !pointer)
    return ''
  const rect = renderer.domElement.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0)
    return ''
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
  raycaster.setFromCamera(pointer, camera)
  const intersections = raycaster.intersectObjects(pointMeshes, false)
  return String(intersections[0]?.object?.userData?.pointId || '')
}

function handlePointerMove(event: PointerEvent): void {
  if (selectedPointId.value)
    return
  hoveredPointId.value = pickPoint(event)
}

function handlePointerLeave(): void {
  if (!selectedPointId.value)
    hoveredPointId.value = ''
}

function handleCanvasClick(event: PointerEvent): void {
  const pointId = pickPoint(event)
  if (pointId)
    handlePointSelect(pointId)
  else
    clearActivePoint()
}

function animateScene(): void {
  if (!renderer || !scene || !camera) {
    animationFrame = requestAnimationFrame(animateScene)
    return
  }

  const time = performance.now() * 0.001
  if (dataGroup && !selectedPointId.value)
    dataGroup.rotation.y += 0.0012
  clusterMeshes.forEach((mesh, index) => {
    mesh.scale.setScalar((sceneClusters.value[index]?.radius || 2) * (1 + Math.sin(time + index) * 0.025))
  })
  controls?.update?.()
  renderer.render(scene, camera)
  animationFrame = requestAnimationFrame(animateScene)
}

async function ensureThreeScene(): Promise<void> {
  const host = sceneHost.value
  if (!host || renderer)
    return

  const [threeModule, controlsModule] = await Promise.all([
    import('three'),
    import('three/examples/jsm/controls/OrbitControls.js'),
  ])
  three = threeModule as unknown as ThreeRuntime
  const OrbitControls = controlsModule.OrbitControls as any

  scene = new three.Scene()
  scene.background = new three.Color('#10151f')
  scene.fog = new three.Fog('#10151f', 24, 58)

  camera = new three.PerspectiveCamera(48, 1, 0.1, 120)
  camera.position.set(0, 8.2, 27)

  renderer = new three.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.domElement.className = 'loopy-embedding__canvas'
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.domElement.addEventListener('pointermove', handlePointerMove)
  renderer.domElement.addEventListener('pointerleave', handlePointerLeave)
  renderer.domElement.addEventListener('click', handleCanvasClick)
  host.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.07
  controls.minDistance = 10
  controls.maxDistance = 46
  controls.target?.set?.(0, 0, 0)

  raycaster = new three.Raycaster()
  pointer = new three.Vector2()

  scene.add(new three.AmbientLight('#b9c7dd', 1.6))
  const keyLight = new three.DirectionalLight('#ffffff', 2.2)
  keyLight.position.set(5, 9, 8)
  scene.add(keyLight)
  const rimLight = new three.DirectionalLight('#63e6be', 1.1)
  rimLight.position.set(-7, -2, -9)
  scene.add(rimLight)

  const grid = new three.GridHelper(30, 18, '#38516f', '#243247')
  grid.position.y = -5.6
  scene.add(grid)

  resizeObserver = new ResizeObserver(resizeRenderer)
  resizeObserver.observe(host)
  resizeRenderer()
  buildSceneData()
  rendererReady.value = true
  animateScene()
}

function destroyThreeScene(): void {
  if (animationFrame)
    cancelAnimationFrame(animationFrame)
  animationFrame = 0
  resizeObserver?.disconnect()
  resizeObserver = null
  clearSceneData()
  if (renderer?.domElement) {
    renderer.domElement.removeEventListener('pointermove', handlePointerMove)
    renderer.domElement.removeEventListener('pointerleave', handlePointerLeave)
    renderer.domElement.removeEventListener('click', handleCanvasClick)
    renderer.domElement.remove()
  }
  controls?.dispose?.()
  renderer?.dispose?.()
  renderer = null
  controls = null
  scene = null
  camera = null
  raycaster = null
  pointer = null
  three = null
  rendererReady.value = false
}

async function loadLayout(): Promise<void> {
  const projectId = String(props.projectId || '').trim()
  loading.value = true
  error.value = ''
  clearActivePoint()

  if (!projectId) {
    payload.value = buildSimulatedLayoutPayload('')
    loading.value = false
    return
  }

  try {
    const query = new URLSearchParams({
      layoutType: 'chunk_space',
      level: 'chunk',
    })
    const response = await unsafeFetch<ApiResponse<ProjectKnowledgeSemanticLayoutPayload>>(
      `${endpoint(`/projects/${projectId}/knowledge/semantic-layout`)}?${query.toString()}`,
    )
    const nextPayload = response.data || null
    if (nextPayload?.layout && (nextPayload.summary.pointCount || 0) > 0) {
      payload.value = nextPayload
      return
    }
    payload.value = buildSimulatedLayoutPayload(projectId)
  }
  catch {
    payload.value = buildSimulatedLayoutPayload(projectId)
  }
  finally {
    loading.value = false
  }
}

watch(() => [props.projectId, props.dashboard?.summary.lastRefreshedAt, props.dashboard?.analytics.semanticLayoutUpdatedAt], () => {
  void loadLayout()
}, { immediate: true })

watch(payload, () => {
  void nextTick(() => {
    buildSceneData()
  })
})

watch(() => [selectedPointId.value, hoveredPointId.value], () => {
  updatePointFocus()
})

onMounted(() => {
  void nextTick(async () => {
    await ensureThreeScene()
  })
})

onBeforeUnmount(() => {
  destroyThreeScene()
})
</script>

<template>
  <section class="loopy-embedding" data-testid="workspace-loopy-semantic-space">
    <header class="loopy-embedding__header">
      <div class="loopy-embedding__title-wrap">
        <div class="loopy-embedding__title-row">
          <h3>3D Embedding 语义空间</h3>
          <span class="material-symbols-outlined loopy-embedding__title-icon">hub</span>
        </div>
      </div>

      <div class="loopy-embedding__controls">
        <button type="button" class="loopy-embedding__control" disabled aria-disabled="true">
          <span>{{ algorithmLabel }}</span>
          <span class="material-symbols-outlined">deployed_code</span>
        </button>
        <button type="button" class="loopy-embedding__control" disabled aria-disabled="true">
          <span>{{ embeddingDimensionLabel }}</span>
          <span class="material-symbols-outlined">scatter_plot</span>
        </button>
      </div>
    </header>

    <div
      v-if="payload && payload.layout && payload.summary.pointCount > 0"
      class="loopy-embedding__meta"
    >
      <span>布局状态 {{ payload.layout.status === 'degraded' ? '轻度退化' : '已就绪' }}</span>
      <span>已显示 {{ payload.selectionSummary.returnedPoints.toLocaleString('zh-CN') }} / {{ payload.summary.pointCount.toLocaleString('zh-CN') }}</span>
      <span>最近刷新 {{ payload.layout.updatedAt || payload.analytics.semanticLayoutUpdatedAt || '-' }}</span>
      <span>Three.js OrbitControls</span>
    </div>

    <div v-if="loading && !payload" class="loopy-embedding__empty">
      正在加载 3D Embedding 语义空间...
    </div>
    <div v-else-if="error" class="loopy-embedding__empty loopy-embedding__empty--error">
      {{ error }}
    </div>
    <div
      v-else
      class="loopy-embedding__scene-shell"
      data-testid="workspace-loopy-semantic-space-chart"
      @click.self="clearActivePoint"
    >
      <div
        ref="sceneHost"
        class="loopy-embedding__scene-host"
        role="img"
        aria-label="Embedding 空间分布 3D 语义星图"
      />

      <div v-if="!rendererReady" class="loopy-embedding__scene-loading">
        正在初始化 3D 渲染...
      </div>

      <div class="loopy-embedding__legend">
        <article
          v-for="item in statusBreakdown"
          :key="item.status"
          class="loopy-embedding__legend-item"
          :data-status="item.status"
        >
          <span />
          <strong>{{ item.count.toLocaleString('zh-CN') }}</strong>
          <small>{{ item.label }}</small>
        </article>
      </div>

      <div
        v-if="activeCluster && activeScenePoint"
        class="loopy-embedding__tooltip"
        @click.stop
      >
        <div class="loopy-embedding__tooltip-kicker">
          Cluster #{{ clusterIndexMap.get(activeCluster.id) || 1 }}
        </div>
        <div class="loopy-embedding__tooltip-title">
          {{ activeCluster.topicLabel || activeCluster.label || '未分类主题' }}
        </div>
        <p>{{ activeScenePoint.label }}</p>

        <div class="loopy-embedding__tooltip-grid">
          <div class="loopy-embedding__tooltip-row">
            <span>数量</span>
            <strong>{{ activeCluster.nodeCount.toLocaleString('zh-CN') }}</strong>
          </div>
          <div class="loopy-embedding__tooltip-row">
            <span>密度</span>
            <strong>{{ resolveDensityLabel(activeCluster.densityScore) }}</strong>
          </div>
          <div class="loopy-embedding__tooltip-row">
            <span>相似度</span>
            <strong>{{ formatSimilarity(activeCluster.similarityScore) }}</strong>
          </div>
          <div class="loopy-embedding__tooltip-row">
            <span>Embedding</span>
            <strong>{{ activeScenePoint.embeddingStatus }}</strong>
          </div>
        </div>
      </div>
    </div>

    <div class="loopy-embedding__metrics">
      <article
        v-for="card in metricCards"
        :key="card.label"
        class="loopy-embedding__metric-card"
      >
        <strong>{{ card.value }}</strong>
        <span>{{ card.label }}</span>
      </article>
    </div>
  </section>
</template>

<style scoped>
.loopy-embedding {
  display: flex;
  flex-direction: column;
  gap: 16px;
  border: 1px solid #dce7f4;
  border-radius: 24px;
  background: #ffffff;
  padding: 18px;
  box-shadow: 0 14px 32px rgba(36, 73, 125, 0.06);
}

.loopy-embedding__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.loopy-embedding__title-wrap {
  min-width: 0;
}

.loopy-embedding__title-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.loopy-embedding__title-row h3 {
  margin: 0;
  color: #18283f;
  font-size: 28px;
  font-weight: 850;
  letter-spacing: 0;
}

.loopy-embedding__title-icon {
  color: #52657e;
  font-size: 20px;
}

.loopy-embedding__subtitle {
  max-width: 780px;
  margin: 10px 0 0;
  color: #607694;
  font-size: 13px;
  line-height: 1.7;
}

.loopy-embedding__controls {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.loopy-embedding__control {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-height: 40px;
  padding: 0 13px;
  border: 1px solid #dbe7f3;
  border-radius: 12px;
  background: #ffffff;
  color: #33506f;
  font-size: 12px;
  font-weight: 800;
  cursor: default;
}

.loopy-embedding__control[data-tone='success'] {
  border-color: #cfe9df;
  background: #f4fbf7;
  color: #0f7a51;
}

.loopy-embedding__control[data-tone='warning'] {
  border-color: #f0ddb6;
  background: #fff8eb;
  color: #986412;
}

.loopy-embedding__control .material-symbols-outlined {
  color: currentColor;
  font-size: 17px;
}

.loopy-embedding__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  color: #6d82a1;
  font-size: 12px;
}

.loopy-embedding__scene-shell,
.loopy-embedding__empty {
  position: relative;
  overflow: hidden;
  min-height: 620px;
  border: 1px solid #1e293b;
  border-radius: 22px;
  background: #10151f;
}

.loopy-embedding__scene-host {
  position: absolute;
  inset: 0;
}

.loopy-embedding__scene-host :deep(canvas),
.loopy-embedding__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.loopy-embedding__scene-loading,
.loopy-embedding__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #aebdd3;
  font-size: 13px;
}

.loopy-embedding__scene-loading {
  position: absolute;
  inset: 0;
  background: #10151f;
}

.loopy-embedding__empty--error {
  color: #fbbf24;
}

.loopy-embedding__legend {
  position: absolute;
  left: 16px;
  bottom: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: calc(100% - 32px);
  pointer-events: none;
}

.loopy-embedding__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(174, 190, 214, 0.2);
  border-radius: 999px;
  background: rgba(12, 18, 28, 0.72);
  color: #d7e1ef;
  font-size: 11px;
  backdrop-filter: blur(14px);
}

.loopy-embedding__legend-item span {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #4f7cff;
}

.loopy-embedding__legend-item[data-status='derived'] span {
  background: #14b8a6;
}

.loopy-embedding__legend-item[data-status='fallback'] span {
  background: #f59e0b;
}

.loopy-embedding__legend-item[data-status='missing'] span {
  background: #94a3b8;
}

.loopy-embedding__legend-item strong {
  color: #ffffff;
}

.loopy-embedding__legend-item small {
  color: #aebdd3;
  font-size: 11px;
  font-weight: 700;
}

.loopy-embedding__tooltip {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 3;
  width: min(320px, calc(100% - 32px));
  padding: 16px;
  border: 1px solid rgba(215, 225, 240, 0.2);
  border-radius: 18px;
  background: rgba(13, 19, 30, 0.84);
  color: #dce7f6;
  box-shadow: 0 22px 44px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(18px);
}

.loopy-embedding__tooltip-kicker {
  color: #8eb4ff;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.loopy-embedding__tooltip-title {
  margin-top: 6px;
  color: #ffffff;
  font-size: 18px;
  font-weight: 850;
}

.loopy-embedding__tooltip p {
  margin: 8px 0 0;
  color: #b9c7db;
  font-size: 12px;
  line-height: 1.55;
}

.loopy-embedding__tooltip-grid {
  margin-top: 14px;
  display: grid;
  gap: 8px;
}

.loopy-embedding__tooltip-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #95a6bc;
  font-size: 12px;
}

.loopy-embedding__tooltip-row strong {
  color: #f8fbff;
  font-size: 13px;
  font-weight: 800;
  text-align: right;
}

.loopy-embedding__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.loopy-embedding__metric-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 98px;
  padding: 16px;
  border: 1px solid #dce7f4;
  border-radius: 16px;
  background: #ffffff;
}

.loopy-embedding__metric-card strong {
  color: #1d304c;
  font-size: 34px;
  line-height: 1;
  letter-spacing: 0;
}

.loopy-embedding__metric-card span {
  color: #7085a3;
  font-size: 13px;
  font-weight: 750;
}

@media (max-width: 1200px) {
  .loopy-embedding__header {
    flex-direction: column;
  }

  .loopy-embedding__controls {
    width: 100%;
    justify-content: flex-start;
  }

  .loopy-embedding__control {
    flex: 1 1 0;
    justify-content: space-between;
  }

  .loopy-embedding__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .loopy-embedding {
    padding: 14px;
  }

  .loopy-embedding__title-row h3 {
    font-size: 24px;
  }

  .loopy-embedding__scene-shell,
  .loopy-embedding__empty {
    min-height: 460px;
  }

  .loopy-embedding__tooltip {
    left: 12px;
    right: 12px;
    top: 12px;
    width: auto;
  }

  .loopy-embedding__metric-card strong {
    font-size: 30px;
  }
}

@media (max-width: 560px) {
  .loopy-embedding__metrics {
    grid-template-columns: 1fr;
  }
}
</style>

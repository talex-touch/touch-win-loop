import type {
  ProjectOutlineNode,
  ProjectOutlineSnapshot,
  ProjectSettingsSnapshot,
  Resource,
} from '~~/shared/types/domain'

interface OutlineCandidate {
  title: string
  level: number
  resourceId: string
}

interface OutlineCluster {
  key: string
  title: string
  level: number
  candidates: OutlineCandidate[]
  resourceIds: Set<string>
}

interface BuildProjectOutlineInput {
  projectId: string
  resources: Resource[]
  context: ProjectOutlineSnapshot['context']
  projectSettings: ProjectSettingsSnapshot | null
  contestName?: string
  trackName?: string
  reason: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeTitle(value: string): string {
  return normalizeString(value)
    .replace(/^#{1,6}\s+/, '')
    .replace(/^第[一二三四五六七八九十百千\d]+[章节部分篇]\s*/, '')
    .replace(/^\d+(?:\.\d+){0,3}[、.．\s]+/, '')
    .replace(/^[一二三四五六七八九十]+[、.．\s]+/, '')
    .replace(/^[（(]?[一二三四五六七八九十\d]+[)）][、.．\s]*/, '')
    .replace(/^[-*•]\s+/, '')
    .replace(/[（(]\d+[)）]\s*$/g, '')
    .replace(/[：:;；，。,、]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleKey(value: string): string {
  return normalizeTitle(value)
    .toLowerCase()
    .replace(/[\s\-_/]+/g, '')
}

function splitKeywords(value: string): string[] {
  return normalizeString(value)
    .split(/[\s,，。.!！?？;；:：/\\|\-]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2)
}

function jaccardSimilarity(left: string, right: string): number {
  if (!left || !right)
    return 0
  const leftSet = new Set(left.split(''))
  const rightSet = new Set(right.split(''))
  const union = new Set([...leftSet, ...rightSet])
  if (union.size === 0)
    return 0
  let intersection = 0
  for (const item of leftSet) {
    if (rightSet.has(item))
      intersection += 1
  }
  return intersection / union.size
}

function shouldMergeCluster(leftKey: string, rightKey: string): boolean {
  if (!leftKey || !rightKey)
    return false
  if (leftKey === rightKey)
    return true
  if (leftKey.includes(rightKey) || rightKey.includes(leftKey))
    return true
  return jaccardSimilarity(leftKey, rightKey) >= 0.82
}

function isLikelyFileName(value: string): boolean {
  const normalized = normalizeString(value).toLowerCase()
  if (!normalized)
    return false

  return /\.(?:pdf|docx?|pptx?|xlsx?|csv|txt|md|rtf|zip)$/i.test(normalized)
    || /[\\/]/.test(normalized)
}

function shouldUseResourceTitleCandidate(resource: Resource, title: string): boolean {
  if (!title)
    return false
  if (title.length > 36)
    return false

  const rawTitle = normalizeString(resource.title)
  if (!rawTitle)
    return false
  if (isLikelyFileName(rawTitle))
    return false
  if (/[+_]{2,}|[-_+]{4,}/.test(rawTitle))
    return false
  if ((resource.source === 'upload' || resource.sourceType === 'upload') && title.length > 28)
    return false
  return true
}

function extractHeadingCandidates(resource: Resource): OutlineCandidate[] {
  const candidates: OutlineCandidate[] = []
  const resourceId = normalizeString(resource.id)
  const title = normalizeTitle(resource.title || '')

  if (resourceId && shouldUseResourceTitleCandidate(resource, title)) {
    candidates.push({
      title,
      level: 0,
      resourceId,
    })
  }

  const textSource = [resource.summary, resource.content]
    .map(item => normalizeString(item))
    .filter(Boolean)
    .join('\n')

  if (!textSource || !resourceId)
    return candidates

  const lines = textSource
    .split(/\r?\n+/)
    .map(line => normalizeString(line))
    .filter(Boolean)

  for (const line of lines) {
    if (line.length < 2 || line.length > 60)
      continue

    let level = -1
    if (/^#{1,6}\s+/.test(line))
      level = Math.max(0, Math.min(2, line.match(/^#+/)?.[0]?.length ? Number((line.match(/^#+/)?.[0]?.length || 1) - 1) : 0))
    else if (/^\d+(?:\.\d+){1,3}[、.．\s]+/.test(line))
      level = 1
    else if (/^[（(]?[一二三四五六七八九十\d]+[)）][、.．\s]*/.test(line))
      level = 1
    else if (/^[-*•]\s+/.test(line))
      level = 1
    else if (/^\d+[、.．\s]+/.test(line) || /^[一二三四五六七八九十]+[、.．\s]+/.test(line))
      level = 0

    if (level < 0)
      continue

    const normalized = normalizeTitle(line)
    if (!normalized)
      continue
    if (title && normalized === title)
      continue

    candidates.push({
      title: normalized,
      level,
      resourceId,
    })

    if (candidates.length >= 18)
      break
  }

  return candidates
}

function clusterCandidates(candidates: OutlineCandidate[]): OutlineCluster[] {
  const clusters: OutlineCluster[] = []

  for (const candidate of candidates) {
    const key = titleKey(candidate.title)
    if (!key)
      continue

    let hit: OutlineCluster | null = null
    for (const cluster of clusters) {
      if (shouldMergeCluster(cluster.key, key)) {
        hit = cluster
        break
      }
    }

    if (!hit) {
      clusters.push({
        key,
        title: candidate.title,
        level: candidate.level,
        candidates: [candidate],
        resourceIds: new Set([candidate.resourceId]),
      })
      continue
    }

    hit.candidates.push(candidate)
    hit.resourceIds.add(candidate.resourceId)
    hit.level = Math.min(hit.level, candidate.level)

    if (candidate.title.length < hit.title.length)
      hit.title = candidate.title
  }

  return clusters
}

function buildConfigKeywords(input: BuildProjectOutlineInput): string[] {
  const textParts: string[] = [
    input.context.major,
    input.context.discipline,
    input.context.level,
    input.context.trackType,
    input.contestName || '',
    input.trackName || '',
    input.projectSettings?.project?.title || '',
    input.projectSettings?.project?.summary || '',
    input.projectSettings?.project?.problemStatement || '',
    ...(input.projectSettings?.project?.innovationPoints || []),
    ...(input.projectSettings?.project?.techRouteSteps || []),
    ...(input.projectSettings?.project?.scoringMapping || []),
    ...(input.projectSettings?.project?.risks || []),
    ...(input.projectSettings?.project?.deliverables || []),
    input.projectSettings?.currentAdaptation?.summary || '',
    input.projectSettings?.currentAdaptation?.problemStatement || '',
    ...(input.projectSettings?.currentAdaptation?.innovationPoints || []),
    ...(input.projectSettings?.currentAdaptation?.techRouteSteps || []),
  ]

  const keywords = new Set<string>()
  for (const part of textParts) {
    for (const keyword of splitKeywords(part)) {
      keywords.add(keyword.toLowerCase())
      if (keywords.size >= 24)
        return [...keywords]
    }
  }

  return [...keywords]
}

function calcConfigMatchScore(title: string, keywords: string[]): number {
  if (keywords.length === 0)
    return 0.5

  const target = title.toLowerCase()
  let hit = 0
  for (const keyword of keywords) {
    if (!keyword)
      continue
    if (target.includes(keyword))
      hit += 1
  }

  const ratio = hit / keywords.length
  return Math.max(0, Math.min(1, ratio))
}

function calcContestAdaptationScore(title: string, contestName: string, trackName: string): number {
  const tokens = [...splitKeywords(contestName), ...splitKeywords(trackName)].map(item => item.toLowerCase())
  if (tokens.length === 0)
    return 0.6

  const target = title.toLowerCase()
  const hasHit = tokens.some(token => target.includes(token))
  return hasHit ? 1 : 0.4
}

function toFallbackNodes(input: BuildProjectOutlineInput): ProjectOutlineNode[] {
  const baseResourceIds = input.resources.slice(0, 10).map(item => item.id)
  const draft: Array<{ title: string, when: boolean }> = [
    { title: '项目背景与目标', when: Boolean(input.projectSettings?.project?.summary) },
    { title: '核心问题与需求定义', when: Boolean(input.projectSettings?.project?.problemStatement) },
    { title: '创新点与方案设计', when: (input.projectSettings?.project?.innovationPoints || []).length > 0 },
    { title: '技术路线与实现路径', when: (input.projectSettings?.project?.techRouteSteps || []).length > 0 },
    { title: '评审指标映射', when: (input.projectSettings?.project?.scoringMapping || []).length > 0 },
    { title: '风险识别与应对', when: (input.projectSettings?.project?.risks || []).length > 0 },
    { title: '交付清单与里程碑', when: (input.projectSettings?.project?.deliverables || []).length > 0 },
  ]

  const picked = draft.filter(item => item.when)
  const defaults = picked.length > 0
    ? picked
    : draft.slice(0, 6)

  return defaults.map((item, index) => ({
    id: `outline-${index + 1}`,
    title: item.title,
    level: 0,
    order: index + 1,
    sourceResourceIds: baseResourceIds,
    confidence: item.when ? 0.58 : 0.4,
    children: [],
  }))
}

export function buildProjectOutline(input: BuildProjectOutlineInput): ProjectOutlineSnapshot {
  const generatedAt = new Date().toISOString()
  const totalResources = Math.max(1, input.resources.length)
  const configKeywords = buildConfigKeywords(input)

  const allCandidates = input.resources.flatMap(resource => extractHeadingCandidates(resource))
  const clustered = clusterCandidates(allCandidates)

  const topClusters = clustered
    .map((cluster) => {
      const coverage = cluster.resourceIds.size / totalResources
      const configScore = calcConfigMatchScore(cluster.title, configKeywords)
      const contestScore = calcContestAdaptationScore(cluster.title, input.contestName || '', input.trackName || '')
      const confidence = Number((0.45 * coverage + 0.35 * configScore + 0.2 * contestScore).toFixed(3))

      return {
        ...cluster,
        coverage,
        configScore,
        contestScore,
        confidence,
      }
    })
    .filter((cluster) => {
      if (cluster.title.length < 2)
        return false
      const hasStructuralSignal = cluster.candidates.some(candidate => candidate.level > 0)
      if (!hasStructuralSignal && cluster.title.length > 24)
        return false
      return true
    })
    .sort((left, right) => {
      if (right.confidence !== left.confidence)
        return right.confidence - left.confidence
      if (right.resourceIds.size !== left.resourceIds.size)
        return right.resourceIds.size - left.resourceIds.size
      return left.title.localeCompare(right.title)
    })
    .slice(0, 8)

  const items = topClusters.map((cluster, index) => {
    const childCandidates = cluster.candidates.filter(candidate => candidate.level > 0)
    const childClusters = clusterCandidates(childCandidates)
      .map((child, childIndex) => ({
        id: `outline-${index + 1}-${childIndex + 1}`,
        title: child.title,
        level: 1,
        order: childIndex + 1,
        sourceResourceIds: [...child.resourceIds],
        confidence: Number((cluster.confidence * 0.9).toFixed(3)),
        children: [] as ProjectOutlineNode[],
      }))
      .sort((left, right) => {
        if (right.sourceResourceIds.length !== left.sourceResourceIds.length)
          return right.sourceResourceIds.length - left.sourceResourceIds.length
        return left.title.localeCompare(right.title)
      })
      .slice(0, 3)

    return {
      id: `outline-${index + 1}`,
      title: cluster.title,
      level: 0,
      order: index + 1,
      sourceResourceIds: [...cluster.resourceIds],
      confidence: cluster.confidence,
      children: childClusters,
    } satisfies ProjectOutlineNode
  })

  const finalItems = items.length > 0 ? items : toFallbackNodes(input)

  return {
    projectId: input.projectId,
    context: {
      contestId: normalizeString(input.context.contestId),
      trackId: normalizeString(input.context.trackId),
      major: normalizeString(input.context.major),
      discipline: normalizeString(input.context.discipline),
      level: normalizeString(input.context.level),
      trackType: normalizeString(input.context.trackType),
    },
    items: finalItems,
    generatedAt,
    reason: normalizeString(input.reason) || 'manual_generate',
  }
}

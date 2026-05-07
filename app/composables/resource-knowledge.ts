import type {
  Resource,
  ResourceAvailability,
  ResourceCategory,
  ResourceRelation,
  ResourceSearchSort,
} from '~~/shared/types/domain'
import { useState } from '#imports'
import { computed } from 'vue'

const RESOURCE_KNOWLEDGE_SESSION_STORAGE_KEY = 'wl-resource-knowledge-session-id'
const RESOURCE_KNOWLEDGE_SESSION_COOKIE_KEY = 'wl_resource_session'
const RESOURCE_KNOWLEDGE_SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

export const resourceCategoryOptions: Array<{ value: ResourceCategory | '', label: string }> = [
  { value: '', label: '全部分类' },
  { value: 'basic_info', label: '基本信息' },
  { value: 'timeline', label: '时间轴' },
  { value: 'tracks', label: '赛道设置' },
  { value: 'scoring', label: '评分标准' },
  { value: 'past_questions', label: '往届真题' },
  { value: 'awarded_works', label: '获奖作品' },
  { value: 'templates', label: '模板资料' },
  { value: 'faq', label: 'FAQ' },
  { value: 'judge_guidelines', label: '评委细则' },
  { value: 'track_details', label: '赛道详解' },
  { value: 'ai_prompts', label: 'AI 提示词' },
  { value: 'submission_examples', label: '材料示例' },
  { value: 'policy_notice', label: '政策通知' },
  { value: 'compliance', label: '合规版权' },
]

export const resourceAvailabilityOptions: Array<{ value: ResourceAvailability | '', label: string }> = [
  { value: '', label: '全部可访问性' },
  { value: 'public', label: '公开' },
  { value: 'login_required', label: '需登录' },
  { value: 'unavailable', label: '不可用' },
]

export const resourceSortOptions: Array<{ value: ResourceSearchSort, label: string }> = [
  { value: 'relevance', label: '综合相关' },
  { value: 'quality', label: '质量优先' },
  { value: 'value', label: '价值优先' },
  { value: 'hot', label: '热度优先' },
]

export const resourceAvailabilityLabelMap: Record<ResourceAvailability, string> = {
  public: '公开',
  login_required: '需登录',
  unavailable: '不可用',
}

export const resourceRelationTypeLabelMap: Record<ResourceRelation['relationType'], string> = {
  recommended: '推荐阅读',
  similar: '相似资料',
  duplicate: '疑似重复',
  complementary: '互补资料',
}

export function resolveResourceRelationTypeLabel(type: ResourceRelation['relationType'] | undefined): string {
  return type ? resourceRelationTypeLabelMap[type] || type : '推荐资料'
}

export function useResourceCategoryLabelMap() {
  return computed(() => {
    const map = new Map<ResourceCategory, string>()
    for (const item of resourceCategoryOptions) {
      if (item.value)
        map.set(item.value, item.label)
    }
    return map
  })
}

export function collectResourceTags(resources: Resource[]): string[] {
  return [...new Set(
    resources.flatMap(item => item.aiProfile?.aiTags || []).map(item => String(item || '').trim()).filter(Boolean),
  )].slice(0, 30)
}

export function useResourceKnowledgeSessionId() {
  const sessionId = useState<string>('resource-knowledge-session-id', () => '')
  if (import.meta.client && !sessionId.value) {
    const stored = window.localStorage.getItem(RESOURCE_KNOWLEDGE_SESSION_STORAGE_KEY)
    const nextSessionId = stored
      || window.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(16).slice(2)}`
    window.localStorage.setItem(RESOURCE_KNOWLEDGE_SESSION_STORAGE_KEY, nextSessionId)
    document.cookie = `${RESOURCE_KNOWLEDGE_SESSION_COOKIE_KEY}=${encodeURIComponent(nextSessionId)}; Path=/; Max-Age=${RESOURCE_KNOWLEDGE_SESSION_COOKIE_MAX_AGE}; SameSite=Lax`
    sessionId.value = nextSessionId
  }
  return sessionId
}

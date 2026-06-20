import type {
  ResourceAvailability,
  ResourceCategory,
  ResourceStatus,
} from '~~/shared/types/domain'

export interface AdminResourceCategoryOption {
  value: ResourceCategory
  label: string
}

export const adminResourceCategoryOptions: AdminResourceCategoryOption[] = [
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
  { value: 'compliance', label: '合规与版权' },
]

const resourceAvailabilitySet = new Set<ResourceAvailability>(['public', 'login_required', 'unavailable'])
const resourceStatusSet = new Set<ResourceStatus>(['active', 'pending_verify', 'invalid', 'archived'])
const resourceCategorySet = new Set<ResourceCategory>(adminResourceCategoryOptions.map(item => item.value))

export function isAdminResourceCategory(value: string): value is ResourceCategory {
  return resourceCategorySet.has(value as ResourceCategory)
}

export function isAdminResourceAvailability(value: string): value is ResourceAvailability {
  return resourceAvailabilitySet.has(value as ResourceAvailability)
}

export function isAdminResourceStatus(value: string): value is ResourceStatus {
  return resourceStatusSet.has(value as ResourceStatus)
}

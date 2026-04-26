import type { FeishuBitableSyncItemEntityType } from '../types/domain'

export interface FeishuBitableFieldCandidate {
  fieldName?: string
}

export interface FeishuBitableFieldGuessInput {
  entityType: FeishuBitableSyncItemEntityType
  targetKey: string
  fields: Array<string | FeishuBitableFieldCandidate>
}

const COMMON_TARGET_ALIASES: Record<string, string[]> = {
  externalId: ['externalId', 'external_id', 'externalid', 'id', 'record_id', '业务id', '外部id', '外部编号', '唯一标识', '编号', '主键'],
  contestExternalId: ['contestExternalId', 'contest_external_id', 'contestid', '对应竞赛', '对应赛事', '关联竞赛', '关联赛事', '所属竞赛', '所属赛事', '竞赛编号', '赛事编号', '竞赛id', '赛事id', '所属竞赛编号', '所属赛事编号'],
  trackExternalId: ['trackExternalId', 'track_external_id', 'trackid', '对应赛道', '关联赛道', '所属赛道', '赛道编号', '赛道id', '所属赛道编号'],
  name: ['name', '名称', '名字'],
  title: ['title', '标题', '名称'],
  summary: ['summary', '简介', '描述', '说明', '概述'],
  officialUrl: ['officialUrl', 'official_url', '官网', '官网链接', '赛事链接', '竞赛链接', '报名链接', 'url'],
  disciplines: ['disciplines', '学科', '专业', '所属学科', '学科门类'],
  keywords: ['keywords', '关键字', '关键词', '标签'],
  timelineText: ['timelineText', 'timeline_text', '时间节点', '时间线', '日程', '时间安排'],
  recommendedFor: ['recommendedFor', 'recommended_for', '适配人群', '适合人群', '面向人群', '推荐人群'],
  coverImageUrl: ['coverImageUrl', 'cover_image_url', '封面', '封面图', '封面图片', '图片链接'],
  location: ['location', '位置', '具体位置', '地点', '赛道位置'],
  organizer: ['organizer', '主办方', '主办单位', '主办'],
  coOrganizer: ['coOrganizer', 'co_organizer', '协办/承办', '承办/协办', '协办方', '协办单位', '承办单位'],
  undertaker: ['undertaker', '承办方', '承办单位', '承办'],
  participantRequirements: ['participantRequirements', 'participant_requirements', '参赛对象', '适用对象', '参赛要求'],
  teamRule: ['teamRule', 'team_rule', '组队规则', '组队要求'],
  currentSeason: ['currentSeason', 'current_season', '届次', '当前届次', '赛季', '当前赛季'],
  awardRatio: ['awardRatio', 'award_ratio', '获奖比例'],
  suitableMajors: ['suitableMajors', '适合专业', '适用专业', '推荐专业', '相关专业'],
  deliverableTypes: ['deliverableTypes', '交付物', '成果类型', '提交物', '提交内容'],
  evidenceRequirements: ['evidenceRequirements', 'evidence_requirements', '必备项', '必备材料', '必须项'],
  scoringPoints: ['scoringPoints', 'scoring_points', '加分项', '亮点', '加分点'],
  deductionItems: ['deductionItems', 'deduction_items', '扣分项', '风险项', '减分项'],
  nodeType: ['nodeType', 'node_type', '节点类型', '阶段类型'],
  startAt: ['startAt', 'start_at', '开始时间', '开始日期'],
  endAt: ['endAt', 'end_at', '结束时间', '结束日期', '截止时间'],
  note: ['note', '备注', '说明'],
  sourceLink: ['sourceLink', 'source_link', '来源链接', '来源地址'],
  category: ['category', '分类', '资料分类', '资料类别'],
  attachment: ['attachment', '附件', '附件链接', '资料附件', '资源附件', '下载链接', '材料链接', '文件链接'],
  attachmentSummary: ['attachmentSummary', 'attachment_summary', '附件摘要', '摘要', '资料摘要'],
  year: ['year', '年份', '年度'],
  meetingName: ['meetingName', 'meeting_name', '会议名称', '大会名称', '政策名称'],
  conferenceDate: ['conferenceDate', 'conference_date', '大会日期', '会议日期', '发布时间'],
  importance: ['importance', '重要程度', '重要级别', '优先级'],
  officialMaterial: ['officialMaterial', 'official_material', '官网资料', '官方资料'],
  officialMaterialLink: ['officialMaterialLink', 'official_material_link', '官网资料链接', '官网链接', '官方资料链接'],
  wechatMaterial: ['wechatMaterial', 'wechat_material', '微信公众号资料', '公众号资料'],
  wechatMaterialLink: ['wechatMaterialLink', 'wechat_material_link', '微信公众号链接', '公众号链接'],
  weiboMaterial: ['weiboMaterial', 'weibo_material', '微博资料'],
  weiboMaterialLink: ['weiboMaterialLink', 'weibo_material_link', '微博资料链接', '微博链接'],
  douyinMaterial: ['douyinMaterial', 'douyin_material', '抖音资料'],
  douyinMaterialLink: ['douyinMaterialLink', 'douyin_material_link', '抖音资料链接', '抖音链接'],
  xiaohongshuMaterial: ['xiaohongshuMaterial', 'xiaohongshu_material', '小红书资料'],
  xiaohongshuMaterialLink: ['xiaohongshuMaterialLink', 'xiaohongshu_material_link', '小红书资料链接', '小红书链接'],
  object: ['object', '对象', '答辩对象', '适用对象', '目标对象', '比赛对象', '竞赛对象', '名人对象', '人设对象'],
  persona1: ['persona1', 'persona_1', '人设1', '人设一', 'prompt1', 'prompt_1', '提示词1', '提示词一'],
  persona2: ['persona2', 'persona_2', '人设2', '人设二', 'prompt2', 'prompt_2', '提示词2', '提示词二'],
  persona3: ['persona3', 'persona_3', '人设3', '人设三', 'prompt3', 'prompt_3', '提示词3', '提示词三'],
  persona4: ['persona4', 'persona_4', '人设4', '人设四', 'prompt4', 'prompt_4', '提示词4', '提示词四'],
  persona5: ['persona5', 'persona_5', '人设5', '人设五', 'prompt5', 'prompt_5', '提示词5', '提示词五'],
}

const ENTITY_TARGET_ALIASES: Partial<Record<FeishuBitableSyncItemEntityType, Record<string, string[]>>> = {
  contest: {
    externalId: ['竞赛编号', '赛事编号'],
    name: ['竞赛名称', '赛事名称'],
    summary: ['竞赛简介', '赛事简介'],
  },
  track: {
    externalId: ['赛道编号'],
    name: ['赛道名称'],
    summary: ['赛道简介'],
  },
  resource: {
    title: ['资料标题', '资源标题', '材料标题'],
    attachment: ['资料附件', '资源附件', '资料链接', '资源链接'],
  },
  policy: {
    externalId: ['会议编号', '大会编号', '政策编号'],
    meetingName: ['会议名称', '大会名称'],
    summary: ['大会简介', '会议简介', '政策摘要'],
  },
  persona: {
    externalId: ['人设编号', '评委编号'],
    object: ['对象', '答辩对象', '评委对象'],
  },
}

const FULLWIDTH_OFFSET = 0xFEE0
const CHINESE_DIGITS: Record<string, string> = {
  零: '0',
  〇: '0',
  一: '1',
  壹: '1',
  二: '2',
  贰: '2',
  两: '2',
  三: '3',
  叁: '3',
  四: '4',
  肆: '4',
  五: '5',
  伍: '5',
  六: '6',
  陆: '6',
  七: '7',
  柒: '7',
  八: '8',
  捌: '8',
  九: '9',
  玖: '9',
}

function toHalfwidth(raw: string): string {
  return raw.replace(/[\uFF01-\uFF5E]/g, (char) => {
    const code = char.charCodeAt(0)
    return String.fromCharCode(code - FULLWIDTH_OFFSET)
  })
}

export function normalizeFeishuBitableFieldGuessKey(raw: unknown): string {
  return toHalfwidth(String(raw || ''))
    .replace(/[零〇一壹二贰两三叁四肆五伍六陆七柒八捌九玖]/g, char => CHINESE_DIGITS[char] || char)
    .trim()
    .toLowerCase()
    .replace(/[\s_\-—–－·,，.。;；:：/／\\|（）()【】[\]{}"'“”‘’<>《》]+/g, '')
}

function collectAliases(entityType: FeishuBitableSyncItemEntityType, targetKey: string): string[] {
  return [
    targetKey,
    ...(COMMON_TARGET_ALIASES[targetKey] || []),
    ...(ENTITY_TARGET_ALIASES[entityType]?.[targetKey] || []),
  ]
}

function extractFieldName(field: string | FeishuBitableFieldCandidate): string {
  if (typeof field === 'string')
    return field.trim()
  return String(field.fieldName || '').trim()
}

export function guessFeishuBitableFieldName(input: FeishuBitableFieldGuessInput): string {
  const candidates = input.fields
    .map(field => extractFieldName(field))
    .filter(Boolean)
  if (!candidates.length)
    return ''

  const aliases = collectAliases(input.entityType, input.targetKey)
    .map(alias => normalizeFeishuBitableFieldGuessKey(alias))
    .filter(Boolean)
  if (!aliases.length)
    return ''

  const normalizedCandidates = candidates.map(fieldName => ({
    fieldName,
    normalized: normalizeFeishuBitableFieldGuessKey(fieldName),
  }))

  const exact = normalizedCandidates.find(item => aliases.includes(item.normalized))
  if (exact)
    return exact.fieldName

  const fuzzy = normalizedCandidates.find((item) => {
    if (!item.normalized)
      return false
    return aliases.some((alias) => {
      if (alias.length < 2 || item.normalized.length < 2)
        return false
      return item.normalized.includes(alias) || alias.includes(item.normalized)
    })
  })

  return fuzzy?.fieldName || ''
}

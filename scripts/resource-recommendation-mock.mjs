#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'
import { Pool } from 'pg'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = resolve(__dirname, '..')

const jiti = createJiti(import.meta.url, {
  alias: {
    '~~': rootDir,
  },
})

const { loadWinloopEnv } = jiti(resolve(rootDir, 'config/env.ts'))
loadWinloopEnv(rootDir, process.env.NODE_ENV)

const MOCK_SOURCE = 'resource-recommendation-mock'
const MOCK_PROFILE_VERSION = 'mock-v1'
const MOCK_METADATA = { mock: true, source: MOCK_SOURCE }
const relationTypes = ['recommended', 'similar', 'complementary', 'duplicate']
const action = String(process.argv[2] || 'help').trim().toLowerCase()
const pgUrl = String(process.env.WINLOOP_PG_URL || '').trim()

const tagsByCategory = {
  basic_info: ['赛事介绍', '报名规则', '参赛条件', '组织信息'],
  timeline: ['赛程安排', '报名截止', '评审节点', '提交时间'],
  tracks: ['赛道方向', '选题范围', '跨学科', '项目定位'],
  scoring: ['评分标准', '评审维度', '创新性', '落地价值'],
  past_questions: ['历年真题', '命题趋势', '案例拆解', '训练题'],
  awarded_works: ['获奖作品', '作品案例', '路演材料', '成果展示'],
  templates: ['申报模板', '答辩模板', '材料清单', '格式规范'],
  faq: ['FAQ', '常见问题', '版权声明', '素材规范'],
  judge_guidelines: ['评审流程', '评委视角', '打分要点', '校级赛事'],
  track_details: ['赛道详解', '推荐方向', '技术路线', '商业模式'],
  ai_prompts: ['AI 提示词', '资料整理', '创意生成', '内容校验'],
  submission_examples: ['提交样例', '申报书示例', '附件规范', '项目摘要'],
  policy_notice: ['政策通知', '官方公告', '参赛规范', '资格审核'],
  compliance: ['合规要求', '版权声明', '素材授权', '隐私安全'],
}

const majorTagPool = ['数字媒体', '视觉传达', '计算机', '人工智能', '产品设计', '新闻传播', '经管', '电子信息']
const stageTagPool = ['报名准备', '选题策划', '作品制作', '材料提交', '答辩评审', '赛后复盘']

function printUsage() {
  console.log('用法：node scripts/resource-recommendation-mock.mjs <status|seed|clean>')
}

function assertPgUrl() {
  if (pgUrl)
    return
  console.error('缺少 WINLOOP_PG_URL，无法执行。请先在 .env.local/.env.dev 中配置数据库连接。')
  process.exit(1)
}

function assertMutableActionAllowed() {
  const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase()
  const explicitAllow = String(process.env.WINLOOP_ALLOW_RESOURCE_RECOMMENDATION_MOCK || '').trim() === '1'
  if (nodeEnv === 'production' && !explicitAllow) {
    console.error('当前 NODE_ENV=production，已拒绝写入 mock 推荐数据。')
    console.error('如确认是受控环境，请显式设置 WINLOOP_ALLOW_RESOURCE_RECOMMENDATION_MOCK=1 后再执行。')
    process.exit(1)
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function sample(items) {
  if (items.length === 0)
    return ''
  return items[randomInt(0, items.length - 1)]
}

function shuffled(items) {
  return [...items].sort(() => Math.random() - 0.5)
}

function unique(items) {
  return [...new Set(items.filter(Boolean))]
}

function shortTitle(value) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim()
  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))))
}

function buildProfile(resource) {
  const categoryTags = tagsByCategory[resource.category] || ['资料检索', '竞赛知识']
  const aiTags = unique([
    ...shuffled(categoryTags).slice(0, 3),
    sample(majorTagPool),
    sample(stageTagPool),
  ]).slice(0, 5)

  const majorTags = unique(shuffled(majorTagPool).slice(0, randomInt(1, 3)))
  const stageTags = unique(shuffled(stageTagPool).slice(0, randomInt(1, 3)))
  const qualityScore = randomInt(58, 92)
  const valueScore = randomInt(55, 95)
  const hotScore = randomInt(32, 88)

  return {
    resourceId: resource.id,
    contestId: resource.contest_id,
    predictedCategory: resource.category,
    categoryConfidence: randomInt(68, 94) / 100,
    aiTags,
    majorTags,
    stageTags,
    qualityScore,
    valueScore,
    hotScore,
    qualityIssues: [],
    governanceStatus: qualityScore >= 70 ? 'healthy' : 'review',
    componentScores: {
      metadata: randomInt(62, 94),
      content: qualityScore,
      source: randomInt(58, 90),
    },
    analysisPayload: {
      mock: true,
      source: MOCK_SOURCE,
      contestName: resource.contest_name,
    },
  }
}

function buildReason(type, source, target) {
  const sourceTitle = shortTitle(source.title)
  const targetTitle = shortTitle(target.title)
  const templates = {
    recommended: [
      `与「${sourceTitle}」在主题标签和资料热度上存在较强相关性。`,
      `可作为「${sourceTitle}」的延伸阅读，补足同一备赛场景下的资料链路。`,
      `适合在阅读「${sourceTitle}」后继续查看，帮助快速串联关键信息。`,
    ],
    similar: [
      `与「${sourceTitle}」同属相近资料分类，适合对照理解。`,
      `两份资料覆盖相近主题，可用于交叉核对规则和要求。`,
      `与「${targetTitle}」标签重叠较高，适合并列阅读。`,
    ],
    complementary: [
      `同属备赛链路但侧重点不同，可作为当前资料的互补背景。`,
      `适用于相同参赛阶段，能补充当前资料未覆盖的执行细节。`,
      `可从不同分类补足材料准备、评审或提交环节的信息缺口。`,
    ],
    duplicate: [
      `疑似同主题不同年份版本，建议核对发布日期和适用范围。`,
      `标题或用途接近，可能是同一资料的更新版或镜像版本。`,
      `与当前资料高度相近，适合检查是否存在重复归档。`,
    ],
  }
  return sample(templates[type] || templates.recommended)
}

function buildWeight(type, source, target) {
  const sameCategoryBoost = source.category === target.category ? 6 : 0
  const yearGap = Math.abs(Number(source.year || 0) - Number(target.year || 0))
  const yearBoost = yearGap <= 1 ? 5 : yearGap <= 3 ? 2 : 0
  const ranges = {
    duplicate: [84, 96],
    similar: [68, 90],
    complementary: [56, 78],
    recommended: [48, 74],
  }
  const [min, max] = ranges[type] || ranges.recommended
  return clampScore(randomInt(min, max) + sameCategoryBoost + yearBoost)
}

function pickTarget(source, candidates, usedTargetIds, type) {
  const scoped = candidates.filter((target) => {
    if (target.id === source.id)
      return false
    if (type === 'similar' || type === 'duplicate')
      return target.category === source.category
    if (type === 'complementary')
      return target.category !== source.category
    return true
  })
  const preferred = scoped.filter(target => !usedTargetIds.has(target.id))
  return sample(shuffled(preferred.length > 0 ? preferred : scoped.length > 0 ? scoped : candidates.filter(target => target.id !== source.id)))
}

function buildRelations(resources) {
  const relations = []
  const relationKeys = new Set()
  const resourcesByContest = new Map()

  for (const resource of resources) {
    const current = resourcesByContest.get(resource.contest_id) || []
    current.push(resource)
    resourcesByContest.set(resource.contest_id, current)
  }

  for (const contestResources of resourcesByContest.values()) {
    if (contestResources.length < 2)
      continue

    for (const source of contestResources) {
      const relationCount = Math.min(randomInt(2, 4), contestResources.length - 1)
      const usedTargetIds = new Set()
      const types = shuffled(relationTypes).slice(0, relationCount)

      for (const type of types) {
        const target = pickTarget(source, contestResources, usedTargetIds, type)
        if (!target)
          continue

        usedTargetIds.add(target.id)
        const key = `${source.id}:${target.id}:${type}`
        if (relationKeys.has(key))
          continue

        relationKeys.add(key)
        relations.push({
          id: `mock:${source.id}:${target.id}:${type}`,
          contestId: source.contest_id,
          sourceResourceId: source.id,
          targetResourceId: target.id,
          relationType: type,
          weight: buildWeight(type, source, target),
          reason: buildReason(type, source, target),
        })
      }
    }
  }

  return relations
}

async function listActiveResources(client) {
  const result = await client.query(
    `SELECT
       r.id,
       r.contest_id,
       r.category,
       r.title,
       r.year,
       r.summary,
       r.content,
       c.name AS contest_name
     FROM contest_resources r
     JOIN contests c ON c.id = r.contest_id
     WHERE r.status = 'active'
     ORDER BY r.contest_id ASC, r.year DESC, r.updated_at DESC, r.title ASC`,
  )
  return result.rows
}

async function cleanMockRelations(client) {
  const result = await client.query(
    `DELETE FROM contest_resource_relations
     WHERE metadata @> $1::JSONB`,
    [JSON.stringify(MOCK_METADATA)],
  )
  return Number(result.rowCount || 0)
}

async function upsertMockProfiles(client, resources) {
  let changed = 0
  for (const resource of resources) {
    const profile = buildProfile(resource)
    const result = await client.query(
      `INSERT INTO contest_resource_profiles (
        resource_id,
        contest_id,
        predicted_category,
        category_confidence,
        ai_tags,
        major_tags,
        stage_tags,
        quality_score,
        value_score,
        hot_score,
        quality_issues,
        governance_status,
        analysis_version,
        manual_overrides,
        component_scores,
        analysis_payload,
        last_analyzed_at,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5::TEXT[], $6::TEXT[], $7::TEXT[], $8, $9, $10,
        $11::JSONB, $12, $13, '{}'::JSONB, $14::JSONB, $15::JSONB, NOW(), NOW(), NOW()
      )
      ON CONFLICT (resource_id) DO UPDATE SET
        contest_id = EXCLUDED.contest_id,
        predicted_category = EXCLUDED.predicted_category,
        category_confidence = EXCLUDED.category_confidence,
        ai_tags = EXCLUDED.ai_tags,
        major_tags = EXCLUDED.major_tags,
        stage_tags = EXCLUDED.stage_tags,
        quality_score = EXCLUDED.quality_score,
        value_score = EXCLUDED.value_score,
        hot_score = EXCLUDED.hot_score,
        quality_issues = EXCLUDED.quality_issues,
        governance_status = EXCLUDED.governance_status,
        component_scores = EXCLUDED.component_scores,
        analysis_payload = EXCLUDED.analysis_payload,
        last_analyzed_at = NOW(),
        updated_at = NOW()
      WHERE contest_resource_profiles.analysis_version = $13`,
      [
        profile.resourceId,
        profile.contestId,
        profile.predictedCategory,
        profile.categoryConfidence,
        profile.aiTags,
        profile.majorTags,
        profile.stageTags,
        profile.qualityScore,
        profile.valueScore,
        profile.hotScore,
        JSON.stringify(profile.qualityIssues),
        profile.governanceStatus,
        MOCK_PROFILE_VERSION,
        JSON.stringify(profile.componentScores),
        JSON.stringify(profile.analysisPayload),
      ],
    )
    changed += Number(result.rowCount || 0)
  }
  return changed
}

async function insertMockRelations(client, relations) {
  let inserted = 0
  const chunkSize = 500
  for (let start = 0; start < relations.length; start += chunkSize) {
    const chunk = relations.slice(start, start + chunkSize)
    const values = []
    const rowsSql = chunk.map((relation, index) => {
      const offset = index * 8
      values.push(
        relation.id,
        relation.contestId,
        relation.sourceResourceId,
        relation.targetResourceId,
        relation.relationType,
        relation.weight,
        relation.reason,
        JSON.stringify({
          ...MOCK_METADATA,
          seededAt: new Date().toISOString(),
          seedId: randomUUID(),
        }),
      )
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}::JSONB, NOW(), NOW())`
    })

    const result = await client.query(
      `INSERT INTO contest_resource_relations (
        id,
        contest_id,
        source_resource_id,
        target_resource_id,
        relation_type,
        weight,
        reason,
        metadata,
        created_at,
        updated_at
      ) VALUES ${rowsSql.join(', ')}
      ON CONFLICT (source_resource_id, target_resource_id, relation_type) DO NOTHING
      RETURNING id`,
      values,
    )
    inserted += Number(result.rowCount || 0)
  }
  return inserted
}

async function printStatus(client) {
  const resourceResult = await client.query(`SELECT COUNT(*)::TEXT AS count FROM contest_resources WHERE status = 'active'`)
  const eligibleContestResult = await client.query(
    `SELECT COUNT(*)::TEXT AS count
     FROM (
       SELECT contest_id
       FROM contest_resources
       WHERE status = 'active'
       GROUP BY contest_id
       HAVING COUNT(*) > 1
     ) grouped`,
  )
  const profileResult = await client.query(`SELECT COUNT(*)::TEXT AS count FROM contest_resource_profiles`)
  const mockProfileResult = await client.query(`SELECT COUNT(*)::TEXT AS count FROM contest_resource_profiles WHERE analysis_version = $1`, [MOCK_PROFILE_VERSION])
  const mockRelationResult = await client.query(`SELECT COUNT(*)::TEXT AS count FROM contest_resource_relations WHERE metadata @> $1::JSONB`, [JSON.stringify(MOCK_METADATA)])

  console.log(`active 竞赛资料：${resourceResult.rows[0]?.count || '0'}`)
  console.log(`可生成关系的竞赛：${eligibleContestResult.rows[0]?.count || '0'}`)
  console.log(`资料画像总数：${profileResult.rows[0]?.count || '0'}`)
  console.log(`mock 画像数量：${mockProfileResult.rows[0]?.count || '0'}`)
  console.log(`mock 推荐关系：${mockRelationResult.rows[0]?.count || '0'}`)
}

async function run() {
  if (!['status', 'seed', 'clean'].includes(action)) {
    printUsage()
    process.exit(action ? 1 : 0)
  }

  assertPgUrl()
  if (action !== 'status')
    assertMutableActionAllowed()

  const pool = new Pool({
    connectionString: pgUrl,
  })
  const client = await pool.connect()

  try {
    if (action === 'status') {
      await printStatus(client)
      return
    }

    await client.query('BEGIN')
    const cleanedRelations = await cleanMockRelations(client)

    if (action === 'clean') {
      await client.query('COMMIT')
      console.log(`mock 推荐关系清理完成：${cleanedRelations} 条。`)
      return
    }

    const resources = await listActiveResources(client)
    const profileCount = await upsertMockProfiles(client, resources)
    const relations = buildRelations(resources)
    const relationCount = await insertMockRelations(client, relations)
    await client.query('COMMIT')

    console.log(`mock 推荐 seed 完成：画像写入/刷新 ${profileCount} 条，推荐关系写入 ${relationCount} 条，清理旧 mock 关系 ${cleanedRelations} 条。`)
  }
  catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    const message = error instanceof Error ? error.message : String(error)
    console.error(`执行失败：${message}`)
    process.exit(1)
  }
  finally {
    client.release()
    await pool.end()
  }
}

await run()

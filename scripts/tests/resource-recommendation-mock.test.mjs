import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const RESOURCE_PAGE_FILE = resolve(process.cwd(), 'app/pages/resources.vue')
const CONTEST_RESOURCE_PAGE_FILE = resolve(process.cwd(), 'app/pages/contests/[id]/resources.vue')
const RESOURCE_KNOWLEDGE_COMPOSABLE_FILE = resolve(process.cwd(), 'app/composables/resource-knowledge.ts')
const MOCK_SCRIPT_FILE = resolve(process.cwd(), 'scripts/resource-recommendation-mock.mjs')

describe('resource recommendation mock and UI', () => {
  it('资源详情页展示可解释相关推荐并覆盖关系类型中文映射', async () => {
    const [resourcePageSource, contestResourcePageSource, composableSource] = await Promise.all([
      readFile(RESOURCE_PAGE_FILE, 'utf8'),
      readFile(CONTEST_RESOURCE_PAGE_FILE, 'utf8'),
      readFile(RESOURCE_KNOWLEDGE_COMPOSABLE_FILE, 'utf8'),
    ])

    assert.match(composableSource, /recommended:\s*'推荐阅读'/, '缺少 recommended 中文映射')
    assert.match(composableSource, /similar:\s*'相似资料'/, '缺少 similar 中文映射')
    assert.match(composableSource, /duplicate:\s*'疑似重复'/, '缺少 duplicate 中文映射')
    assert.match(composableSource, /complementary:\s*'互补资料'/, '缺少 complementary 中文映射')

    for (const source of [resourcePageSource, contestResourcePageSource]) {
      assert.match(source, /resolveResourceRelationTypeLabel/, '相关推荐未复用统一关系类型中文化函数')
      assert.match(source, /resolveRelationTypeLabel/, '相关推荐未通过统一函数中文化关系类型')
    }

    assert.match(resourcePageSource, /resolveRelationReason/, '资源详情页未展示推荐原因')
    assert.match(resourcePageSource, /匹配度 \{\{ relation\.weight \}\}/, '资源详情页未展示推荐匹配度')
    assert.match(resourcePageSource, /selectRelatedResource\(relation\)/, '资源详情页缺少推荐项点击切换行为')
    assert.match(resourcePageSource, /暂无稳定关联/, '资源详情页缺少细化后的空状态文案')
    assert.match(resourcePageSource, /查看同标签资料/, '资源详情页缺少同标签筛选入口')
    assert.match(resourcePageSource, /查看同分类资料/, '资源详情页缺少同分类筛选入口')
  })

  it('mock 推荐脚本提供显式 seed/status/clean 且只清理带标记的 mock 关系', async () => {
    const source = await readFile(MOCK_SCRIPT_FILE, 'utf8')

    assert.match(source, /<status\|seed\|clean>/, 'mock 脚本缺少 status/seed/clean 用法')
    assert.match(source, /const MOCK_SOURCE = 'resource-recommendation-mock'/, 'mock 脚本缺少固定 source 标记')
    assert.match(source, /const MOCK_METADATA = \{ mock: true, source: MOCK_SOURCE \}/, 'mock 脚本缺少 metadata mock 标记')
    assert.match(source, /metadata @> \$1::JSONB/, 'clean 未按 metadata mock 标记删除')
    assert.doesNotMatch(source, /DELETE FROM contest_resource_relations\s*(?:;|$)/, 'clean 不应无条件删除全部推荐关系')
    assert.match(source, /WHERE contest_resource_profiles\.analysis_version = \$13/, 'mock profile 不应覆盖真实或人工画像')
    assert.match(source, /NODE_ENV=production/, 'mock 脚本缺少生产环境写入保护')
    assert.match(source, /WINLOOP_ALLOW_RESOURCE_RECOMMENDATION_MOCK/, 'mock 脚本缺少生产环境显式放行开关')
    assert.match(source, /WHERE r\.status = 'active'/, 'mock 脚本应只处理 active 竞赛资料')
    assert.match(source, /ON CONFLICT \(source_resource_id, target_resource_id, relation_type\) DO NOTHING/, 'mock 关系写入应避免覆盖真实关系')
  })
})

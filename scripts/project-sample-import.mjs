#!/usr/bin/env node

import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'
import { Pool } from 'pg'
import * as Y from 'yjs'

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

const pgUrl = String(process.env.WINLOOP_PG_URL || '').trim()
if (!pgUrl) {
  console.error('缺少 WINLOOP_PG_URL，无法执行。请先在 .env.local/.env.dev 中配置数据库连接。')
  process.exit(1)
}

const {
  ensureContestLibrarySeeded,
  listCatalogContestIds,
  listContestResourcesByContestId,
} = jiti(resolve(rootDir, 'server/utils/contest-store.ts'))
const {
  applyProjectCollabUpdate,
  bindLibraryResourceToProject,
  createProjectCollabResource,
  overwriteProjectMarkdownCollabResource,
} = jiti(resolve(rootDir, 'server/utils/project-resource-store.ts'))
const { scheduleProjectKnowledgeSourceUpsert } = jiti(resolve(rootDir, 'server/utils/project-knowledge-store.ts'))
const { createEmptySceneDocument } = jiti(resolve(rootDir, 'shared/utils/scene-document.ts'))

const projectId = String(process.argv[2] || '').trim()
const contestId = String(process.argv[3] || '').trim() || listCatalogContestIds()[0]
const actorUserId = String(process.env.WINLOOP_SEED_ACTOR_USER_ID || '').trim()

function printUsage() {
  console.log('用法：node scripts/project-sample-import.mjs <projectId> [contestId]')
}

if (!projectId) {
  printUsage()
  process.exit(1)
}

function buildDesignSceneSample() {
  const scene = createEmptySceneDocument({
    drawMode: 'composition',
    sourceType: 'image_mockup',
    templateKey: 'device-showcase',
    editorEngine: 'canvaskit_wasm',
    metadata: {
      sampleSeed: true,
      sampleLabel: '设计画布样例',
    },
  })
  scene.metadata = {
    ...(scene.metadata || {}),
    sampleSeed: true,
  }
  return scene
}

async function run() {
  const pool = new Pool({
    connectionString: pgUrl,
  })

  try {
    const projectActorResult = await pool.query(
      `SELECT COALESCE(owner_user_id, creator_user_id) AS actor_user_id
       FROM projects
       WHERE id = $1
       LIMIT 1`,
      [projectId],
    )
    const resolvedActorUserId = actorUserId || String(projectActorResult.rows[0]?.actor_user_id || '').trim()
    if (!resolvedActorUserId)
      throw new Error('PROJECT_ACTOR_USER_NOT_FOUND')

    await ensureContestLibrarySeeded(pool, {
      actorUserId: resolvedActorUserId || undefined,
      forceSeed: true,
    })

    const contestResources = await listContestResourcesByContestId(pool, {
      contestId,
      includeInternal: true,
    })
    const selectedResources = contestResources.slice(0, 3)
    console.log(`准备为项目 ${projectId} 导入 ${selectedResources.length} 条竞赛/平台资料。`)

    for (const resource of selectedResources) {
      const bound = await bindLibraryResourceToProject(pool, {
        projectId,
        resourceId: resource.id,
        actorUserId: resolvedActorUserId,
      })
      await scheduleProjectKnowledgeSourceUpsert(pool, {
        projectId,
        resourceId: bound.id,
      })
    }

    const defenseNotes = await createProjectCollabResource(pool, {
      projectId,
      actorUserId: resolvedActorUserId,
      kind: 'markdown',
      purpose: 'notes',
      title: '模拟答辩总结',
      summary: '自动生成的答辩总结样例，便于验证知识库回写与引用。',
      category: 'templates',
      metadata: {
        defenseSummaryNotes: true,
        sampleSeed: true,
      },
    })
    await overwriteProjectMarkdownCollabResource(pool, {
      projectId,
      resourceId: defenseNotes.resource.id,
      actorUserId: resolvedActorUserId,
      markdown: [
        '# 模拟答辩总结',
        '',
        '## 自动汇总',
        '- 本轮样例导入已创建答辩总结资源。',
        '- 后续可用于验证会议资料回写与知识引用。',
        '',
        '## Action Items',
        '- [ ] 补齐 3 分钟路演版本',
        '- [ ] 校验引用资源与页码定位',
      ].join('\n'),
    })
    await scheduleProjectKnowledgeSourceUpsert(pool, {
      projectId,
      resourceId: defenseNotes.resource.id,
    })

    const designSample = await createProjectCollabResource(pool, {
      projectId,
      actorUserId: resolvedActorUserId,
      kind: 'draw',
      purpose: 'design',
      title: '设计画布样例',
      summary: '自动生成的设计样例，用于验证设计画布、设备编排与导出。',
      category: 'templates',
      metadata: {
        sampleSeed: true,
        templateKey: 'device-showcase',
      },
    })

    const doc = new Y.Doc()
    const drawMap = doc.getMap('draw')
    const nodes = new Y.Array()
    drawMap.set('nodes', nodes)
    nodes.push([buildDesignSceneSample()])
    await applyProjectCollabUpdate(pool, {
      projectId,
      resourceId: designSample.resource.id,
      actorUserId: resolvedActorUserId,
      update: Y.encodeStateAsUpdate(doc),
    })
    await scheduleProjectKnowledgeSourceUpsert(pool, {
      projectId,
      resourceId: designSample.resource.id,
    })

    console.log(`样例导入完成：contestId=${contestId}，项目 ${projectId} 已补入竞赛资料、模拟答辩总结与设计画布样例。`)
  }
  catch (error) {
    console.error(`执行失败：${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
  finally {
    await pool.end()
  }
}

await run()

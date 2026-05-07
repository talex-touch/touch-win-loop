import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'

const PROJECT_ACCESS_STORE_PATH = resolve(process.cwd(), 'server/utils/project-access-store.ts')

async function loadProjectAccessStore() {
  return import(pathToFileURL(PROJECT_ACCESS_STORE_PATH).href)
}

it('画布资源库项目导入 helper 对 viewer 角色开放', async () => {
  const { teamCanImportCanvasLibraryToProject } = await loadProjectAccessStore()
  const queries = []
  const db = {
    async query(sql, params) {
      queries.push({ sql, params })
      return { rows: [{ can_import: true }] }
    },
  }

  const result = await teamCanImportCanvasLibraryToProject(
    db,
    {
      id: 'user-viewer-1',
      isPlatformAdmin: false,
    },
    'project-1',
  )

  assert.equal(result, true)
  assert.equal(queries.length, 1)
  assert.deepEqual(queries[0]?.params?.[3], ['owner', 'manager', 'editor', 'viewer'])
})

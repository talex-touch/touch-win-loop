import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const SCHEMA_FILE = resolve(process.cwd(), 'server/database/bootstrap/schema.ts')
const STORE_FILE = resolve(process.cwd(), 'server/utils/project-resource-device-arrangement-store.ts')
const CREATE_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/device-arrangements/index.post.ts')
const GET_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/device-arrangements/[resourceId].get.ts')
const PATCH_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/device-arrangements/[resourceId].patch.ts')
const MIGRATION_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/resources/[resourceId]/device-arrangement-migration.post.ts')

it('设备排布独立持久化表与 store 已落地', async () => {
  const [schemaSource, storeSource] = await Promise.all([
    readFile(SCHEMA_FILE, 'utf8'),
    readFile(STORE_FILE, 'utf8'),
  ])

  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS project_resource_device_arrangements \(/, '缺少设备排布持久化表')
  assert.match(schemaSource, /document_json JSONB NOT NULL DEFAULT '\{\}'::JSONB/, '设备排布表缺少 document_json')
  assert.match(schemaSource, /preview_svg TEXT NOT NULL DEFAULT ''/, '设备排布表缺少 preview_svg')
  assert.match(schemaSource, /idx_project_resource_device_arrangements_project_updated/, '设备排布表缺少 project 维度索引')

  assert.match(storeSource, /export async function createProjectDeviceArrangement\(/, '缺少设备排布创建 store')
  assert.match(storeSource, /export async function getProjectDeviceArrangement\(/, '缺少设备排布读取 store')
  assert.match(storeSource, /export async function updateProjectDeviceArrangement\(/, '缺少设备排布更新 store')
  assert.match(storeSource, /export async function migrateProjectDeviceArrangementFromScene\(/, '缺少旧设备排布迁移 store')
  assert.match(storeSource, /DEVICE_ARRANGEMENT_MIME_TYPE/, '设备排布 store 未写入独立 mime type')
  assert.match(storeSource, /migratedDeviceArrangementResourceId/, '设备排布迁移后未回写旧资源 metadata')
})

it('设备排布 API 提供创建、读取、保存与迁移入口', async () => {
  const [createApi, getApi, patchApi, migrationApi] = await Promise.all([
    readFile(CREATE_API_FILE, 'utf8'),
    readFile(GET_API_FILE, 'utf8'),
    readFile(PATCH_API_FILE, 'utf8'),
    readFile(MIGRATION_API_FILE, 'utf8'),
  ])

  assert.match(createApi, /createProjectDeviceArrangement/, '创建 API 未调用设备排布 store')
  assert.match(createApi, /project\.resources\.changed/, '创建 API 未广播资源刷新事件')
  assert.match(getApi, /getProjectDeviceArrangement/, '读取 API 未调用设备排布 store')
  assert.match(patchApi, /updateProjectDeviceArrangement/, '保存 API 未调用设备排布更新 store')
  assert.match(migrationApi, /migrateProjectDeviceArrangementFromScene/, '迁移 API 未调用旧设备排布迁移 store')
  assert.match(migrationApi, /project\.outline\.changed/, '迁移 API 未广播 outline 刷新事件')
})

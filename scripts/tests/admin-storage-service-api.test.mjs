import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const GET_FILE = resolve(process.cwd(), 'server/api/admin/storage-service/index.get.ts')
const PATCH_FILE = resolve(process.cwd(), 'server/api/admin/storage-service/index.patch.ts')
const TEST_FILE = resolve(process.cwd(), 'server/api/admin/storage-service/test.post.ts')
const STORE_FILE = resolve(process.cwd(), 'server/utils/storage-service-store.ts')
const STORAGE_FILE = resolve(process.cwd(), 'server/storage/document-storage.ts')
const ENV_FILE = resolve(process.cwd(), 'server/utils/env.ts')
const RUNTIME_STORE_FILE = resolve(process.cwd(), 'server/utils/platform-runtime-config-store.ts')
const UPLOAD_FILE = resolve(process.cwd(), 'server/api/projects/[id]/resources/upload.post.ts')
const SESSION_FILE = resolve(process.cwd(), 'server/api/projects/[id]/resource-upload-sessions/index.post.ts')
const FINALIZE_FILE = resolve(process.cwd(), 'server/services/project-resource-upload.ts')
const SOURCE_FILE = resolve(process.cwd(), 'server/api/projects/[id]/resources/[resourceId]/source.get.ts')
const SCHEMA_FILE = resolve(process.cwd(), 'server/database/bootstrap/schema.ts')
const MIGRATION_FILE = resolve(process.cwd(), 'scripts/migrations/2026-05-04-storage-service-upload-event.sql')

it('存储服务 API 均使用登录态和平台权限校验', async () => {
  const sources = await Promise.all([
    readFile(GET_FILE, 'utf8'),
    readFile(PATCH_FILE, 'utf8'),
    readFile(TEST_FILE, 'utf8'),
  ])

  for (const source of sources)
    assert.match(source, /requireAuth/, '存储服务 API 未复用 requireAuth')

  assert.match(sources[0], /contest\.read_internal/, 'GET 未校验 contest.read_internal')
  assert.match(sources[1], /contest\.write/, 'PATCH 未校验 contest.write')
  assert.match(sources[2], /contest\.write/, 'TEST 未校验 contest.write')
})

it('存储池配置校验覆盖 local、唯一 ID、provider、启用渠道与水位范围', async () => {
  const [store, env, runtimeStore] = await Promise.all([
    readFile(STORE_FILE, 'utf8'),
    readFile(ENV_FILE, 'utf8'),
    readFile(RUNTIME_STORE_FILE, 'utf8'),
  ])

  assert.match(store, /STORAGE_WATERMARK_DEFAULT_PERCENT = 90/, '水位默认值不是 90')
  assert.match(store, /存储渠道 ID 重复/, 'PATCH 草稿未校验渠道 ID 唯一')
  assert.match(store, /至少需要启用一个存储渠道/, 'PATCH 草稿未校验至少一个启用渠道')
  assert.match(store, /id: 'local'/, '草稿归一化未保证 local 存在')
  assert.match(store, /id === 'local' \? 'local' : provider/, '草稿未强制 local 使用本机 provider')
  assert.match(store, /Math\.max\(1, Math\.min\(100/, '草稿未限制 watermarkPercent 范围')
  assert.match(env, /normalizeRuntimeStorageSettings/, 'runtime storage 未统一归一化')
  assert.match(env, /channelsById\.set\(localFallback\.id, localFallback\)/, 'runtime storage 未默认注入 local')
  assert.match(runtimeStore, /decryptStorageSecrets/, '平台 runtime override 未解密渠道密钥')
  assert.match(runtimeStore, /encryptStorageSecrets/, '平台 runtime override 未加密渠道密钥')
})

it('写入选择服务按主渠道和 priority 自动切换并暴露容量错误', async () => {
  const [store, storage] = await Promise.all([
    readFile(STORE_FILE, 'utf8'),
    readFile(STORAGE_FILE, 'utf8'),
  ])

  assert.match(store, /selectStorageWriteChannel/, '缺少存储写入选择服务')
  assert.match(store, /compareStorageWriteChannels/, '选择服务未复用统一写入排序')
  assert.match(store, /left\.id === storage\.primaryChannelId/, '选择服务未优先当前主渠道')
  assert.match(store, /left\.priority - right\.priority/, '选择服务未按 priority 排序')
  assert.match(store, /projectedBytes <= watermarkBytes/, '选择服务未按水位判断可写')
  assert.match(store, /throw new Error\('STORAGE_CAPACITY_EXCEEDED'\)/, '无可用渠道时未返回 STORAGE_CAPACITY_EXCEEDED')
  assert.match(storage, /selectDocumentWriteStorage/, '文档存储未提供统一写入选择 helper')
  assert.match(storage, /applyPlatformRuntimeOverrides/, '写入选择 helper 未叠加后台 runtime override')
})

it('上传、分片、下载和预览按 channel 读写并记录流量事件', async () => {
  const [upload, session, finalize, source] = await Promise.all([
    readFile(UPLOAD_FILE, 'utf8'),
    readFile(SESSION_FILE, 'utf8'),
    readFile(FINALIZE_FILE, 'utf8'),
    readFile(SOURCE_FILE, 'utf8'),
  ])

  assert.match(upload, /readEffectivePlatformRuntimeSettings/, '普通上传未读取生效存储配置')
  assert.match(upload, /selectStorageWriteChannel/, '普通上传未接入存储选择')
  assert.match(upload, /storageProvider: storage\.channelId/, '普通上传未把 channel id 写入对象记录')
  assert.match(upload, /eventCode: 'resource\.upload'/, '普通上传未记录 resource.upload')
  assert.match(upload, /channelId: storage\.channelId/, '普通上传事件未记录 channelId')
  assert.match(session, /storageProvider: storageSelection\.channel\.id/, '分片上传 session 未记录目标 channel')
  assert.match(finalize, /getDocumentStorageByChannel\(session\.finalStorageProvider/, '分片合并未按 session channel 合并')
  assert.match(finalize, /eventCode: 'resource\.upload'/, '分片 finalize 未记录 resource.upload')
  assert.match(source, /getDocumentStorageByChannel\(fileRef\.storageProvider/, '下载未按对象 channel 读取')
  assert.match(source, /eventCode: 'resource\.download'/, '下载未记录 resource.download')
  assert.match(source, /bytes: buffer\.length/, '下载成功事件未记录 bytes')
})

it('统计聚合使用库内逻辑量且兼容历史 provider 值和脏 bytes', async () => {
  const store = await readFile(STORE_FILE, 'utf8')
  const storage = await readFile(STORAGE_FILE, 'utf8')

  assert.match(store, /project_resource_documents/, '统计未聚合项目文档对象')
  assert.match(store, /contest_resource_documents/, '统计未聚合平台资料对象')
  assert.match(store, /project_resources pr/, '统计未聚合无 document 的上传资源')
  assert.match(store, /canvas_library_item_versions/, '统计未聚合画布资源库对象')
  assert.match(storage, /providerMatch = channels\.find\(channel => channel\.provider === requested\)/, '历史 provider 兼容解析缺失')
  assert.match(store, /jsonTextBigintSql/, '统计 SQL 未对 JSON bytes 做安全转换')
  assert.doesNotMatch(store, /\(meta->>'bytes'\)::BIGINT/, '事件 bytes 仍存在不安全强转')
})

it('resource.upload 事件枚举和数据库约束已补齐', async () => {
  const [schema, migration] = await Promise.all([
    readFile(SCHEMA_FILE, 'utf8'),
    readFile(MIGRATION_FILE, 'utf8'),
  ])

  assert.match(schema, /'resource\.upload'/, 'bootstrap schema 未加入 resource.upload')
  assert.match(migration, /'resource\.upload'/, '迁移未加入 resource.upload')
  assert.match(migration, /DROP CONSTRAINT IF EXISTS billing_usage_events_event_code_check/, '迁移未重建事件约束')
})

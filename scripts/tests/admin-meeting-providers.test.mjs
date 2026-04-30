import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/meeting-providers.vue')
const TEST_ROUTE_FILE = resolve(process.cwd(), 'server/api/admin/meeting/providers/test.post.ts')
const GET_ROUTE_FILE = resolve(process.cwd(), 'server/api/admin/meeting/providers.get.ts')
const PATCH_ROUTE_FILE = resolve(process.cwd(), 'server/api/admin/meeting/providers.patch.ts')
const CONFIG_FILE = resolve(process.cwd(), 'server/services/meeting/admin-provider-config.ts')
const RTC_PROVIDER_FILE = resolve(process.cwd(), 'server/services/meeting/rtc-provider.ts')
const ASR_GATEWAY_FILE = resolve(process.cwd(), 'server/services/meeting/asr-gateway.ts')

it('admin meeting providers 页面支持测试连通性并展示 rtc/asr 探针结果', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')
  assert.match(source, /测试连通性/, '会议服务配置页未提供测试连通性按钮')
  assert.match(source, /\/admin\/meeting\/providers\/test/, '会议服务配置页未调用测试接口')
  assert.match(source, /testResult\.rtc/, '会议服务配置页未展示 RTC 探针结果')
  assert.match(source, /testResult\.asr/, '会议服务配置页未展示 ASR 探针结果')
  assert.match(source, /applyLocalLiveKitPreset/, '会议服务配置页未提供本机 LiveKit 预设')
  assert.match(source, /applyLocalAsrBridgePreset/, '会议服务配置页未提供本机 ASR bridge 预设')
  assert.match(source, /applyOpenAiCompatibleAsrPreset/, '会议服务配置页未提供 OpenAI Compatible ASR 预设')
  assert.match(source, /rtcProviderOptions/, '会议服务配置页未把 RTC provider 固定为选项')
  assert.match(source, /asrProviderOptions/, '会议服务配置页未把 ASR provider 固定为选项')
  assert.match(source, /将以明文形式托管/, '会议服务配置页未提示无 master key 时的明文托管风险')
})

it('admin meeting providers API 不暴露旧全局 AI provider/model meta', async () => {
  const routeSources = await Promise.all([
    readFile(GET_ROUTE_FILE, 'utf8'),
    readFile(PATCH_ROUTE_FILE, 'utf8'),
    readFile(TEST_ROUTE_FILE, 'utf8'),
  ])

  for (const source of routeSources) {
    assert.doesNotMatch(source, /runtime\.ai\.(provider|model|embeddingModel|visionModel)/, '会议服务接口仍暴露旧全局 AI runtime meta')
    assert.doesNotMatch(source, /fallbackRuntime\.ai\.(provider|model|embeddingModel|visionModel)/, '会议服务接口错误响应仍暴露旧全局 AI runtime meta')
  }
})

it('admin meeting providers API 复用公共配置合并逻辑并校验写权限', async () => {
  const [testRouteSource, patchRouteSource, configSource] = await Promise.all([
    readFile(TEST_ROUTE_FILE, 'utf8'),
    readFile(PATCH_ROUTE_FILE, 'utf8'),
    readFile(CONFIG_FILE, 'utf8'),
  ])

  assert.match(testRouteSource, /contest\.write/, '会议服务测试接口未校验 contest.write')
  assert.match(testRouteSource, /applyMeetingProvidersMutation/, '会议服务测试接口未复用配置合并逻辑')
  assert.match(patchRouteSource, /applyMeetingProvidersMutation/, '会议服务保存接口未复用配置合并逻辑')
  assert.match(configSource, /export function buildMeetingProvidersPayload/, '会议服务后台 payload 未抽到公共构建函数')
  assert.match(configSource, /export function isMeetingSecretReplaceRequested/, '会议服务后台未抽出 secret replace 判定')
  assert.doesNotMatch(patchRouteSource, /缺少 WINLOOP_CONFIG_MASTER_KEY，无法替换会议服务密钥字段/, '会议服务保存接口仍阻止无 master key 场景下的后台配置')
})

it('rtc 与 asr gateway 已暴露真实连通性探针', async () => {
  const [rtcSource, asrSource] = await Promise.all([
    readFile(RTC_PROVIDER_FILE, 'utf8'),
    readFile(ASR_GATEWAY_FILE, 'utf8'),
  ])

  assert.match(rtcSource, /export async function probeRtcProviderGateway/, 'RTC gateway 未导出连通性探针')
  assert.match(rtcSource, /RoomService\/ListRooms/, 'RTC 连通性探针未命中 LiveKit ListRooms')
  assert.match(asrSource, /export async function probeMeetingAsrGateway/, 'ASR gateway 未导出连通性探针')
  assert.match(asrSource, /\/healthz/, 'ASR 连通性探针未命中 healthz')
})

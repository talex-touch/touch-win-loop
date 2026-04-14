import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const ASR_GATEWAY_FILE = resolve(process.cwd(), 'server/services/meeting/asr-gateway.ts')
const RUNTIME_FILE = resolve(process.cwd(), 'server/services/meeting/meeting-runtime.ts')
const FRAME_API_FILE = resolve(process.cwd(), 'server/api/meetings/[meetingId]/captions/frame.post.ts')
const ADMIN_PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/meeting-providers.vue')
const SETUP_DOC_FILE = resolve(process.cwd(), 'docs/meeting-runtime-setup.md')
const DEPLOY_DOC_FILE = resolve(process.cwd(), 'deploy/meeting/README.zh-CN.md')

it('meeting asr gateway 已支持 openai-compatible 内置转写 provider', async () => {
  const source = await readFile(ASR_GATEWAY_FILE, 'utf8')

  assert.match(source, /provider === 'openai-compatible'/, 'ASR gateway 未识别 openai-compatible provider')
  assert.match(source, /createOpenAiCompatibleMeetingAsrGateway/, 'ASR gateway 未实现内置 OpenAI Compatible provider')
  assert.match(source, /audio\/transcriptions/, 'ASR gateway 未调用 audio transcriptions 接口')
  assert.match(source, /gpt-4o-mini-transcribe/, 'ASR gateway 未优先尝试 gpt-4o-mini-transcribe')
  assert.match(source, /whisper-1/, 'ASR gateway 未提供 whisper-1 回退模型')
  assert.match(source, /buildSineWavePcmBuffer/, 'ASR gateway 未为 probe 构造最小音频样本')
  assert.match(source, /真实转写样本成功/, 'ASR gateway 未把 probe 升级为真实转写请求')
  assert.match(source, /internal\/meetings\/asr-events/, 'ASR gateway 未回写内置字幕事件回调')
})

it('会议运行时与字幕帧接口已兼容内置 asr 会话失效场景', async () => {
  const [runtimeSource, frameApiSource] = await Promise.all([
    readFile(RUNTIME_FILE, 'utf8'),
    readFile(FRAME_API_FILE, 'utf8'),
  ])

  assert.match(runtimeSource, /provider !== 'http' && provider !== 'openai-compatible'/, '会议运行时未放行 openai-compatible ASR provider')
  assert.match(frameApiSource, /MEETING_ASR_SESSION_NOT_FOUND/, '字幕帧接口未处理内置 ASR 会话丢失')
  assert.match(frameApiSource, /会议转写会话已失效，请刷新页面后重新加入会议/, '字幕帧接口未返回明确中文提示')
})

it('后台配置页与文档已暴露 openai-compatible asr 配置方式', async () => {
  const [adminSource, setupDocSource, deployDocSource] = await Promise.all([
    readFile(ADMIN_PAGE_FILE, 'utf8'),
    readFile(SETUP_DOC_FILE, 'utf8'),
    readFile(DEPLOY_DOC_FILE, 'utf8'),
  ])

  assert.match(adminSource, /openai-compatible/, '后台会议配置页未提示 openai-compatible provider')
  assert.match(setupDocSource, /provider = openai-compatible/, '会议运行说明未描述 openai-compatible provider')
  assert.match(deployDocSource, /provider = openai-compatible/, '本地 bring-up 文档未描述 openai-compatible provider')
})

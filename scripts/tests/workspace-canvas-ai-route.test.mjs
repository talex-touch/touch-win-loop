import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const CANVAS_STREAM_FILE = resolve(process.cwd(), 'server/api/ai/canvas/stream.post.ts')

it('画布 AI 流接口按动作映射到独立 channel，并拒绝未配置与无结构源续改', async () => {
  const source = await readFile(CANVAS_STREAM_FILE, 'utf8')

  assert.match(source, /function resolveCanvasChannelKey\(action: AiCanvasAssistAction\): 'workspace_canvas_generate' \| 'workspace_canvas_complete' \| 'workspace_canvas_refine' \{/, '画布 AI 流接口缺少动作到 channel 的映射')
  assert.match(source, /if \(action === 'complete'\)\s+return 'workspace_canvas_complete'/, '画布 AI 补全动作未映射到 workspace_canvas_complete')
  assert.match(source, /if \(action === 'refine'\)\s+return 'workspace_canvas_refine'/, '画布 AI 续改动作未映射到 workspace_canvas_refine')
  assert.match(source, /if \(request\.action !== 'generate' && !toText\(request\.context\?\.sourceText\)\)/, '画布 AI 未拦截空结构源下的补全或续改')
  assert.match(source, /buildAiNotConfiguredMessage\(channelRuntime\.channel\.label \|\| '画布 AI'\)/, '画布 AI 未使用真实场景标签返回未配置错误')
  assert.match(source, /route: '\/api\/ai\/canvas\/stream'/, '画布 AI 未记录独立接口来源')
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('~~/server/services/ai/llm-client', () => ({
  createChatModel: vi.fn(() => ({
    withStructuredOutput: vi.fn(() => ({
      invoke: vi.fn(async () => ({ completion: '' })),
    })),
  })),
}))

vi.mock('~~/server/utils/platform-ai-base-url', () => ({
  normalizePlatformAiApiKey: vi.fn((value: unknown) => String(value || '').trim()),
  resolvePlatformAiRequestBaseURL: vi.fn((baseURL: unknown) => String(baseURL || '').trim() || 'https://dashscope.aliyuncs.com/compatible-mode/v1'),
}))

vi.mock('~~/server/utils/platform-ai-channels', () => ({
  buildMergedPrompt: vi.fn((...parts: string[]) => parts.filter(Boolean).join('\n')),
}))

vi.mock('~~/server/utils/project-resource-store', () => ({
  getProjectResourceById: vi.fn(),
}))

vi.mock('~~/server/utils/team-membership-store', () => ({
  teamHasWorkspaceMembership: vi.fn(),
}))

const INLINE_COMPLETION_SERVICE_FILE = resolve(process.cwd(), 'server/services/ai/workspace-inline-completion.ts')
const INLINE_COMPLETION_API_FILE = resolve(process.cwd(), 'server/api/ai/workspace/document-completion.post.ts')
const INLINE_COMPLETION_ACCEPT_API_FILE = resolve(process.cwd(), 'server/api/ai/workspace/document-completion/accept.post.ts')
const RICH_TEXT_EDITOR_FILE = resolve(process.cwd(), 'app/components/editor/RichTextEditor.vue')
const WORKSPACE_DETAIL_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const USER_AI_USAGE_FILE = resolve(process.cwd(), 'app/composables/useUserAiUsage.ts')

let normalizeInlineCompletionSuggestion: typeof import('../../server/services/ai/workspace-inline-completion.ts').normalizeInlineCompletionSuggestion
let resolveInlineCompletionCursorOffset: typeof import('../../server/services/ai/workspace-inline-completion.ts').resolveInlineCompletionCursorOffset
let supportsInlineCompletionPartialMode: typeof import('../../server/services/ai/workspace-inline-completion.ts').supportsInlineCompletionPartialMode
let canRetainInlineCompletionForContext: typeof import('../../app/components/editor/rich-text-editor-inline-completion.ts').canRetainInlineCompletionForContext
let canStartInlineCompletionForContext: typeof import('../../app/components/editor/rich-text-editor-inline-completion.ts').canStartInlineCompletionForContext
let shouldCancelInlineCompletionOnBlur: typeof import('../../app/components/editor/rich-text-editor-inline-completion.ts').shouldCancelInlineCompletionOnBlur

beforeAll(async () => {
  const [service, inlineCompletionState] = await Promise.all([
    import('../../server/services/ai/workspace-inline-completion.ts'),
    import('../../app/components/editor/rich-text-editor-inline-completion.ts'),
  ])
  normalizeInlineCompletionSuggestion = service.normalizeInlineCompletionSuggestion
  resolveInlineCompletionCursorOffset = service.resolveInlineCompletionCursorOffset
  supportsInlineCompletionPartialMode = service.supportsInlineCompletionPartialMode
  canRetainInlineCompletionForContext = inlineCompletionState.canRetainInlineCompletionForContext
  canStartInlineCompletionForContext = inlineCompletionState.canStartInlineCompletionForContext
  shouldCancelInlineCompletionOnBlur = inlineCompletionState.shouldCancelInlineCompletionOnBlur
})

describe('workspace-inline-completion', () => {
  it('会按折叠光标的行列信息定位 markdown 偏移', () => {
    const markdown = 'alpha\nbeta\ncharlie'

    expect(resolveInlineCompletionCursorOffset(markdown, {
      anchorLine: 2,
      anchorColumn: 3,
      headLine: 2,
      headColumn: 3,
      isCollapsed: true,
      selectionLength: 0,
    })).toBe(8)

    expect(resolveInlineCompletionCursorOffset(markdown, {
      anchorLine: 9,
      anchorColumn: 9,
      headLine: 9,
      headColumn: 9,
      isCollapsed: true,
      selectionLength: 0,
    })).toBe(markdown.length)
  })

  it('会裁掉围栏、解释前缀、超长内容以及与后文重叠的前缀', () => {
    const normalized = normalizeInlineCompletionSuggestion({
      suggestion: '```markdown\n补全内容：已有后文继续说明\n第二行\n第三行\n```',
      suffix: '已有后文收尾',
    })

    expect(normalized).toBe('继续说明\n第二行')

    const oversized = normalizeInlineCompletionSuggestion({
      suggestion: `说明${'a'.repeat(160)}`,
      suffix: '',
    })

    expect(oversized.length).toBeLessThanOrEqual(120)
  })

  it('会在 openai-compatible 的 Qwen 模型上启用 partial mode', () => {
    expect(supportsInlineCompletionPartialMode({
      provider: 'DashScope',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'sk-test',
      model: 'qwen3.6-plus',
      timeoutMs: 12000,
      maxRetries: 0,
    })).toBe(true)

    expect(supportsInlineCompletionPartialMode({
      provider: 'NewApi',
      baseURL: 'https://newapi.center.tagzxia.com/v1',
      apiKey: 'sk-test',
      model: 'qwen3.6-plus',
      timeoutMs: 12000,
      maxRetries: 0,
    })).toBe(true)

    expect(supportsInlineCompletionPartialMode({
      provider: 'DashScope',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'sk-test',
      model: 'deepseek-v3.2',
      timeoutMs: 12000,
      maxRetries: 0,
    })).toBe(false)

    expect(supportsInlineCompletionPartialMode({
      provider: 'DashScope',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'sk-test',
      model: 'qwen3.6-plus',
      format: 'response',
      timeoutMs: 12000,
      maxRetries: 0,
    })).toBe(false)
  })

  it('会区分可发起、可保留与 blur 取消语义', () => {
    const baseContext = {
      enabled: true,
      hasRequestHandler: true,
      hasAcceptHandler: true,
      editable: true,
      focused: true,
      composing: false,
      acceptPending: false,
      suspendUntilNextUserInput: false,
      linkInputVisible: false,
      slashMenuVisible: false,
      hasCollapsedSelection: true,
      inCodeBlock: false,
    }

    expect(canStartInlineCompletionForContext(baseContext)).toBe(true)
    expect(canRetainInlineCompletionForContext(baseContext)).toBe(true)

    expect(canStartInlineCompletionForContext({
      ...baseContext,
      focused: false,
    })).toBe(false)
    expect(canRetainInlineCompletionForContext({
      ...baseContext,
      focused: false,
    })).toBe(true)

    expect(shouldCancelInlineCompletionOnBlur(false)).toBe(false)
    expect(shouldCancelInlineCompletionOnBlur(true)).toBe(true)
  })

  it('源码已接入独立 suggestion/accept 接口、Tab 接受与 1 credit 扣费链路', async () => {
    const [
      serviceSource,
      suggestionApiSource,
      acceptApiSource,
      editorSource,
      pageSource,
      usageSource,
    ] = await Promise.all([
      readFile(INLINE_COMPLETION_SERVICE_FILE, 'utf8'),
      readFile(INLINE_COMPLETION_API_FILE, 'utf8'),
      readFile(INLINE_COMPLETION_ACCEPT_API_FILE, 'utf8'),
      readFile(RICH_TEXT_EDITOR_FILE, 'utf8'),
      readFile(WORKSPACE_DETAIL_FILE, 'utf8'),
      readFile(USER_AI_USAGE_FILE, 'utf8'),
    ])

    assert.match(serviceSource, /new AIMessage\(\s*\{\s*content:\s*input\.prefix\s*\}\s*\)/, '自动补齐服务未把前缀包装成 assistant message')
    assert.match(serviceSource, /partial:\s*true/, '自动补齐服务未在最后一条 assistant message 上附带 partial 标记')
    assert.match(serviceSource, /convertMessagesToCompletionsMessageParams/, '自动补齐服务未复用 LangChain completions message 转换器')
    assert.match(serviceSource, /completionWithRetry/, '自动补齐服务未通过 LangChain chat model 发起 partial mode 请求')
    assert.match(serviceSource, /如果前文主要是英文，就只用英文续写；如果前文主要是中文，就只用中文续写/, '自动补齐提示词未强调语言继承')
    assert.match(serviceSource, /表达可以比普通补齐更灵动一点/, '自动补齐提示词未提高续写创意要求')
    assert.doesNotMatch(serviceSource, /import OpenAI from 'openai'/, '自动补齐服务不应再直连 OpenAI SDK')
    assert.match(serviceSource, /if \(input\.signal\?\.aborted\)\s+throw error/, 'partial mode 回退仍会吞掉外部 abort')
    assert.doesNotMatch(serviceSource, /partial mode request/, '自动补齐服务不应输出完整 partial request payload')
    assert.match(suggestionApiSource, /maxRetries:\s*0/, '自动补齐 suggestion 接口未关闭上游内部重试')
    assert.doesNotMatch(suggestionApiSource, /request cache hit|request cache join|request success/, '自动补齐 suggestion 接口日志仍然过于冗长')
    assert.doesNotMatch(suggestionApiSource, /runWithPlatformAiChannelFallback/, '自动补齐 suggestion 接口不应在轻量场景里串行回退多个模型')
    assert.match(suggestionApiSource, /workspace_document_continue/, 'suggestion 接口未复用 workspace_document_continue 场景')
    assert.doesNotMatch(suggestionApiSource, /ai_chat_sessions|ai_chat_messages/, 'suggestion 接口不应污染聊天会话链路')
    assert.match(acceptApiSource, /route:\s*'\/api\/ai\/workspace\/document-completion\/accept'/, 'accept 接口未写入自动补齐专用 route')
    assert.match(acceptApiSource, /units:\s*1/, 'accept 接口未固定按 1 credit 扣费')
    assert.match(editorSource, /event\.key\.toLowerCase\(\) === 'a'[\s\S]*AllSelection/, '编辑器未接管 Ctrl\/⌘ \+ A 全选全文')
    assert.match(editorSource, /event\.key === 'Tab'[\s\S]*acceptInlineCompletionSuggestion\(\)/, '编辑器未在 Tab 上优先接受 ghost text')
    assert.match(editorSource, /loadingRequestKey/, '编辑器缺少内联补齐加载态')
    assert.match(editorSource, /cancelInlineCompletionRequest\(/, '编辑器缺少内联补齐取消动作')
    assert.match(editorSource, /INLINE_COMPLETION_RETRY_COOLDOWN_MS = 15_000/, '编辑器缺少自动补齐失败冷却时间')
    assert.match(editorSource, /suppressedRequestKey/, '编辑器缺少自动补齐失败抑制状态')
    assert.match(editorSource, /function suppressInlineCompletionRequest\(requestKey: string\)/, '编辑器缺少自动补齐失败抑制逻辑')
    assert.match(editorSource, /function isInlineCompletionRequestSuppressed\(requestKey: string\)/, '编辑器缺少自动补齐失败冷却判断')
    assert.match(editorSource, /noteInlineCompletionUserInput\(\): void \{[\s\S]*clearInlineCompletionSuppression\(\)/, '编辑器在用户继续输入后未解除自动补齐失败冷却')
    assert.match(editorSource, /rich-text-editor__inline-completion-loading/, '编辑器缺少光标后的 loading widget')
    assert.match(editorSource, /inlineCompletionState\.suspendUntilNextUserInput = true/, '接受补齐后未进入 suspendUntilNextUserInput')
    assert.match(editorSource, /document\.addEventListener\('pointerdown', handleDocumentPointerDown, true\)/, '编辑器未捕获外部 pointerdown 以区分 blur 来源')
    assert.match(editorSource, /shouldCancelInlineCompletionOnBlur\(inlineCompletionPointerDownOutsideEditor\)/, '编辑器未按 blur 来源区分是否取消自动补齐')
    assert.match(pageSource, /isAiFeatureAvailable\('documentContinue'\)/, '项目页未按 documentContinue feature 做前置 gating')
    assert.match(pageSource, /aiCreditsRemaining\.value >= 1/, '项目页未按剩余 credits 做自动补齐 gating')
    assert.match(usageSource, /'\/api\/ai\/workspace\/document-completion\/accept': '文档自动补齐'/, 'AI 使用记录缺少自动补齐 route 文案')
  })
})

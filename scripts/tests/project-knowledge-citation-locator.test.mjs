import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const DOMAIN_TYPES_FILE = resolve(process.cwd(), 'shared/types/domain-legacy.ts')
const KNOWLEDGE_CONTEXT_FILE = resolve(process.cwd(), 'server/services/ai/project-knowledge-context.ts')
const ASSISTANT_MESSAGE_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceAssistantMessageContent.vue')

it('知识引用协议补齐 sourceScope、anchor/node locator，并在统一消息组件渲染', async () => {
  const [typesSource, contextSource, assistantSource] = await Promise.all([
    readFile(DOMAIN_TYPES_FILE, 'utf8'),
    readFile(KNOWLEDGE_CONTEXT_FILE, 'utf8'),
    readFile(ASSISTANT_MESSAGE_FILE, 'utf8'),
  ])

  assert.match(typesSource, /export type ProjectKnowledgeCitationSourceScope[\s\S]*'project_resource'[\s\S]*'contest_resource'[\s\S]*'platform_resource'[\s\S]*'meeting_artifact'[\s\S]*'canvas_resource'/, '共享类型缺少知识引用 sourceScope 枚举')
  assert.match(typesSource, /export interface ProjectKnowledgeCitationLocator \{[\s\S]*page\?: number[\s\S]*section\?: string[\s\S]*anchorId\?: string[\s\S]*nodeId\?: string[\s\S]*utteranceRange\?: string[\s\S]*label\?: string[\s\S]*\}/, '共享类型缺少知识引用 locator 结构')
  assert.match(typesSource, /export interface ProjectKnowledgeCitation \{[\s\S]*sourceScope: ProjectKnowledgeCitationSourceScope[\s\S]*anchorId\?: string[\s\S]*nodeId\?: string[\s\S]*locator\?: ProjectKnowledgeCitationLocator \| null[\s\S]*\}/, '共享类型未把 sourceScope\/anchor\/node\/locator 写入 citation')

  assert.match(contextSource, /function resolveCitationSourceScope\(hit: ProjectKnowledgeChunkHit\): ProjectKnowledgeCitationSourceScope \{/, 'knowledge context 缺少引用 sourceScope 归一化')
  assert.match(contextSource, /function buildCitationLocator\(hit: ProjectKnowledgeChunkHit\): ProjectKnowledgeCitationLocator \| null \{/, 'knowledge context 缺少引用 locator 构造')
  assert.match(contextSource, /sourceScope: resolveCitationSourceScope\(hit\)/, 'knowledge context 未回填 sourceScope')
  assert.match(contextSource, /anchorId: normalizeString\(locator\?\.anchorId\) \|\| undefined/, 'knowledge context 未回填 anchorId')
  assert.match(contextSource, /nodeId: normalizeString\(locator\?\.nodeId\) \|\| undefined/, 'knowledge context 未回填 nodeId')
  assert.match(contextSource, /locator,/, 'knowledge context 未回填 locator')

  assert.match(assistantSource, /sourceScope: \(normalizeString\(item\.sourceScope\) \|\| 'project_resource'\) as ProjectKnowledgeCitationSourceScope/, '统一 assistant 消息组件未归一化 sourceScope')
  assert.match(assistantSource, /anchorId: normalizeString\(item\.anchorId\) \|\| undefined/, '统一 assistant 消息组件未归一化 anchorId')
  assert.match(assistantSource, /nodeId: normalizeString\(item\.nodeId\) \|\| undefined/, '统一 assistant 消息组件未归一化 nodeId')
  assert.match(assistantSource, /locator: item\.locator && typeof item\.locator === 'object' && !Array\.isArray\(item\.locator\)/, '统一 assistant 消息组件未归一化 locator')
  assert.match(assistantSource, /citation\.locator\?\.utteranceRange/, '统一 assistant 消息组件未展示 utterance locator')
  assert.match(assistantSource, /citation\.locator\?\.nodeId \|\| citation\.nodeId/, '统一 assistant 消息组件未展示 node locator')
  assert.match(assistantSource, /citation\.sourceScope === 'platform_resource'/, '统一 assistant 消息组件未展示平台级知识来源')
})

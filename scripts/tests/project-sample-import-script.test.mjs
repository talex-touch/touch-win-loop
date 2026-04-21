import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const SCRIPT_FILE = resolve(process.cwd(), 'scripts/project-sample-import.mjs')

it('样例导入脚本可把竞赛资料、平台资料与项目内资源一次性灌入项目并触发索引', async () => {
  await access(SCRIPT_FILE)
  const source = await readFile(SCRIPT_FILE, 'utf8')

  assert.match(source, /用法：node scripts\/project-sample-import\.mjs <projectId> \[contestId\]/, '样例导入脚本缺少使用说明')
  assert.match(source, /bindLibraryResourceToProject/, '样例导入脚本未导入竞赛\/平台资料')
  assert.match(source, /createProjectCollabResource/, '样例导入脚本未创建项目内部协作资源')
  assert.match(source, /scheduleProjectKnowledgeSourceUpsert|enqueueProjectKnowledgeSourceReindex/, '样例导入脚本未触发知识索引')
  assert.match(source, /模拟答辩总结/, '样例导入脚本未生成平台内样例答辩资料')
  assert.match(source, /设计画布样例/, '样例导入脚本未生成设计画布样例')
})

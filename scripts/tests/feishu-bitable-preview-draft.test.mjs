import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

it('同步项编辑器会把当前草稿配置作为预检请求体提交', async () => {
  const componentSource = await readFile(resolve(process.cwd(), 'app/components/admin/AdminFeishuBitableSyncEditor.vue'), 'utf8')

  assert.match(componentSource, /const draft: FeishuBitableSyncItemPreviewRequest = \{/, '编辑器没有构造草稿预检请求')
  assert.match(componentSource, /source:\s*\{[\s\S]*appToken:[\s\S]*tableId:[\s\S]*viewId:/, '预检请求缺少当前来源草稿')
  assert.match(componentSource, /mapping,\s*options,\s*writeback,/, '预检请求缺少当前映射\/选项\/回填草稿')
  assert.match(componentSource, /body:\s*draft,/, '预检请求未把草稿配置发送到后端')
})

it('同步项编辑器会为每个目标字段渲染固定映射行并展示模拟同步结果', async () => {
  const componentSource = await readFile(resolve(process.cwd(), 'app/components/admin/AdminFeishuBitableSyncEditor.vue'), 'utf8')

  assert.match(componentSource, /normalizeMappingWizardBindings/, '编辑器未把映射行归一化到固定字段列表')
  assert.match(componentSource, /missingRequiredMappingLabels/, '编辑器未提示缺失的必填映射字段')
  assert.match(componentSource, /normalizeCurrentEntityTemplate/, '编辑器缺少整理旧配置为当前实体模板的能力')
  assert.match(componentSource, /v-for="binding in mappingWizardBindings"/, '编辑器未按固定字段行渲染映射表单')
  assert.match(componentSource, /WRITEBACK_FIELD_CONFIGS/, '编辑器未抽出回填字段选择配置')
  assert.match(componentSource, /v-model="writebackForm\[field\.key\]"/, '回填配置未改成字段选择下拉')
  assert.match(componentSource, /模拟同步结果/, '编辑器缺少模拟同步结果区块')
  assert.match(componentSource, /previewResult\.mappedSampleRows/, '编辑器未展示预检样例行')
})

it('竞赛库映射会收敛到实际需要的字段并同步收窄默认模板与预检展示', async () => {
  const componentSource = await readFile(resolve(process.cwd(), 'app/components/admin/AdminFeishuBitableSyncEditor.vue'), 'utf8')
  const configSource = await readFile(resolve(process.cwd(), 'shared/utils/feishu-bitable-sync-config.ts'), 'utf8')
  const serviceSource = await readFile(resolve(process.cwd(), 'server/services/feishu/bitable-sync.ts'), 'utf8')

  assert.doesNotMatch(componentSource, /organizer（主办方）/, '竞赛库映射仍然暴露主办方字段')
  assert.doesNotMatch(componentSource, /coOrganizer（协办方）/, '竞赛库映射仍然暴露协办方字段')
  assert.doesNotMatch(componentSource, /participantRequirements（参赛对象）/, '竞赛库映射仍然暴露参赛对象字段')
  assert.doesNotMatch(componentSource, /teamRule（组队规则）/, '竞赛库映射仍然暴露组队规则字段')
  assert.doesNotMatch(componentSource, /currentSeason（届次）/, '竞赛库映射仍然暴露届次字段')
  assert.doesNotMatch(componentSource, /aliases（别名）/, '竞赛库映射仍然暴露别名字段')
  assert.doesNotMatch(componentSource, /recommendedFor（推荐人群）/, '竞赛库映射仍然暴露推荐人群字段')
  assert.match(componentSource, /registrationWindow（报名时间）/, '竞赛库映射缺少报名时间字段')
  assert.match(componentSource, /submissionDeadline（截止时间）/, '竞赛库映射缺少截止时间字段')
  assert.match(componentSource, /registrationWindow:\s*\[[\s\S]*报名时间[\s\S]*报名窗口[\s\S]*\]/, '竞赛库映射缺少报名时间字段猜测')
  assert.match(componentSource, /submissionDeadline:\s*\[[\s\S]*截止时间[\s\S]*提交截止时间[\s\S]*提交时间[\s\S]*\]/, '竞赛库映射缺少截止时间字段猜测')
  assert.match(componentSource, /return \['externalId', 'name', 'officialUrl', 'registrationWindow', 'submissionDeadline'\]/, '竞赛库预检重点字段未纳入时间字段')
  assert.match(configSource, /fieldMap:\s*\{[\s\S]*name:\s*''[\s\S]*officialUrl:\s*''[\s\S]*summary:\s*''[\s\S]*level:\s*''[\s\S]*disciplines:\s*''[\s\S]*keywords:\s*''[\s\S]*registrationWindow:\s*''[\s\S]*submissionDeadline:\s*''[\s\S]*\}/, '竞赛库默认模板未收敛到精简字段并补齐时间字段')
  assert.doesNotMatch(configSource, /organizer:\s*''/, '竞赛库默认模板仍然包含主办方')
  assert.doesNotMatch(configSource, /recommendedFor:\s*''/, '竞赛库默认模板仍然包含推荐人群')
  assert.match(serviceSource, /contest:\s*\[[\s\S]*'externalId'[\s\S]*'name'[\s\S]*'officialUrl'[\s\S]*'summary'[\s\S]*'level'[\s\S]*'disciplines'[\s\S]*'keywords'[\s\S]*'registrationWindow'[\s\S]*'submissionDeadline'[\s\S]*\]/, '预检展示字段未同步补齐时间字段')
  assert.doesNotMatch(serviceSource, /ARRAY_PREVIEW_FIELDS[\s\S]*'aliases'/, '预检数组字段仍然保留了别名')
  assert.doesNotMatch(serviceSource, /ARRAY_PREVIEW_FIELDS[\s\S]*'recommendedFor'/, '预检数组字段仍然保留了推荐人群')
})

it('新增同步项时会提供类型识别建议并生成推荐名称', async () => {
  const componentSource = await readFile(resolve(process.cwd(), 'app/components/admin/AdminFeishuBitableSyncEditor.vue'), 'utf8')

  assert.match(componentSource, /suggestSyncItemEntityType/, '新增同步项未接入实体类型自动识别')
  assert.match(componentSource, /buildSuggestedSyncItemName/, '新增同步项未生成推荐名称')
  assert.match(componentSource, /useAutoDetectedNewItemEntityType/, '新增同步项缺少按子表识别入口')
})

it('新增同步项的实体类型选择器不会被 label 包裹导致点击异常', async () => {
  const componentSource = await readFile(resolve(process.cwd(), 'app/components/admin/AdminFeishuBitableSyncEditor.vue'), 'utf8')

  assert.match(
    componentSource,
    /<div class="text-\[11px\] text-slate-600 font-medium block">\s*<div>同步到<\/div>\s*<div class="mt-1 flex gap-2">[\s\S]*?<a-select v-model="newItemForm\.entityType"[\s\S]*?<a-button size="mini" @click="useAutoDetectedNewItemEntityType">/,
    '新增同步项的实体类型选择器未改为普通容器包裹',
  )
})

it('服务端预检会优先使用草稿配置覆盖已保存同步项', async () => {
  const apiSource = await readFile(resolve(process.cwd(), 'server/api/admin/integrations/feishu/bitable-syncs/[id]/items/[itemId]/preview.post.ts'), 'utf8')
  const serviceSource = await readFile(resolve(process.cwd(), 'server/services/feishu/bitable-sync.ts'), 'utf8')

  assert.match(apiSource, /readBody<FeishuBitableSyncItemPreviewRequest>/, '预检接口未读取草稿请求体')
  assert.match(apiSource, /draft:\s*body/, '预检接口未把草稿传入服务层')
  assert.match(serviceSource, /const sourceOverride = parseJsonObject\(input\.draft\?\.source\)/, '服务层未读取来源草稿覆盖')
  assert.match(serviceSource, /const mappingRaw = input\.draft && hasOwn\(input\.draft, 'mapping'\) \? input\.draft\.mapping : task\.mapping/, '服务层未优先使用草稿 mapping')
  assert.match(serviceSource, /const optionsRaw = input\.draft && hasOwn\(input\.draft, 'options'\) \? input\.draft\.options : task\.options/, '服务层未优先使用草稿 options')
  assert.match(serviceSource, /const writebackRaw = input\.draft && hasOwn\(input\.draft, 'writeback'\)/, '服务层未优先使用草稿 writeback')
})

it('基础映射保存只持久化配置，不会隐式扫表，并在成功后自动关闭 Drawer', async () => {
  const componentSource = await readFile(resolve(process.cwd(), 'app/components/admin/AdminFeishuBitableSyncEditor.vue'), 'utf8')
  const saveBlockMatch = componentSource.match(/async function saveCurrentItem\(saveContext: SaveCurrentItemContext = 'main'\) \{([\s\S]*?)\n\}\n\nasync function toggleItemEnabled/)

  assert.ok(saveBlockMatch, '未找到带上下文的保存方法')
  const saveBlock = saveBlockMatch[1]
  assert.match(saveBlock, /applySavedItemLocally\(response\.data\)/, '保存后未改为本地同步状态')
  assert.doesNotMatch(saveBlock, /await loadSyncDetail\(/, '保存后仍会刷新同步详情，可能触发隐式扫表')
  assert.doesNotMatch(saveBlock, /await loadItemDetail\(activeItemId\.value\)/, '保存后仍会刷新当前同步项详情，可能触发字段巡检')
  assert.match(saveBlock, /if \(saveContext === 'mapping'\) \{[\s\S]*mappingDrawerVisible\.value = false[\s\S]*mappingSaveSuccess\.value = '基础映射已保存。'[\s\S]*setSuccess\('基础映射已保存。'\)/, '基础映射保存后未自动关闭并提示成功')
  assert.match(componentSource, /@click="saveCurrentItem\('mapping'\)"/, '基础映射 Drawer 保存按钮未走映射保存上下文')
  assert.match(componentSource, /v-if="mappingSaveSuccess"/, '基础映射摘要区未提供就地成功提示')
  assert.match(componentSource, /@click="inspectFields"/, '显式刷新字段入口不应被移除')
  assert.match(componentSource, /@click="previewCurrentItem"/, '显式预检入口不应被移除')
  assert.match(componentSource, /@click="runCurrentItem"/, '显式手动执行入口不应被移除')
})

it('竞赛同步会忽略旧扩展字段，并从时间映射派生 registration / submission 节点', async () => {
  const serviceSource = await readFile(resolve(process.cwd(), 'server/services/feishu/bitable-sync.ts'), 'utf8')
  const contestStoreSource = await readFile(resolve(process.cwd(), 'server/utils/contest-store.ts'), 'utf8')
  const applyContestMatch = serviceSource.match(/async function applyContestRecord\([\s\S]*?\n\}\n\nasync function applyTrackRecord/)

  assert.ok(applyContestMatch, '未找到竞赛同步执行逻辑')
  const applyContestBlock = applyContestMatch[0]
  assert.match(applyContestBlock, /getText\('registrationWindow'\)/, '竞赛同步未读取报名时间映射')
  assert.match(applyContestBlock, /getText\('submissionDeadline'\)/, '竞赛同步未读取截止时间映射')
  assert.match(applyContestBlock, /await syncContestDerivedTimelineNodes\(db,\s*\{[\s\S]*registrationWindow,[\s\S]*submissionDeadline,[\s\S]*\}\)/, '竞赛同步未接入时间节点派生 helper')
  assert.doesNotMatch(applyContestBlock, /organizer:/, '竞赛同步仍然写入主办方')
  assert.doesNotMatch(applyContestBlock, /coOrganizer:/, '竞赛同步仍然写入协办方')
  assert.doesNotMatch(applyContestBlock, /participantRequirements:/, '竞赛同步仍然写入参赛对象')
  assert.doesNotMatch(applyContestBlock, /teamRule:/, '竞赛同步仍然写入组队规则')
  assert.doesNotMatch(applyContestBlock, /currentSeason:/, '竞赛同步仍然写入届次')
  assert.doesNotMatch(applyContestBlock, /aliases:/, '竞赛同步仍然写入别名')
  assert.doesNotMatch(applyContestBlock, /recommendedFor:/, '竞赛同步仍然写入推荐人群')

  assert.match(contestStoreSource, /export async function syncContestDerivedTimelineNodes\(/, '竞赛时间节点派生 helper 未暴露')
  assert.match(contestStoreSource, /parseImportRegistrationWindow\(input\.registrationWindow \|\| '', currentSeason\)/, '报名时间未复用现有解析语义')
  assert.match(contestStoreSource, /parseContestSyncSubmissionDeadline\(input\.submissionDeadline \|\| '', currentSeason\)/, '截止时间未走单日期解析')
  assert.match(contestStoreSource, /nodeType:\s*'registration'/, '竞赛同步未派生 registration 节点')
  assert.match(contestStoreSource, /nodeType:\s*'submission'/, '竞赛同步未派生 submission 节点')
  assert.match(contestStoreSource, /const submissionEndAt = submission\.endAt \|\| \(!submission\.raw && registration\.endAt \? registration\.endAt : null\)/, '缺少报名结束时间兜底 submission 的逻辑')
  assert.doesNotMatch(contestStoreSource, /DELETE FROM contest_timelines/, '竞赛同步不应删除既有时间节点')
})

it('竞赛手工编辑页仍然保留完整的领域字段维护能力', async () => {
  const overviewEditSource = await readFile(resolve(process.cwd(), 'app/pages/admin/contests/[id]/overview/edit.vue'), 'utf8')

  assert.match(overviewEditSource, /form\.organizer = contest\.organizer \|\| ''/, '竞赛手工编辑页不应移除主办方维护能力')
  assert.match(overviewEditSource, /form\.coOrganizer = contest\.coOrganizer \|\| ''/, '竞赛手工编辑页不应移除协办方维护能力')
  assert.match(overviewEditSource, /form\.participantRequirements = contest\.participantRequirements \|\| ''/, '竞赛手工编辑页不应移除参赛对象维护能力')
  assert.match(overviewEditSource, /form\.teamRule = contest\.teamRule \|\| ''/, '竞赛手工编辑页不应移除组队规则维护能力')
  assert.match(overviewEditSource, /form\.currentSeason = contest\.currentSeason \|\| ''/, '竞赛手工编辑页不应移除届次维护能力')
  assert.match(overviewEditSource, /form\.aliasesCsv = toCsv\(contest\.aliases\)/, '竞赛手工编辑页不应移除别名维护能力')
  assert.match(overviewEditSource, /form\.recommendedForCsv = toCsv\(contest\.recommendedFor\)/, '竞赛手工编辑页不应移除推荐人群维护能力')
})

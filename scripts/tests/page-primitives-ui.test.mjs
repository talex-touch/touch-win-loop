import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PAGE_HEADER_FILE = resolve(process.cwd(), 'app/components/ui/PageHeader.vue')
const SECTION_CARD_FILE = resolve(process.cwd(), 'app/components/ui/SectionCard.vue')
const PILL_TABS_FILE = resolve(process.cwd(), 'app/components/ui/PillTabs.vue')
const ADMIN_RESOURCE_FORM_FILE = resolve(process.cwd(), 'app/components/admin/forms/AdminResourceForm.vue')

it('基础 UI primitive 暴露统一的标题、卡片与胶囊标签接口', async () => {
  const [pageHeaderSource, sectionCardSource, pillTabsSource] = await Promise.all([
    readFile(PAGE_HEADER_FILE, 'utf8'),
    readFile(SECTION_CARD_FILE, 'utf8'),
    readFile(PILL_TABS_FILE, 'utf8'),
  ])

  assert.match(pageHeaderSource, /title: string/, 'PageHeader 缺少 title 接口')
  assert.match(pageHeaderSource, /description\?: string/, 'PageHeader 缺少 description 接口')
  assert.match(pageHeaderSource, /meta\?: string \| string\[\]/, 'PageHeader 缺少 meta 接口')
  assert.match(pageHeaderSource, /\$slots\.actions/, 'PageHeader 缺少 actions 插槽')
  assert.match(pageHeaderSource, /wl-page-header__title/, 'PageHeader 未绑定统一标题样式')

  assert.match(sectionCardSource, /tone\?: 'default' \| 'muted' \| 'danger' \| 'success'/, 'SectionCard 缺少 tone 接口')
  assert.match(sectionCardSource, /compact\?: boolean/, 'SectionCard 缺少 compact 接口')
  assert.match(sectionCardSource, /wl-section-card/, 'SectionCard 未绑定统一卡片样式')
  assert.match(sectionCardSource, /wl-action-bar/, 'SectionCard 未提供 actions 容器')

  assert.match(pillTabsSource, /items: PillTabItem\[\]/, 'PillTabs 缺少 items 接口')
  assert.match(pillTabsSource, /activeKey: string/, 'PillTabs 缺少 activeKey 接口')
  assert.match(pillTabsSource, /\(event: 'select', key: string\)/, 'PillTabs 缺少 select 事件')
  assert.match(pillTabsSource, /wl-pill-tab--active/, 'PillTabs 未绑定 active 样式')
})

it('资源表单复用统一草稿提示、状态块与模式切换 primitive', async () => {
  const source = await readFile(ADMIN_RESOURCE_FORM_FILE, 'utf8')

  assert.match(source, /AdminDraftNotice/, '资源表单未复用 AI 草稿提示组件')
  assert.match(source, /PillTabs/, '资源表单未复用胶囊标签切换')
  assert.match(source, /SectionCard v-if="loading"/, '资源表单缺少统一 loading 卡片')
  assert.match(source, /StateBlock v-if="errorText" tone="error"/, '资源表单缺少统一错误状态块')
  assert.match(source, /StateBlock v-if="draftText" tone="success"/, '资源表单缺少统一成功状态块')
  assert.match(source, /documentActions/, '资源表单缺少文档操作扩展插槽')
})

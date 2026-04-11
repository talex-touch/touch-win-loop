import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { it } from 'vitest'

const PROJECT_WORKSPACE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const WORKSPACE_LEFT_SIDEBAR_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceLeftSidebar.vue')
const WORKSPACE_METAK_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMetaK.vue')
const WORKSPACE_METAK_UTIL_FILE = resolve(process.cwd(), 'app/utils/workspace-metak.ts')

it('MetaK 面板具备快捷键、键盘导航和结果分组锚点', async () => {
  const [workspaceSource, metaKSource] = await Promise.all([
    readFile(PROJECT_WORKSPACE_FILE, 'utf8'),
    readFile(WORKSPACE_METAK_FILE, 'utf8'),
  ])

  assert.match(workspaceSource, /function onMetaKGlobalKeydown\(event: KeyboardEvent\): void/, '项目工作区缺少 MetaK 全局快捷键监听')
  assert.match(workspaceSource, /document\.addEventListener\('keydown', onMetaKGlobalKeydown\)/, '项目工作区未注册 MetaK 全局快捷键')
  assert.match(workspaceSource, /resolveWorkspaceMetaKShortcutLabel\(window\.navigator\.platform\)/, '项目工作区未按平台解析 MetaK 快捷键标签')
  assert.match(workspaceSource, /function executeMetaKItem\(item: WorkspaceMetaKItem\): Promise<void>/, '项目工作区缺少 MetaK 执行分发函数')
  assert.match(workspaceSource, /function buildMetaKRemoteLibraryItems\(resources: Resource\[\], query: string\): WorkspaceMetaKItem\[\]/, '项目工作区缺少远端系统资料库结果构建逻辑')

  assert.match(metaKSource, /event\.key === 'ArrowDown'/, 'WorkspaceMetaK 未处理向下键导航')
  assert.match(metaKSource, /event\.key === 'ArrowUp'/, 'WorkspaceMetaK 未处理向上键导航')
  assert.match(metaKSource, /event\.key === 'Enter'/, 'WorkspaceMetaK 未处理回车执行')
  assert.match(metaKSource, /event\.key === 'Escape'/, 'WorkspaceMetaK 未处理 Esc 关闭')
  assert.match(metaKSource, /workspace-metak__section-head/, 'WorkspaceMetaK 缺少结果分组头部')
  assert.match(metaKSource, /data-testid="workspace-metak-empty"/, 'WorkspaceMetaK 缺少空态锚点')
})

it('MetaK 可通过信号驱动左栏模块和大纲定位', async () => {
  const [workspaceSource, sidebarSource] = await Promise.all([
    readFile(PROJECT_WORKSPACE_FILE, 'utf8'),
    readFile(WORKSPACE_LEFT_SIDEBAR_FILE, 'utf8'),
  ])

  assert.match(sidebarSource, /commandSignal\?: number/, 'WorkspaceLeftSidebar 缺少 MetaK 命令信号入参')
  assert.match(sidebarSource, /commandModuleId\?: WorkspaceLeftPanelContentId \| ''/, 'WorkspaceLeftSidebar 缺少 MetaK 目标模块入参')
  assert.match(sidebarSource, /commandOutlineId\?: string/, 'WorkspaceLeftSidebar 缺少 MetaK 大纲定位入参')
  assert.match(sidebarSource, /watch\(\(\) => props\.commandSignal, \(next, previous\) => \{/, 'WorkspaceLeftSidebar 未监听 MetaK 命令信号')
  assert.match(sidebarSource, /sectionExpanded\.outline = true/, 'WorkspaceLeftSidebar 未在 MetaK 定位时展开大纲 section')
  assert.match(workspaceSource, /:command-signal="leftSidebarMetaKSignal"/, '项目工作区未向左栏透传 MetaK 信号')
  assert.match(workspaceSource, /:command-module-id="leftSidebarMetaKModuleId"/, '项目工作区未向左栏透传 MetaK 模块目标')
  assert.match(workspaceSource, /:command-outline-id="leftSidebarMetaKOutlineId"/, '项目工作区未向左栏透传 MetaK 大纲目标')
})

it('MetaK 排序规则保持前缀优先、命令优先、本地优先，且空查询只返回默认项', async () => {
  const metak = await import(pathToFileURL(WORKSPACE_METAK_UTIL_FILE).href)

  const queryItems = [
    {
      id: 'contains',
      sectionId: 'resources',
      type: 'resource',
      title: '项目复盘',
      subtitle: '含分析总结',
      icon: 'description',
      source: 'local',
      keywords: ['复盘'],
    },
    {
      id: 'prefix',
      sectionId: 'resources',
      type: 'resource',
      title: '分析报告',
      subtitle: '项目分析材料',
      icon: 'description',
      source: 'local',
      keywords: ['分析'],
    },
    {
      id: 'command',
      sectionId: 'actions',
      type: 'command',
      title: '分析竞赛',
      subtitle: '切到竞赛分析',
      icon: 'manage_search',
      source: 'local',
      keywords: ['分析'],
    },
    {
      id: 'remote',
      sectionId: 'library',
      type: 'library_resource',
      title: '分析报告',
      subtitle: '系统资料库',
      icon: 'description',
      source: 'remote',
      keywords: ['分析'],
    },
  ]

  const ranked = metak.matchAndSortWorkspaceMetaKItems(queryItems, '分析')
  assert.deepEqual(
    ranked.map(item => item.id).slice(0, 4),
    ['command', 'prefix', 'remote', 'contains'],
    'MetaK 排序未满足“命令优先、前缀优先、本地优先”规则',
  )

  const defaultOnly = metak.matchAndSortWorkspaceMetaKItems([
    {
      id: 'default-command',
      sectionId: 'actions',
      type: 'command',
      title: '打开资源管理器',
      icon: 'folder_open',
      source: 'local',
      defaultVisible: true,
      priority: 50,
    },
    {
      id: 'hidden-resource',
      sectionId: 'resources',
      type: 'resource',
      title: '隐藏资源',
      icon: 'description',
      source: 'local',
      defaultVisible: false,
      priority: 999,
    },
  ], '')
  assert.deepEqual(defaultOnly.map(item => item.id), ['default-command'], 'MetaK 空查询应仅返回默认展示项')

  const pinyinRanked = metak.matchAndSortWorkspaceMetaKItems([
    {
      id: 'analysis-command',
      sectionId: 'actions',
      type: 'command',
      title: '打开竞赛分析',
      subtitle: '切到竞赛分析',
      icon: 'manage_search',
      source: 'local',
      keywords: ['竞赛分析'],
    },
    {
      id: 'meeting-command',
      sectionId: 'actions',
      type: 'command',
      title: '打开项目会议',
      subtitle: '查看会议列表',
      icon: 'video_call',
      source: 'local',
      keywords: ['项目会议'],
    },
  ], 'jsfx')
  assert.deepEqual(
    pinyinRanked.map(item => item.id),
    ['analysis-command'],
    'MetaK 应支持通过拼音首字母匹配中文结果',
  )

  const fullPinyinRanked = metak.matchAndSortWorkspaceMetaKItems([
    {
      id: 'analysis-command',
      sectionId: 'actions',
      type: 'command',
      title: '打开竞赛分析',
      subtitle: '切到竞赛分析',
      icon: 'manage_search',
      source: 'local',
      keywords: ['竞赛分析'],
    },
    {
      id: 'resource-command',
      sectionId: 'actions',
      type: 'command',
      title: '打开资源管理器',
      subtitle: '查看资源',
      icon: 'folder_open',
      source: 'local',
      keywords: ['资源管理器'],
    },
  ], 'dakaijingsaifenxi')
  assert.deepEqual(
    fullPinyinRanked.map(item => item.id),
    ['analysis-command'],
    'MetaK 应支持通过全拼匹配中文结果',
  )

  const sections = metak.buildWorkspaceMetaKSections({
    items: [
      {
        id: 'action-1',
        sectionId: 'actions',
        type: 'command',
        title: '打开资源管理器',
        icon: 'folder_open',
        source: 'local',
        defaultVisible: true,
        priority: 10,
      },
      {
        id: 'project-1',
        sectionId: 'projects',
        type: 'project',
        title: '触达闭环项目',
        icon: 'dataset',
        source: 'local',
        defaultVisible: true,
        priority: 5,
      },
    ],
    query: '',
    definitions: [
      { id: 'actions', title: '快捷命令', maxItems: 4 },
      { id: 'projects', title: '项目切换', maxItems: 4 },
    ],
  })
  assert.deepEqual(sections.map(section => section.id), ['actions', 'projects'], 'MetaK 分组顺序不稳定')
})

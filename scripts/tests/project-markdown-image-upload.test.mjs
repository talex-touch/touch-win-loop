import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PROJECT_PAGE_FILE = resolve(process.cwd(), 'app/pages/team/[teamId]/project/[projectId].vue')
const WORKSPACE_MAIN_PANEL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const RICH_TEXT_EDITOR_FILE = resolve(process.cwd(), 'app/components/editor/RichTextEditor.vue')
const RICH_TEXT_COMMANDS_FILE = resolve(process.cwd(), 'app/components/editor/rich-text-editor-commands.ts')
const RICH_TEXT_SCHEMA_FILE = resolve(process.cwd(), 'shared/utils/collab-rich-text-schema.ts')
const RESOURCE_UPLOAD_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/resources/upload.post.ts')
const RESOURCE_FILE_API_FILE = resolve(process.cwd(), 'server/api/projects/[id]/resources/[resourceId]/file.get.ts')

it('项目文档图片上传复用项目资源链路，并写入 markdown 归属关系', async () => {
  const projectPageSource = await readFile(PROJECT_PAGE_FILE, 'utf8')
  const panelSource = await readFile(WORKSPACE_MAIN_PANEL_FILE, 'utf8')
  const uploadApiSource = await readFile(RESOURCE_UPLOAD_API_FILE, 'utf8')
  const fileApiSource = await readFile(RESOURCE_FILE_API_FILE, 'utf8')

  assert.match(projectPageSource, /async function uploadMarkdownImage\(file: File\): Promise<\{/, '项目页未定义 markdown 图片上传处理器')
  assert.match(projectPageSource, /formData\.append\('category', 'basic_info'\)/, '图片上传未固定写入 basic_info 分类')
  assert.match(projectPageSource, /formData\.append\('accessLevel', 'login_required'\)/, '图片上传未固定写入 login_required 访问级别')
  assert.match(projectPageSource, /formData\.append\('hostMarkdownResourceId', hostMarkdownResourceId\)/, '图片上传未传递 hostMarkdownResourceId')
  assert.match(projectPageSource, /authApiFetch<ApiResponse<\{\s+resources: Resource\[]\s+\}>>\(`\/projects\/\$\{projectId\}\/resources\/upload`/, '图片上传未复用项目资源上传 API')
  assert.match(projectPageSource, /src: endpoint\(`\/projects\/\$\{projectId\}\/resources\/\$\{resource\.id\}\/file`\)/, '图片节点 src 未指向稳定的内部 file 路由')
  assert.match(projectPageSource, /:markdown-image-upload-handler="uploadMarkdownImage"/, '项目页未把图片上传处理器透传给主面板')

  assert.match(panelSource, /markdownImageUploadHandler\?: \(\(file: File\) => Promise<\{ src: string, alt\?: string, title\?: string, resourceId\?: string \}>\) \| null/, '主面板未声明 markdown 图片上传处理器 prop')
  assert.match(panelSource, /:image-upload-handler="markdownImageUploadHandler"/, '主面板未把图片上传处理器传给编辑器')

  assert.match(uploadApiSource, /const hostMarkdownResourceId = normalizeString\(fields\.hostMarkdownResourceId\)/, '上传 API 未读取 hostMarkdownResourceId')
  assert.match(uploadApiSource, /metadata: hostMarkdownResourceId\s+\?\s+\{\s+embeddedIn: \{\s+kind: 'markdown',\s+resourceId: hostMarkdownResourceId,/s, '上传 API 未写入 markdown embeddedIn 元数据')

  assert.match(fileApiSource, /Content-Disposition', `inline; filename\*=UTF-8''\$\{encodeFileName/, '图片 file 路由未以内联方式返回文件')
})

it('编辑器 slash 菜单、图片接入与代码渲染能力已完整落地', async () => {
  const editorSource = await readFile(RICH_TEXT_EDITOR_FILE, 'utf8')
  const commandsSource = await readFile(RICH_TEXT_COMMANDS_FILE, 'utf8')
  const schemaSource = await readFile(RICH_TEXT_SCHEMA_FILE, 'utf8')

  assert.match(editorSource, /enableSlashMenu\?: boolean/, '编辑器未暴露 slash 菜单开关')
  assert.match(editorSource, /imageUploadHandler\?: \(\(file: File\) => Promise<RichTextEditorImageUploadResult>\) \| null/, '编辑器未暴露图片上传处理器')
  assert.match(editorSource, /const commandItems = computed\(\(\) => \{\s+return buildRichTextEditorCommands\(/s, '编辑器未复用统一命令注册表')
  assert.match(editorSource, /function resolveSlashCommandTrigger\(\)/, '编辑器未实现 slash 触发识别')
  assert.match(editorSource, /data-testid="rich-text-editor-slash-menu"/, '编辑器未渲染 slash 菜单浮层')
  assert.match(editorSource, /handlePaste: handleEditorPaste/, '编辑器未接管剪贴板图片粘贴')
  assert.match(editorSource, /handleDrop: handleEditorDrop/, '编辑器未接管图片拖拽上传')
  assert.match(editorSource, /openImagePicker\(/, '编辑器未提供 slash 图片上传入口')
  assert.match(editorSource, /setCodeBlock\(\{ language: 'plaintext' \}\)/, '编辑器未为新建代码块设置默认 plaintext')
  assert.match(editorSource, /\.hljs-keyword/, '编辑器未声明代码高亮样式')

  assert.match(commandsSource, /action: 'paragraph'/, '统一命令注册表缺少正文命令')
  assert.match(commandsSource, /action: 'heading'/, '统一命令注册表缺少标题命令')
  assert.match(commandsSource, /action: 'taskList'/, '统一命令注册表缺少任务列表命令')
  assert.match(commandsSource, /action: 'table'/, '统一命令注册表缺少表格命令')
  assert.match(commandsSource, /action: 'image'/, '统一命令注册表缺少图片上传命令')

  assert.match(schemaSource, /CodeBlockLowlight\.configure\(\{\s+lowlight,\s+defaultLanguage: 'plaintext'/s, '共享 schema 未接入 lowlight 代码块')
  assert.match(schemaSource, /lowlight\.register\(\{\s+plaintext,\s+bash,\s+json,\s+javascript,\s+typescript,\s+html: xml,\s+css,\s+markdown,\s+sql,/s, '共享 schema 未固定注册约定语言集')
  assert.match(schemaSource, /const CollabMarkdownImage = Image\.extend\(/, '共享 schema 未扩展 markdown image 节点')
  assert.match(schemaSource, /resourceId: \{\s+default: null,/s, '共享 schema 未为图片节点保留 resourceId attr')
})

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const TARGET_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')

it('项目协作页将生成邀请链接入口放到头部，并切换到项目协作语义', async () => {
  const source = await readFile(TARGET_FILE, 'utf8')

  assert.doesNotMatch(source, /当前账号角色/, '成员管理页仍展示当前账号角色卡片')
  assert.match(source, /@click="openWorkspaceInviteModal"/, '成员管理页头部未提供生成邀请链接入口')
  assert.match(source, /生成邀请链接[\s\S]*刷新/, '成员管理页头部未将生成邀请链接按钮放在刷新左侧')
  assert.match(source, /项目协作管理/, '成员管理页标题未改为项目协作管理')
  assert.match(source, /项目成员（\{\{ workspaceMembers\.length \}\}）/, '成员列表标题未切到项目成员语义')
})

it('项目协作邀请弹框展示加入空间与项目的说明，并使用项目角色', async () => {
  const source = await readFile(TARGET_FILE, 'utf8')

  assert.match(source, /v-model:visible="workspaceInviteModalVisible"/, '成员管理页未使用独立邀请弹框')
  assert.match(source, /接受邀请后会先加入当前空间，再加入当前项目。/, '邀请弹框缺少空间与项目联动说明')
  assert.match(source, /workspaceInviteProjectLabel/, '邀请弹框未展示当前项目归属说明')
  assert.match(source, /留空用户名 = 通用链接可多人加入；填写后仅指定账号可加入。/, '邀请弹框未明确区分通用链接与指定用户名邀请')
  assert.match(source, /<span class="block">项目角色<\/span>/, '邀请弹框未改为项目角色选择')
  assert.match(source, /const PROJECT_ROLE_OPTIONS: ProjectMemberRole\[\] = \['manager', 'editor', 'viewer'\]/, '邀请弹框未提供 manager\/editor\/viewer 项目角色')
  assert.match(source, /Latest|最新邀请链接|workspaceInvitationLink/, '邀请弹框未展示最新邀请链接区域')
})

it('项目协作页展示项目邀请与项目席位，而不是 Team billing', async () => {
  const source = await readFile(TARGET_FILE, 'utf8')

  assert.match(source, /待处理邀请（\{\{ workspaceInvitations\.length \}\}）/, '邀请列表标题未改为待处理邀请')
  assert.match(source, /暂无待处理邀请。/, '邀请列表空态文案未同步更新')
  assert.match(source, /workspaceInvitationScopeLabel\(invitation\)/, '邀请列表未展示项目归属说明')
  assert.match(source, /加入项目：\$\{projectTitle\} · 项目角色：\$\{roleLabel\}/, '邀请范围标签未展示项目角色')
  assert.match(source, /项目席位概览/, '成员管理区未改为项目席位概览')
  assert.match(source, /每个项目最多支持 15 个协作席位，接受邀请时会同时加入当前空间与项目。/, '项目席位说明未统一到每项目 15 席位规则')
  assert.match(source, /:max="15"/, '项目席位输入框未限制最大 15')
  assert.match(source, /每个项目最多支持 15 个协作席位。/, '项目席位表单未提供最大 15 的前端提示')
  assert.doesNotMatch(source, /workspaceBillingEstimate|计费方案：|当前估算：/, '项目协作页仍依赖 Team billing 估算')
})

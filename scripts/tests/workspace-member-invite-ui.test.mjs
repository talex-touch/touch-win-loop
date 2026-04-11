import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const TARGET_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMainPanel.vue')
const MEMBERS_TAB_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceMembersTab.vue')
const INVITE_MODAL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceInviteModal.vue')
const SEAT_MODAL_FILE = resolve(process.cwd(), 'app/components/workspace/WorkspaceSeatModal.vue')

it('项目协作页将生成邀请链接入口放到头部，并切换到项目协作语义', async () => {
  const [mainPanelSource, membersTabSource] = await Promise.all([
    readFile(TARGET_FILE, 'utf8'),
    readFile(MEMBERS_TAB_FILE, 'utf8'),
  ])

  assert.doesNotMatch(membersTabSource, /当前账号角色/, '成员管理页仍展示当前账号角色卡片')
  assert.match(mainPanelSource, /<WorkspaceMembersTab/, '成员管理主面板未挂载协作成员子面板')
  assert.match(mainPanelSource, /@open-workspace-invite-modal="openWorkspaceInviteModal"/, '成员管理页头部未提供生成邀请链接入口')
  assert.match(membersTabSource, /生成邀请链接[\s\S]*刷新/, '成员管理页头部未将生成邀请链接按钮放在刷新左侧')
  assert.match(membersTabSource, /项目协作管理/, '成员管理页标题未改为项目协作管理')
  assert.match(membersTabSource, /项目成员（\{\{ props\.workspaceMembers\.length \}\}）/, '成员列表标题未切到项目成员语义')
})

it('项目协作邀请弹框展示加入空间与项目的说明，并使用项目角色', async () => {
  const [mainPanelSource, inviteModalSource] = await Promise.all([
    readFile(TARGET_FILE, 'utf8'),
    readFile(INVITE_MODAL_FILE, 'utf8'),
  ])

  assert.match(mainPanelSource, /<WorkspaceInviteModal/, '成员管理页未使用独立邀请弹框')
  assert.match(mainPanelSource, /:visible="workspaceInviteModalVisible"/, '成员管理页未绑定邀请弹框可见状态')
  assert.match(inviteModalSource, /接受邀请后会先加入当前空间，再加入当前项目。/, '邀请弹框缺少空间与项目联动说明')
  assert.match(inviteModalSource, /workspaceInviteProjectLabel/, '邀请弹框未展示当前项目归属说明')
  assert.match(inviteModalSource, /留空用户名 = 通用链接可多人加入；填写后仅指定账号可加入。/, '邀请弹框未明确区分通用链接与指定用户名邀请')
  assert.match(inviteModalSource, /<span class="block">项目角色<\/span>/, '邀请弹框未改为项目角色选择')
  assert.match(mainPanelSource, /const PROJECT_ROLE_OPTIONS: ProjectMemberRole\[\] = \['manager', 'editor', 'viewer'\]/, '邀请弹框未提供 manager\/editor\/viewer 项目角色')
  assert.match(inviteModalSource, /最新邀请链接|workspaceInvitationLink/, '邀请弹框未展示最新邀请链接区域')
  assert.match(inviteModalSource, /workspaceInvitationSubmitting[\s\S]*正在生成邀请链接，请稍候/, '邀请弹框未展示提交中反馈')
  assert.match(inviteModalSource, /workspaceInvitationError/, '邀请弹框未展示接口错误反馈')
  assert.match(mainPanelSource, /:workspace-invitation-error="workspaceInvitationError"/, '成员管理主面板未向邀请弹框透传错误状态')
})

it('项目协作页展示项目邀请与项目席位，而不是 Team billing', async () => {
  const [membersTabSource, seatModalSource] = await Promise.all([
    readFile(MEMBERS_TAB_FILE, 'utf8'),
    readFile(SEAT_MODAL_FILE, 'utf8'),
  ])

  assert.match(membersTabSource, /待处理邀请（\{\{ props\.workspaceInvitations\.length \}\}）/, '邀请列表标题未改为待处理邀请')
  assert.match(membersTabSource, /暂无待处理邀请。/, '邀请列表空态文案未同步更新')
  assert.match(membersTabSource, /workspaceInvitationScopeLabel\(invitation\)/, '邀请列表未展示项目归属说明')
  assert.match(membersTabSource, /项目席位概览/, '成员管理区未改为项目席位概览')
  assert.match(membersTabSource, /每个项目最多支持 15 个协作席位，接受邀请时会同时加入当前空间与项目。/, '项目席位说明未统一到每项目 15 席位规则')
  assert.match(seatModalSource, /:max="15"/, '项目席位输入框未限制最大 15')
  assert.match(seatModalSource, /每个项目最多支持 15 个协作席位。/, '项目席位表单未提供最大 15 的前端提示')
  assert.doesNotMatch(membersTabSource, /workspaceBillingEstimate|计费方案：|当前估算：/, '项目协作页仍依赖 Team billing 估算')
})

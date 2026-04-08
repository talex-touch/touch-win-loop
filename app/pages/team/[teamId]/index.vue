<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  Contest,
  PlatformPermission,
  Project,
  ProjectInvitationSummary,
  ProjectMemberManagementSnapshot,
  ProjectMemberRole,
  ProjectSettingsSnapshot,
  WorkspaceBillingEstimate,
  WorkspaceMemberRole,
  WorkspaceWithQuota,
} from '~~/shared/types/domain'
import type { TeamProjectCardItem } from '~/composables/team-ui'
import type { WorkspaceProjectCommonForm } from '~/types/workspace'
import { Message } from '@arco-design/web-vue'
import {
  buildProjectSettingsCommonPatch,
  cloneProjectCommonForm,
  createEmptyProjectCommonForm,
  createProjectCommonFormFromProject,
} from '~/composables/project-settings'
import {
  buildContestNameMap,
  buildTeamProjectCard,
  calculateRemainingProjectSlots,
  normalizeQueryValue,
  normalizeRouteParam,
  projectWorkspacePath,
  resolveProjectTeamId,
  resolveWorkspaceOptions,
  shouldOpenCreateDialog,
  teamDashboardPath,
  teamDetailPath,
} from '~/composables/team-ui'
import { writeActiveWorkspacePreference } from '~/composables/useActiveWorkspacePreference'

definePageMeta({
  layout: 'dashboard',
})

useHead({
  title: 'Team 项目台',
})

const WORKSPACE_CREATE_PROJECT_ROLES: WorkspaceMemberRole[] = ['owner', 'admin', 'manager']
const PROJECT_INVITE_ROLE_OPTIONS: ProjectMemberRole[] = ['manager', 'editor', 'viewer']
const PROJECT_MEMBER_EDIT_ROLES: Array<'manager' | 'editor' | 'viewer'> = ['manager', 'editor', 'viewer']

const runtime = useRuntimeConfig()
const { endpoint, resolveAppUrl } = useApiEndpoint(runtime)
const authApiFetch = useAuthApiFetch()
const route = useRoute()
const {
  feedFilter,
  quickActions: baseQuickActions,
  visibleInsights,
  visibleCompetitions,
  skillMetrics,
  scheduleItems,
  overviewLoading,
  overviewError,
  loadOverview,
} = useDashboardWorkspace()

const routeWorkspaceId = computed(() => {
  const params = route.params as Record<string, string | string[] | undefined>
  return normalizeRouteParam(params.workspaceId || params.teamId)
})

const loading = ref(false)
const errorText = ref('')
const noticeText = ref('')
const joinedNoticeText = ref('')
const me = ref<AuthMeResult | null>(null)
const projects = ref<Project[]>([])
const contests = ref<Contest[]>([])
const workspaceBillingEstimate = ref<WorkspaceBillingEstimate | null>(null)
const platformPermissions = ref<PlatformPermission[]>([])
const platformContests = ref<Contest[]>([])
const platformLoading = ref(false)
const platformError = ref('')

const createDialogVisible = ref(false)
const creatingProject = ref(false)
const createSubmittingMode = ref<'stay' | 'enter' | ''>('')
const createErrorText = ref('')
const createForm = reactive<WorkspaceProjectCommonForm & { contestIds: string[] }>({
  ...createEmptyProjectCommonForm(),
  contestIds: [] as string[],
})

const workspaceOptions = computed<WorkspaceWithQuota[]>(() => {
  return resolveWorkspaceOptions(me.value)
})

const activeWorkspace = computed(() => {
  const workspaceId = routeWorkspaceId.value
  if (!workspaceId)
    return null
  return workspaceOptions.value.find(item => item.workspace.id === workspaceId) || null
})

const activeWorkspaceId = computed(() => String(activeWorkspace.value?.workspace.id || '').trim())
const activeWorkspaceName = computed(() => {
  return String(activeWorkspace.value?.workspace.name || '').trim() || '当前项目台'
})
const createDialogTitle = computed(() => {
  return activeWorkspace.value?.workspace.type === 'team'
    ? `在「${activeWorkspaceName.value}」团队创建项目`
    : `在「${activeWorkspaceName.value}」项目台创建项目`
})
const createDialogHelperText = computed(() => {
  return activeWorkspace.value?.workspace.type === 'team'
    ? `新项目会创建到「${activeWorkspaceName.value}」团队下，创建后可继续补充竞赛绑定、图标与详细资料。`
    : `新项目会创建到「${activeWorkspaceName.value}」项目台下，创建后可继续补充竞赛绑定、图标与详细资料。`
})
const activeWorkspaceRoles = computed(() => activeWorkspace.value?.workspace.roles || [])
const canManageContest = computed(() => {
  return platformPermissions.value.some(item =>
    ['contest.read_internal', 'contest.write', 'contest.publish', 'contest.archive'].includes(item),
  )
})
const canManagePricing = computed(() => platformPermissions.value.includes('pricing.write'))
const canManageRoles = computed(() => platformPermissions.value.includes('role.assign'))
const hasPlatformPortal = computed(() => canManageContest.value || canManagePricing.value || canManageRoles.value)
const workspaceCanCreateProject = computed(() => {
  if (me.value?.user.isPlatformAdmin)
    return true
  return activeWorkspaceRoles.value.some(role => WORKSPACE_CREATE_PROJECT_ROLES.includes(role))
})
const canManageProjectActions = computed(() => workspaceCanCreateProject.value)
const canManageProjectMembers = computed(() => canManageProjectActions.value)
const canEditProjectMembers = computed(() => {
  if (me.value?.user.isPlatformAdmin)
    return true
  return activeWorkspaceRoles.value.includes('owner') || activeWorkspaceRoles.value.includes('admin')
})

const contestNameMap = computed(() => buildContestNameMap(contests.value))

const projectCards = computed<TeamProjectCardItem[]>(() => {
  const workspaceId = activeWorkspaceId.value
  if (!workspaceId)
    return []

  return projects.value
    .filter(item => resolveProjectTeamId(item) === workspaceId)
    .map(item => buildTeamProjectCard(item, contestNameMap.value, activeWorkspace.value || undefined))
})

const remainingProjectSlots = computed(() => {
  return calculateRemainingProjectSlots({
    projectsUnlimited: workspaceBillingEstimate.value?.projectsUnlimited,
    includedProjects: workspaceBillingEstimate.value?.includedProjects,
    extraProjectSlots: workspaceBillingEstimate.value?.extraProjectSlots,
    projectCount: workspaceBillingEstimate.value?.projectCount,
  })
})
const createDisabledReason = computed(() => {
  if (!activeWorkspaceId.value)
    return '当前 Team 项目台不可用。'
  if (!workspaceCanCreateProject.value)
    return '当前为只读成员，不能新建项目。'
  if (workspaceBillingEstimate.value && remainingProjectSlots.value === 0)
    return '当前项目台项目数量已达上限，请先扩容项目配额。'
  return ''
})
const activeNoticeText = computed(() => {
  return joinedNoticeText.value || noticeText.value
})
const activeNoticeTone = computed<'success' | 'warning'>(() => {
  if (joinedNoticeText.value)
    return 'success'
  return 'warning'
})
const portalCards = computed(() => {
  const cards: Array<{ id: string, title: string, desc: string, to: string, icon: string }> = [
    {
      id: 'contest-library',
      title: '竞赛总库',
      desc: '搜索筛选竞赛，查看详情、赛道与评分规则。',
      to: '/contests',
      icon: 'trophy',
    },
    {
      id: 'resource-center',
      title: '资料中心',
      desc: '按分类/年份/可访问性检索权威资料。',
      to: '/resources',
      icon: 'folder_open',
    },
  ]

  if (canManageContest.value) {
    cards.push({
      id: 'contest-admin',
      title: '赛事录入台',
      desc: '录入赛事、赛道、时间轴、Rubric 与资料并发布。',
      to: '/admin/contests',
      icon: 'edit_square',
    })
  }
  if (canManagePricing.value) {
    cards.push({
      id: 'pricing-admin',
      title: '套餐席位计费',
      desc: '维护套餐规则，按席位估算工作区费用。',
      to: '/admin/billing',
      icon: 'attach_money',
    })
  }
  if (canManageRoles.value) {
    cards.push({
      id: 'role-admin',
      title: '平台角色分配',
      desc: '给用户分配 contest_admin / pricing_admin 等角色。',
      to: '/admin/roles',
      icon: 'manage_accounts',
    })
  }

  return cards
})
const teamQuickActions = computed(() => {
  const createTarget = activeWorkspaceId.value
    ? `${teamDetailPath(activeWorkspaceId.value)}?create=1`
    : '/team?create=1'

  const items = baseQuickActions.map((item) => {
    if (item.id !== 'report')
      return item
    return {
      ...item,
      to: createTarget,
    }
  })

  if (canManageContest.value) {
    items.push({
      id: 'admin-contests',
      label: '赛事录入',
      icon: 'edit_note',
      to: '/admin/contests',
    })
  }
  if (canManagePricing.value) {
    items.push({
      id: 'admin-billing',
      label: '席位计费',
      icon: 'payments',
      to: '/admin/billing',
    })
  }

  return items
})
const projectDetailDialogVisible = ref(false)
const projectProfileDialogVisible = ref(false)
const projectMembersDialogVisible = ref(false)
const actionProjectId = ref('')
const projectMembersLoading = ref(false)
const projectMembersErrorText = ref('')
const projectMembersSnapshot = ref<ProjectMemberManagementSnapshot | null>(null)
const projectMemberRoleUpdatingUserId = ref('')
const projectMemberRemovingUserId = ref('')
const projectMemberActionText = ref('')
const projectMemberActionError = ref(false)
const projectProfileForm = reactive<WorkspaceProjectCommonForm>(createEmptyProjectCommonForm())
const projectProfileSaving = ref(false)
const projectInvitationSubmitting = ref(false)
const projectInvitationLink = ref('')
const projectInvitationFeedbackText = ref('')
const projectMemberRoleDraftMap = reactive<Record<string, 'manager' | 'editor' | 'viewer'>>({})
const projectInvitationForm = reactive<{
  inviteeUsername: string
  role: ProjectMemberRole
  expiresInDays: number
}>({
  inviteeUsername: '',
  role: 'viewer',
  expiresInDays: 7,
})

const actionProject = computed(() => {
  if (!actionProjectId.value)
    return null
  return projects.value.find(item => item.id === actionProjectId.value) || null
})
const actionProjectCard = computed(() => {
  if (!actionProjectId.value)
    return null
  return projectCards.value.find(item => item.id === actionProjectId.value) || null
})
const projectDetailRows = computed(() => {
  const project = actionProject.value
  const card = actionProjectCard.value
  if (!project || !card)
    return []

  const advisors = project.advisorBindings.map(item => item.username).filter(Boolean)
  const colleges = project.collegeBindings.map(item => item.collegeName).filter(Boolean)

  return [
    { label: '项目 ID', value: project.id },
    { label: 'Team ID', value: String(project.teamId || project.workspaceId || '-').trim() || '-' },
    { label: '状态', value: projectStatusLabel(project.status) },
    { label: '来源', value: projectSourceLabel(project.source) },
    { label: '关联竞赛', value: card.contestNames.length > 0 ? card.contestNames.join(' / ') : '未绑定竞赛' },
    { label: '项目席位', value: card.projectSeatLimit ? `${card.projectSeatUsed}/${card.projectSeatLimit}` : '未配置' },
    { label: '项目图标', value: project.display?.icon || card.displayIcon },
    { label: '主题颜色', value: project.display?.accentColor || '自动生成' },
    { label: '指导老师', value: advisors.length > 0 ? advisors.join(' / ') : '未配置' },
    { label: '学院绑定', value: colleges.length > 0 ? colleges.join(' / ') : '未配置' },
    { label: '创建时间', value: project.createdAt || '-' },
    { label: '最近更新', value: project.updatedAt || '-' },
  ]
})
const projectMemberList = computed(() => projectMembersSnapshot.value?.members || [])
const projectInvitationList = computed(() => projectMembersSnapshot.value?.invitations || [])
const projectMemberSeatSummary = computed(() => {
  const seatQuota = projectMembersSnapshot.value?.seatQuota
  if (seatQuota)
    return `${seatQuota.seatUsed}/${seatQuota.seatLimit}`

  const card = actionProjectCard.value
  if (card?.projectSeatLimit)
    return `${card.projectSeatUsed}/${card.projectSeatLimit}`

  return '未配置'
})
const projectInviteRoleOptions = computed<ProjectMemberRole[]>(() => {
  if (canEditProjectMembers.value)
    return PROJECT_INVITE_ROLE_OPTIONS
  if (canManageProjectMembers.value)
    return ['viewer']
  return ['viewer']
})
const canSubmitProjectInvitation = computed(() => {
  return Boolean(actionProjectId.value) && canManageProjectMembers.value && !projectInvitationSubmitting.value
})

function projectStatusLabel(status: Project['status']): string {
  if (status === 'in_progress')
    return '进行中'
  if (status === 'completed')
    return '已完成'
  return '草稿'
}

function projectSourceLabel(source: Project['source']): string {
  if (source === 'chat')
    return 'Loopy 对话创建'
  return '表单创建'
}

function projectMemberRoleLabel(role: ProjectMemberRole): string {
  if (role === 'owner')
    return '所有者'
  if (role === 'manager')
    return '管理者'
  if (role === 'editor')
    return '编辑者'
  return '查看者'
}

function projectInvitationStatusLabel(invitation: ProjectInvitationSummary): string {
  if (String(invitation.acceptedAt || '').trim())
    return '已接受'
  if (invitation.isExpired)
    return '已过期'
  return '待接受'
}

function projectInvitationStatusClass(invitation: ProjectInvitationSummary): string {
  if (String(invitation.acceptedAt || '').trim())
    return 'text-emerald-700 border-emerald-200 bg-emerald-50'
  if (invitation.isExpired)
    return 'text-rose-600 border-rose-200 bg-rose-50'
  return 'text-blue-700 border-blue-200 bg-blue-50'
}

function ensureProjectMemberRoleDraft(member: { userId: string, role: ProjectMemberRole }): 'manager' | 'editor' | 'viewer' {
  const userId = String(member.userId || '').trim()
  const fallback = member.role === 'manager' || member.role === 'editor' ? member.role : 'viewer'
  if (!userId)
    return fallback

  const current = projectMemberRoleDraftMap[userId]
  if (current === 'manager' || current === 'editor' || current === 'viewer')
    return current

  projectMemberRoleDraftMap[userId] = fallback
  return fallback
}

function canEditProjectMember(member: { role: ProjectMemberRole }): boolean {
  return canEditProjectMembers.value && member.role !== 'owner'
}

function canRemoveProjectMember(member: { role: ProjectMemberRole }): boolean {
  if (!canManageProjectMembers.value)
    return false
  if (member.role === 'owner')
    return false
  if (canEditProjectMembers.value)
    return true
  return member.role === 'viewer'
}

watchEffect(() => {
  if (!projectInviteRoleOptions.value.includes(projectInvitationForm.role))
    projectInvitationForm.role = 'viewer'
})

watch(projectMemberList, (members) => {
  const activeUserIdSet = new Set((members || []).map(item => String(item.userId || '').trim()).filter(Boolean))
  for (const member of members || []) {
    if (member.role === 'owner')
      continue
    ensureProjectMemberRoleDraft(member)
  }
  for (const userId of Object.keys(projectMemberRoleDraftMap)) {
    if (!activeUserIdSet.has(userId))
      delete projectMemberRoleDraftMap[userId]
  }
}, { deep: true, immediate: true })

function resolveProjectInvitationUrl(token: string): string {
  const normalizedToken = String(token || '').trim()
  if (!normalizedToken)
    return ''
  return resolveAppUrl(`/invite/${encodeURIComponent(normalizedToken)}`)
}

function syncProjectProfileForm(project: Project | null) {
  Object.assign(projectProfileForm, createProjectCommonFormFromProject(project))
}

function updateProjectProfileForm(next: WorkspaceProjectCommonForm) {
  Object.assign(projectProfileForm, cloneProjectCommonForm(next))
}

function mergeProjectIntoList(project: Project) {
  const index = projects.value.findIndex(item => item.id === project.id)
  if (index === -1) {
    projects.value = [...projects.value, project]
    return
  }

  projects.value = projects.value.map(item => item.id === project.id ? project : item)
}

function syncActionProjectState() {
  if (projectDetailDialogVisible.value || projectProfileDialogVisible.value || projectMembersDialogVisible.value)
    return

  actionProjectId.value = ''
  syncProjectProfileForm(null)
  projectProfileSaving.value = false
  projectMembersLoading.value = false
  projectMembersErrorText.value = ''
  projectMembersSnapshot.value = null
  projectMemberRoleUpdatingUserId.value = ''
  projectMemberRemovingUserId.value = ''
  projectMemberActionText.value = ''
  projectMemberActionError.value = false
  projectInvitationSubmitting.value = false
  projectInvitationLink.value = ''
  projectInvitationFeedbackText.value = ''
  projectInvitationForm.inviteeUsername = ''
  projectInvitationForm.role = 'viewer'
  projectInvitationForm.expiresInDays = 7
}

function openProjectDetailDialog(projectId: string) {
  actionProjectId.value = projectId
  projectProfileDialogVisible.value = false
  projectMembersDialogVisible.value = false
  projectDetailDialogVisible.value = true
}

function closeProjectDetailDialog() {
  projectDetailDialogVisible.value = false
  syncActionProjectState()
}

function openProjectProfileDialog(projectId: string) {
  actionProjectId.value = projectId
  projectDetailDialogVisible.value = false
  projectMembersDialogVisible.value = false
  syncProjectProfileForm(projects.value.find(item => item.id === projectId) || null)
  projectProfileSaving.value = false
  projectProfileDialogVisible.value = true
}

function closeProjectProfileDialog() {
  projectProfileDialogVisible.value = false
  syncActionProjectState()
}

async function saveProjectProfileSettings() {
  const projectId = String(actionProjectId.value || '').trim()
  if (!projectId || !canManageProjectActions.value || projectProfileSaving.value)
    return

  projectProfileSaving.value = true

  try {
    const response = await $fetch<ApiResponse<ProjectSettingsSnapshot>>(endpoint(`/projects/${projectId}/settings`), {
      method: 'PATCH',
      body: {
        common: buildProjectSettingsCommonPatch(projectProfileForm),
      },
    })

    mergeProjectIntoList(response.data.project)
    if (actionProjectId.value === projectId && projectProfileDialogVisible.value)
      syncProjectProfileForm(response.data.project)
    Message.success('项目设置已保存。')
  }
  catch (error: any) {
    Message.error(String(error?.data?.message || '保存项目设置失败，请稍后重试。'))
  }
  finally {
    projectProfileSaving.value = false
  }
}

async function openProjectMembersDialog(projectId: string) {
  actionProjectId.value = projectId
  projectDetailDialogVisible.value = false
  projectProfileDialogVisible.value = false
  projectMembersDialogVisible.value = true
  projectMembersLoading.value = true
  projectMembersErrorText.value = ''
  projectMembersSnapshot.value = null

  try {
    const response = await $fetch<ApiResponse<ProjectMemberManagementSnapshot>>(endpoint(`/projects/${projectId}/members`))
    if (actionProjectId.value !== projectId || !projectMembersDialogVisible.value)
      return

    projectMembersSnapshot.value = response.data
  }
  catch (error: any) {
    if (actionProjectId.value !== projectId)
      return

    projectMembersErrorText.value = String(error?.data?.message || '成员信息加载失败，请稍后重试。')
  }
  finally {
    if (actionProjectId.value === projectId)
      projectMembersLoading.value = false
  }
}

function closeProjectMembersDialog() {
  projectMembersDialogVisible.value = false
  syncActionProjectState()
}

async function createProjectInvitation() {
  const projectId = String(actionProjectId.value || '').trim()
  if (!projectId || !canManageProjectMembers.value)
    return

  projectInvitationSubmitting.value = true
  projectInvitationFeedbackText.value = ''

  try {
    const response = await $fetch<ApiResponse<{ token: string, snapshot: ProjectMemberManagementSnapshot }>>(endpoint(`/projects/${projectId}/invitations`), {
      method: 'POST',
      body: {
        inviteeUsername: String(projectInvitationForm.inviteeUsername || '').trim() || undefined,
        projectRole: projectInvitationForm.role,
        expiresInDays: Math.max(1, Math.min(30, Number(projectInvitationForm.expiresInDays || 7))),
      },
    })

    projectInvitationLink.value = resolveProjectInvitationUrl(response.data.token)
    projectMembersSnapshot.value = response.data.snapshot
    projectInvitationFeedbackText.value = '邀请链接已生成，可直接复制发送给协作者。'
    projectInvitationForm.inviteeUsername = ''
  }
  catch (error: any) {
    projectInvitationFeedbackText.value = String(error?.data?.message || '创建邀请链接失败，请稍后重试。')
  }
  finally {
    projectInvitationSubmitting.value = false
  }
}

async function submitProjectMemberRole(member: { userId: string, role: ProjectMemberRole }) {
  const projectId = String(actionProjectId.value || '').trim()
  const userId = String(member.userId || '').trim()
  if (!projectId || !userId || !canEditProjectMember(member))
    return

  const nextRole = ensureProjectMemberRoleDraft(member)
  if (nextRole === member.role) {
    projectMemberActionText.value = '项目角色未发生变化。'
    projectMemberActionError.value = false
    return
  }

  projectMemberRoleUpdatingUserId.value = userId
  projectMemberActionText.value = ''

  try {
    const response = await $fetch<ApiResponse<ProjectMemberManagementSnapshot>>(endpoint(`/projects/${projectId}/members`), {
      method: 'POST',
      body: {
        userId,
        role: nextRole,
      },
    })

    projectMembersSnapshot.value = response.data
    projectMemberActionText.value = '成员项目角色已更新。'
    projectMemberActionError.value = false
  }
  catch (error: any) {
    projectMemberActionText.value = String(error?.data?.message || '更新成员项目角色失败，请稍后重试。')
    projectMemberActionError.value = true
  }
  finally {
    if (projectMemberRoleUpdatingUserId.value === userId)
      projectMemberRoleUpdatingUserId.value = ''
  }
}

async function removeProjectMember(userId: string) {
  const projectId = String(actionProjectId.value || '').trim()
  const normalizedUserId = String(userId || '').trim()
  const member = projectMemberList.value.find(item => item.userId === normalizedUserId)
  if (!projectId || !normalizedUserId || !member || !canRemoveProjectMember(member))
    return

  projectMemberRemovingUserId.value = normalizedUserId
  projectMemberActionText.value = ''

  try {
    const response = await $fetch<ApiResponse<ProjectMemberManagementSnapshot>>(endpoint(`/projects/${projectId}/members/${normalizedUserId}`), {
      method: 'DELETE',
    })

    projectMembersSnapshot.value = response.data
    projectMemberActionText.value = '项目成员已移除。'
    projectMemberActionError.value = false
  }
  catch (error: any) {
    projectMemberActionText.value = String(error?.data?.message || '移除项目成员失败，请稍后重试。')
    projectMemberActionError.value = true
  }
  finally {
    if (projectMemberRemovingUserId.value === normalizedUserId)
      projectMemberRemovingUserId.value = ''
  }
}

async function copyProjectInvitationLink() {
  const link = String(projectInvitationLink.value || '').trim()
  if (!link)
    return

  if (!import.meta.client || !navigator.clipboard?.writeText) {
    projectInvitationFeedbackText.value = '当前环境不支持自动复制，请手动复制邀请链接。'
    return
  }

  try {
    await navigator.clipboard.writeText(link)
    projectInvitationFeedbackText.value = '邀请链接已复制。'
  }
  catch {
    projectInvitationFeedbackText.value = '复制失败，请手动复制邀请链接。'
  }
}

function openCreateDialog() {
  if (createDisabledReason.value) {
    noticeText.value = createDisabledReason.value
    return
  }

  createErrorText.value = ''
  createDialogVisible.value = true
}

function closeCreateDialog() {
  if (creatingProject.value)
    return
  createErrorText.value = ''
  createDialogVisible.value = false
}

function openProject(project: TeamProjectCardItem) {
  void openProjectWorkspace(project)
}

async function openProjectWorkspace(project: TeamProjectCardItem) {
  const workspaceId = activeWorkspaceId.value
  const projectId = String(project.id || '').trim()
  if (!workspaceId || !projectId)
    return
  writeActiveWorkspacePreference(workspaceId)
  await navigateTo(projectWorkspacePath(workspaceId, projectId))
}

function handleProjectAction(payload: {
  action: 'archive' | 'details' | 'members' | 'settings'
  project: TeamProjectCardItem
}) {
  if (payload.action === 'details') {
    openProjectDetailDialog(payload.project.id)
    return
  }
  if (!canManageProjectActions.value)
    return
  if (payload.action === 'settings') {
    openProjectProfileDialog(payload.project.id)
    return
  }
  if (payload.action === 'members') {
    void openProjectMembersDialog(payload.project.id)
    return
  }

  noticeText.value = `项目“${payload.project.title}”的归档功能即将支持。`
}

function updateCreateForm(next: WorkspaceProjectCommonForm) {
  Object.assign(createForm, cloneProjectCommonForm(next))
}

function resetCreateForm() {
  Object.assign(createForm, {
    ...createEmptyProjectCommonForm(),
    contestIds: [],
  })
}

async function submitQuickCreate(mode: 'stay' | 'enter') {
  const workspaceId = activeWorkspaceId.value
  const title = createForm.title.trim()
  const summary = createForm.summary.trim()
  const contestIds = createForm.contestIds
  const icon = createForm.icon.trim()
  const accentColor = createForm.accentColor.trim()

  if (!workspaceId || !title) {
    createErrorText.value = '请填写项目名称。'
    return
  }

  if (createDisabledReason.value) {
    createErrorText.value = createDisabledReason.value
    return
  }

  creatingProject.value = true
  createSubmittingMode.value = mode
  createErrorText.value = ''

  try {
    const response = await $fetch<ApiResponse<Project>>(endpoint('/projects/quick'), {
      method: 'POST',
      body: {
        teamId: workspaceId,
        workspaceId,
        title,
        summary,
        contestIds,
        icon: icon || undefined,
        accentColor: accentColor || undefined,
      },
    })

    const created = response.data
    const createdWorkspaceId = String(created.teamId || created.workspaceId || '').trim() || workspaceId

    mergeProjectIntoList(created)
    resetCreateForm()
    createDialogVisible.value = false

    if (mode === 'stay') {
      Message.success('项目已创建。')
      return
    }

    Message.success('项目已创建，正在进入项目工作区。')
    writeActiveWorkspacePreference(createdWorkspaceId)

    await navigateTo(projectWorkspacePath(createdWorkspaceId, created.id))
  }
  catch (error: any) {
    createErrorText.value = String(error?.data?.message || '创建项目失败，请稍后重试。')
  }
  finally {
    creatingProject.value = false
    createSubmittingMode.value = ''
  }
}

async function loadWorkspaceBillingEstimate(workspaceId: string) {
  try {
    const response = await $fetch<ApiResponse<WorkspaceBillingEstimate>>(endpoint(`/teams/${workspaceId}/billing/estimate`))
    if (activeWorkspaceId.value !== workspaceId)
      return
    workspaceBillingEstimate.value = response.data
  }
  catch {
    if (activeWorkspaceId.value === workspaceId)
      workspaceBillingEstimate.value = null
  }
}

async function loadPlatformPanel(auth: AuthMeResult) {
  platformLoading.value = true
  platformError.value = ''

  try {
    platformPermissions.value = auth.user.platformPermissions || []

    if (canManageContest.value) {
      const adminContestsResponse = await $fetch<ApiResponse<Contest[]>>(endpoint('/admin/contests'))
      platformContests.value = adminContestsResponse.data.slice(0, 5)
      return
    }

    const contestsResponse = await $fetch<ApiResponse<Contest[]>>(endpoint('/contests'), {
      query: {
        page: 1,
        pageSize: 5,
        sort: 'deadline',
      },
    })
    platformContests.value = contestsResponse.data
  }
  catch (error: any) {
    platformContests.value = []
    platformPermissions.value = auth.user.platformPermissions || []
    platformError.value = String(error?.data?.message || '平台能力区加载失败，请稍后重试。')
  }
  finally {
    platformLoading.value = false
  }
}

async function loadWorkspaceDashboard() {
  const workspaceId = routeWorkspaceId.value
  if (!workspaceId) {
    await navigateTo(teamDashboardPath(), { replace: true })
    return
  }

  loading.value = true
  errorText.value = ''

  try {
    const meResponse = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
    me.value = meResponse.data

    const canAccess = resolveWorkspaceOptions(meResponse.data).some(item => item.workspace.id === workspaceId)
    if (!canAccess) {
      await navigateTo({
        path: teamDashboardPath(),
        query: { deniedWorkspaceId: workspaceId },
      }, { replace: true })
      return
    }

    writeActiveWorkspacePreference(workspaceId)

    const [projectsResponse, contestsResponse] = await Promise.all([
      $fetch<ApiResponse<Project[]>>(endpoint('/projects'), {
        query: {
          teamId: workspaceId,
          workspaceId,
        },
      }),
      $fetch<ApiResponse<Contest[]>>(endpoint('/contests')),
    ])

    projects.value = projectsResponse.data
    contests.value = contestsResponse.data

    await Promise.all([
      loadWorkspaceBillingEstimate(workspaceId),
      loadOverview(),
      loadPlatformPanel(meResponse.data),
    ])

    const legacyProjectId = normalizeQueryValue(route.query.projectId)
    if (legacyProjectId) {
      await navigateTo(projectWorkspacePath(workspaceId, legacyProjectId), { replace: true })
    }
  }
  catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status)
    if (statusCode === 401) {
      await navigateTo({
        path: '/login',
        query: { redirect: route.fullPath || teamDashboardPath() },
      })
      return
    }

    errorText.value = String(error?.data?.message || '项目台加载失败，请稍后重试。')
    projects.value = []
    contests.value = []
    workspaceBillingEstimate.value = null
    platformPermissions.value = []
    platformContests.value = []
  }
  finally {
    loading.value = false
  }
}

async function consumeJoinedNotice() {
  if (!shouldOpenCreateDialog(route.query.joined))
    return

  joinedNoticeText.value = '你已加入当前 Team，可直接查看项目。'

  const nextQuery: Record<string, string> = {}
  for (const [key, value] of Object.entries(route.query)) {
    if (key === 'joined')
      continue

    const normalized = normalizeQueryValue(value)
    if (normalized)
      nextQuery[key] = normalized
  }

  await navigateTo({
    path: teamDetailPath(routeWorkspaceId.value),
    query: Object.keys(nextQuery).length > 0 ? nextQuery : undefined,
  }, { replace: true })
}

onMounted(async () => {
  const deniedWorkspaceId = normalizeQueryValue(route.query.deniedWorkspaceId || route.query.deniedTeamId)
  if (deniedWorkspaceId)
    noticeText.value = `无权访问 Team ${deniedWorkspaceId}。`

  await loadWorkspaceDashboard()
  await consumeJoinedNotice()

  if (shouldOpenCreateDialog(route.query.create))
    openCreateDialog()
})
</script>

<template>
  <div class="space-y-6">
    <DashboardOverviewShell
      :title="activeWorkspace?.workspace.name || 'Team 项目台'"
      description="当前 Team 的项目与配额概览。"
      :notice-text="activeNoticeText"
      :notice-tone="activeNoticeTone"
      :loading="loading"
      :error-text="errorText"
      primary-action-label="新建项目"
      :primary-action-disabled="Boolean(createDisabledReason)"
      primary-action-test-id="team-dashboard-create-project-button"
      empty-action-test-id="team-dashboard-empty-create-project-button"
      overview-section-test-id="team-dashboard-overview"
      notice-test-id="team-dashboard-notice"
      loading-key-prefix="workspace-project-skeleton"
      @primary-action="openCreateDialog"
      @retry="loadWorkspaceDashboard"
    >
      <TeamProjectOverview
        :projects="projectCards"
        :can-manage-actions="canManageProjectActions"
        @open-project="openProject"
        @project-action="handleProjectAction"
      />
    </DashboardOverviewShell>

    <section class="gap-8 grid grid-cols-12" data-testid="team-dashboard-integrated-panels">
      <div class="col-span-12 space-y-8 lg:col-span-8">
        <DashboardPlatformPanel
          :portal-cards="portalCards"
          :platform-contests="platformContests"
          :platform-permissions="platformPermissions"
          :platform-loading="platformLoading"
          :platform-error="platformError"
          :has-platform-portal="hasPlatformPortal"
        />

        <div v-if="overviewError" class="text-sm text-rose-600 p-4 border border-rose-200 rounded-2xl bg-rose-50">
          {{ overviewError }}
        </div>

        <div v-else-if="overviewLoading" class="gap-4 grid grid-cols-1 md:grid-cols-2">
          <div
            v-for="index in 4"
            :key="`team-dashboard-overview-skeleton-${index}`"
            class="border border-slate-200 rounded-2xl bg-white h-48 animate-pulse"
          />
        </div>

        <template v-else>
          <DashboardInsights
            :insights="visibleInsights"
            :more-to="activeWorkspaceId ? teamDetailPath(activeWorkspaceId) : '/team'"
          />
          <DashboardCompetitionFeed
            v-model:active-filter="feedFilter"
            :competitions="visibleCompetitions"
          />
        </template>
      </div>

      <div class="col-span-12 lg:col-span-4">
        <DashboardRightRail
          :quick-actions="teamQuickActions"
          :skill-metrics="skillMetrics"
          :schedule-items="scheduleItems"
        />
      </div>
    </section>

    <TeamCreateProjectDialog
      :visible="createDialogVisible"
      :dialog-title="createDialogTitle"
      :helper-text="createDialogHelperText"
      :model-value="createForm"
      :contest-ids="createForm.contestIds"
      :contests="contests"
      :error-text="createErrorText"
      :submitting="creatingProject"
      :submitting-mode="createSubmittingMode"
      @close="closeCreateDialog"
      @submit="submitQuickCreate"
      @update:model-value="updateCreateForm"
      @update:contest-ids="createForm.contestIds = $event"
    />

    <a-modal
      v-model:visible="projectDetailDialogVisible"
      title="详细信息"
      data-testid="team-project-detail-modal"
      width="620px"
      :footer="false"
      :esc-to-close="true"
      :mask-closable="true"
      @cancel="closeProjectDetailDialog"
    >
      <div class="space-y-4">
        <div class="flex gap-3 items-start">
          <div
            class="rounded-2xl flex shrink-0 h-11 w-11 items-center justify-center"
            :style="{
              color: actionProjectCard?.accentText || '#334155',
              backgroundColor: actionProjectCard?.accentSoft || '#f1f5f9',
            }"
          >
            <span class="material-symbols-outlined text-[20px]">{{ actionProjectCard?.displayIcon || 'folder' }}</span>
          </div>
          <div class="min-w-0">
            <div class="text-sm text-slate-900 font-semibold truncate">
              {{ actionProject?.title || '项目信息' }}
            </div>
            <div class="text-xs text-slate-500 mt-1">
              {{ actionProject?.summary || actionProject?.problemStatement || '当前项目暂无补充说明。' }}
            </div>
          </div>
        </div>

        <a-descriptions :column="1" bordered size="small">
          <a-descriptions-item v-for="item in projectDetailRows" :key="item.label" :label="item.label">
            <span class="text-xs text-slate-700 break-all">{{ item.value }}</span>
          </a-descriptions-item>
        </a-descriptions>

        <div class="flex justify-end">
          <a-button size="small" @click="closeProjectDetailDialog">
            关闭
          </a-button>
        </div>
      </div>
    </a-modal>

    <a-modal
      v-model:visible="projectProfileDialogVisible"
      title="项目设置"
      data-testid="team-project-settings-modal"
      width="720px"
      :footer="false"
      :esc-to-close="true"
      :mask-closable="true"
      @cancel="closeProjectProfileDialog"
    >
      <div class="space-y-4">
        <ProjectBasicSettingsEditor
          :model-value="projectProfileForm"
          :project="actionProject"
          :disabled="projectProfileSaving || !canManageProjectActions"
          @update:model-value="updateProjectProfileForm"
        />

        <div
          v-if="actionProjectCard && actionProjectCard.contestNames.length > 0"
          class="flex flex-wrap gap-2"
        >
          <span
            v-for="contestName in actionProjectCard.contestNames"
            :key="`${actionProjectCard.id}-${contestName}`"
            class="text-[10px] text-slate-600 font-medium px-2 py-1 rounded-full bg-slate-100"
          >
            {{ contestName }}
          </span>
        </div>

        <div class="flex gap-2 justify-end">
          <a-button size="small" @click="closeProjectProfileDialog">
            取消
          </a-button>
          <a-button
            size="small"
            type="primary"
            data-testid="team-project-settings-save-button"
            :loading="projectProfileSaving"
            :disabled="!canManageProjectActions"
            @click="saveProjectProfileSettings"
          >
            保存
          </a-button>
        </div>
      </div>
    </a-modal>

    <a-modal
      v-model:visible="projectMembersDialogVisible"
      title="成员管理"
      data-testid="team-project-members-modal"
      width="680px"
      :footer="false"
      :esc-to-close="true"
      :mask-closable="true"
      @cancel="closeProjectMembersDialog"
    >
      <div class="space-y-4">
        <div class="gap-2 grid grid-cols-3">
          <div class="p-3 border border-slate-200 rounded-2xl bg-slate-50">
            <div class="text-[11px] text-slate-500">
              当前成员
            </div>
            <div class="text-sm text-slate-900 font-semibold mt-1">
              {{ projectMemberList.length }} 人
            </div>
          </div>
          <div class="p-3 border border-slate-200 rounded-2xl bg-slate-50">
            <div class="text-[11px] text-slate-500">
              邀请记录
            </div>
            <div class="text-sm text-slate-900 font-semibold mt-1">
              {{ projectInvitationList.length }} 条
            </div>
          </div>
          <div class="p-3 border border-slate-200 rounded-2xl bg-slate-50">
            <div class="text-[11px] text-slate-500">
              项目席位
            </div>
            <div class="text-sm text-slate-900 font-semibold mt-1">
              {{ projectMemberSeatSummary }}
            </div>
          </div>
        </div>

        <section class="space-y-3">
          <div class="flex gap-2 items-center justify-between">
            <div class="text-xs text-slate-500 font-medium">
              创建邀请链接
            </div>
            <span class="text-[11px] text-slate-400">
              留空用户名 = 通用链接可多人加入；填写后仅指定账号可加入
            </span>
          </div>

          <div class="p-3 border border-slate-200 rounded-2xl bg-slate-50/80 space-y-3">
            <label class="text-[11px] text-slate-600 block space-y-1">
              <span class="block">邀请用户名（可选）</span>
              <input
                v-model="projectInvitationForm.inviteeUsername"
                data-testid="team-project-invite-username-input"
                class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
                placeholder="留空则生成可多人加入的通用邀请链接"
              >
            </label>

            <div class="gap-2 grid grid-cols-2">
              <label class="text-[11px] text-slate-600 block space-y-1">
                <span class="block">项目角色</span>
                <select
                  v-model="projectInvitationForm.role"
                  data-testid="team-project-invite-role-select"
                  class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
                >
                  <option
                    v-for="role in projectInviteRoleOptions"
                    :key="`team-project-role-option-${role}`"
                    :value="role"
                  >
                    {{ projectMemberRoleLabel(role) }}
                  </option>
                </select>
              </label>

              <label class="text-[11px] text-slate-600 block space-y-1">
                <span class="block">有效期</span>
                <select
                  v-model.number="projectInvitationForm.expiresInDays"
                  data-testid="team-project-invite-expiry-select"
                  class="text-xs px-2 outline-none border border-slate-200 rounded bg-white h-8 w-full focus:border-blue-500"
                >
                  <option :value="1">
                    1 天
                  </option>
                  <option :value="3">
                    3 天
                  </option>
                  <option :value="7">
                    7 天
                  </option>
                  <option :value="14">
                    14 天
                  </option>
                  <option :value="30">
                    30 天
                  </option>
                </select>
              </label>
            </div>

            <div
              v-if="projectInvitationLink"
              class="p-3 border border-slate-200 rounded-2xl bg-white"
            >
              <div class="text-[11px] text-slate-500">
                最新邀请链接
              </div>
              <div
                data-testid="team-project-invite-link"
                class="text-[11px] text-slate-700 mt-2 break-all"
              >
                {{ projectInvitationLink }}
              </div>
              <div class="mt-3 flex justify-end">
                <a-button
                  size="small"
                  data-testid="team-project-invite-copy-link-button"
                  @click="copyProjectInvitationLink"
                >
                  复制邀请链接
                </a-button>
              </div>
            </div>

            <div
              v-if="projectInvitationFeedbackText"
              class="text-[11px] px-3 py-2 rounded-xl"
              :class="projectInvitationLink ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'"
            >
              {{ projectInvitationFeedbackText }}
            </div>

            <div class="flex justify-end">
              <a-button
                size="small"
                type="primary"
                data-testid="team-project-invite-submit-button"
                :loading="projectInvitationSubmitting"
                :disabled="!canSubmitProjectInvitation"
                @click="createProjectInvitation"
              >
                生成邀请链接
              </a-button>
            </div>
          </div>
        </section>

        <div
          v-if="projectMembersLoading"
          class="text-xs text-slate-500 p-4 border border-slate-200 rounded-2xl bg-slate-50"
        >
          正在加载成员信息...
        </div>

        <div
          v-else-if="projectMembersErrorText"
          class="text-xs text-rose-600 p-4 border border-rose-200 rounded-2xl bg-rose-50"
        >
          {{ projectMembersErrorText }}
        </div>

        <template v-else>
          <section class="space-y-2">
            <div class="flex gap-2 items-center justify-between">
              <div class="text-xs text-slate-500 font-medium">
                当前成员
              </div>
              <span
                v-if="canEditProjectMembers"
                class="text-[11px] text-slate-400"
              >
                可直接调整成员项目角色
              </span>
            </div>
            <div
              v-if="projectMemberActionText"
              class="text-[11px] px-3 py-2 rounded-xl"
              :class="projectMemberActionError ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'"
            >
              {{ projectMemberActionText }}
            </div>
            <div
              v-if="projectMemberList.length === 0"
              class="text-xs text-slate-500 p-4 border border-slate-200 rounded-2xl bg-slate-50"
            >
              当前项目还没有成员记录。
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="member in projectMemberList"
                :key="member.userId"
                class="p-3 border border-slate-200 rounded-2xl bg-white"
              >
                <div class="flex gap-3 items-start justify-between">
                  <div class="flex-1 min-w-0">
                    <div class="text-sm text-slate-900 font-semibold">
                      {{ member.username }}
                    </div>
                    <div class="text-[11px] text-slate-500 mt-2">
                      添加人：{{ member.addedByUsername }} · 更新时间：{{ member.updatedAt }}
                    </div>
                  </div>

                  <div
                    v-if="canEditProjectMember(member)"
                    class="flex shrink-0 gap-2 items-center"
                  >
                    <select
                      v-model="projectMemberRoleDraftMap[member.userId]"
                      data-testid="team-project-member-role-select"
                      class="text-[11px] px-2 outline-none border border-slate-200 rounded bg-white h-7 focus:border-blue-500"
                    >
                      <option
                        v-for="role in PROJECT_MEMBER_EDIT_ROLES"
                        :key="`team-project-member-role-${member.userId}-${role}`"
                        :value="role"
                      >
                        {{ projectMemberRoleLabel(role) }}
                      </option>
                    </select>
                    <button
                      data-testid="team-project-member-role-update-button"
                      class="text-[11px] text-slate-700 font-semibold px-2.5 py-1 border border-slate-200 rounded bg-white transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      type="button"
                      :disabled="projectMemberRoleUpdatingUserId === member.userId || projectMemberRemovingUserId === member.userId"
                      @click="submitProjectMemberRole(member)"
                    >
                      {{ projectMemberRoleUpdatingUserId === member.userId ? '更新中...' : '更新权限' }}
                    </button>
                    <button
                      v-if="canRemoveProjectMember(member)"
                      data-testid="team-project-member-remove-button"
                      class="text-[11px] text-rose-600 font-semibold px-2.5 py-1 border border-rose-200 rounded bg-white transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      type="button"
                      :disabled="projectMemberRoleUpdatingUserId === member.userId || projectMemberRemovingUserId === member.userId"
                      @click="removeProjectMember(member.userId)"
                    >
                      {{ projectMemberRemovingUserId === member.userId ? '移除中...' : '移出项目' }}
                    </button>
                  </div>

                  <span
                    v-else
                    class="text-[10px] text-slate-700 font-semibold px-2 py-1 rounded-full bg-slate-100 shrink-0"
                  >
                    {{ projectMemberRoleLabel(member.role) }}
                  </span>
                </div>
                <div
                  v-if="!canEditProjectMember(member) && canRemoveProjectMember(member)"
                  class="mt-3 flex justify-end"
                >
                  <button
                    data-testid="team-project-member-remove-button"
                    class="text-[11px] text-rose-600 font-semibold px-2.5 py-1 border border-rose-200 rounded bg-white transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    type="button"
                    :disabled="projectMemberRoleUpdatingUserId === member.userId || projectMemberRemovingUserId === member.userId"
                    @click="removeProjectMember(member.userId)"
                  >
                    {{ projectMemberRemovingUserId === member.userId ? '移除中...' : '移出项目' }}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section class="space-y-2">
            <div class="text-xs text-slate-500 font-medium">
              邀请记录
            </div>
            <div
              v-if="projectInvitationList.length === 0"
              class="text-xs text-slate-500 p-4 border border-slate-200 rounded-2xl bg-slate-50"
            >
              当前没有未处理的邀请记录。
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="invitation in projectInvitationList"
                :key="invitation.id"
                class="p-3 border border-slate-200 rounded-2xl bg-white"
              >
                <div class="flex gap-2 items-center justify-between">
                  <div class="text-sm text-slate-900 font-semibold">
                    {{ invitation.inviteeUsername || '通用邀请链接' }}
                  </div>
                  <span
                    class="text-[10px] font-semibold px-2 py-1 border rounded-full"
                    :class="projectInvitationStatusClass(invitation)"
                  >
                    {{ projectInvitationStatusLabel(invitation) }}
                  </span>
                </div>
                <div class="text-[11px] text-slate-500 mt-2">
                  发起人：{{ invitation.invitedByUsername }} · 过期时间：{{ invitation.expiresAt }}
                </div>
              </div>
            </div>
          </section>
        </template>

        <div class="flex justify-end">
          <a-button size="small" @click="closeProjectMembersDialog">
            关闭
          </a-button>
        </div>
      </div>
    </a-modal>
  </div>
</template>

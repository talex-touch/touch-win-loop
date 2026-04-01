<script setup lang="ts">
import type {
  FeishuDirectoryContactScopeSummary,
  FeishuDirectoryDepartment,
  FeishuDirectoryDiagnosticCode,
  FeishuDirectoryFetchStatus,
  FeishuDirectoryStatus,
  FeishuDirectoryUserCandidate,
} from '~~/shared/types/domain'

interface DepartmentTreeNode {
  key: string
  title: string
  children?: DepartmentTreeNode[]
}

const props = withDefaults(defineProps<{
  loading: boolean
  members: FeishuDirectoryUserCandidate[]
  departments: FeishuDirectoryDepartment[]
  rootDepartmentId?: string
  notice?: string
  source?: 'tenant' | 'group_fallback' | ''
  fromCache?: boolean
  fetchedAt?: string
  cacheExpiresAt?: string
  totalMembers?: number
  permissionHint?: string
  directoryStatus?: FeishuDirectoryStatus
  memberListStatus?: FeishuDirectoryFetchStatus
  departmentTreeStatus?: FeishuDirectoryFetchStatus
  contactScopeStatus?: FeishuDirectoryFetchStatus
  contactScopeSummary?: FeishuDirectoryContactScopeSummary | null
  contactScopeErrorMessage?: string
  diagnosticCode?: FeishuDirectoryDiagnosticCode
  diagnosticMessage?: string
  manualAddingKey?: string
}>(), {
  rootDepartmentId: '',
  notice: '',
  source: '',
  fromCache: false,
  fetchedAt: '',
  cacheExpiresAt: '',
  totalMembers: 0,
  permissionHint: '',
  directoryStatus: 'unavailable',
  memberListStatus: 'failed',
  departmentTreeStatus: 'failed',
  contactScopeStatus: 'failed',
  contactScopeSummary: null,
  contactScopeErrorMessage: '',
  diagnosticCode: 'directory_unavailable',
  diagnosticMessage: '',
  manualAddingKey: '',
})

const emit = defineEmits<{
  (event: 'refresh', forceRefresh: boolean): void
  (event: 'addUser', userId: string): void
  (event: 'addUnion', unionId: string): void
}>()

const keyword = ref('')
const selectedKeys = ref<string[]>([])
const ALL_MEMBERS_KEY = '__all_members__'

const effectiveTotalMembers = computed(() => {
  return Math.max(Number(props.totalMembers || 0), props.members.length)
})

const effectiveRootDepartmentId = computed(() => {
  const rootDepartmentId = String(props.rootDepartmentId || '').trim()
  if (rootDepartmentId)
    return rootDepartmentId
  return ALL_MEMBERS_KEY
})

const selectedDepartmentId = computed(() => {
  return String(selectedKeys.value[0] || effectiveRootDepartmentId.value)
})

const keywordText = computed(() => {
  return String(keyword.value || '').trim().toLowerCase()
})

const searching = computed(() => Boolean(keywordText.value))

const showPartialDiagnostic = computed(() => props.directoryStatus === 'partial')

const showDepartmentTreeFallbackNotice = computed(() => {
  return props.departmentTreeStatus === 'failed'
    && effectiveTotalMembers.value > 0
    && props.departments.length <= 1
})

const departmentMap = computed(() => {
  const map = new Map<string, FeishuDirectoryDepartment>()
  for (const department of props.departments) {
    const departmentId = String(department.departmentId || '').trim()
    if (!departmentId)
      continue
    map.set(departmentId, {
      departmentId,
      name: String(department.name || '').trim() || departmentId,
      parentDepartmentId: String(department.parentDepartmentId || '').trim() || null,
    })
  }
  return map
})

const departmentChildrenMap = computed(() => {
  const map = new Map<string | null, FeishuDirectoryDepartment[]>()
  for (const department of departmentMap.value.values()) {
    const parentDepartmentId = department.parentDepartmentId || null
    const bucket = map.get(parentDepartmentId) || []
    bucket.push(department)
    map.set(parentDepartmentId, bucket)
  }
  for (const bucket of map.values())
    bucket.sort((left, right) => left.name.localeCompare(right.name))
  return map
})

const directDepartmentMemberSetMap = computed(() => {
  const map = new Map<string, Set<string>>()
  for (const member of props.members) {
    const unionId = String(member.unionId || '').trim()
    if (!unionId)
      continue
    for (const departmentId of member.departmentIds || []) {
      const normalizedDepartmentId = String(departmentId || '').trim()
      if (!normalizedDepartmentId)
        continue
      let bucket = map.get(normalizedDepartmentId)
      if (!bucket) {
        bucket = new Set<string>()
        map.set(normalizedDepartmentId, bucket)
      }
      bucket.add(unionId)
    }
  }
  return map
})

const departmentSubtreeMemberCountMap = computed(() => {
  const counts = new Map<string, number>()
  const visited = new Set<string>()

  function visit(departmentId: string): Set<string> {
    if (visited.has(departmentId))
      return new Set(directDepartmentMemberSetMap.value.get(departmentId) || [])

    visited.add(departmentId)
    const members = new Set(directDepartmentMemberSetMap.value.get(departmentId) || [])
    for (const child of departmentChildrenMap.value.get(departmentId) || []) {
      for (const unionId of visit(child.departmentId))
        members.add(unionId)
    }
    counts.set(departmentId, members.size)
    return members
  }

  for (const departmentId of departmentMap.value.keys())
    visit(departmentId)
  return counts
})

const departmentDescendantIdMap = computed(() => {
  const descendantMap = new Map<string, Set<string>>()

  function visit(departmentId: string): Set<string> {
    const cached = descendantMap.get(departmentId)
    if (cached)
      return cached

    const descendants = new Set<string>([departmentId])
    for (const child of departmentChildrenMap.value.get(departmentId) || []) {
      for (const childDepartmentId of visit(child.departmentId))
        descendants.add(childDepartmentId)
    }
    descendantMap.set(departmentId, descendants)
    return descendants
  }

  for (const departmentId of departmentMap.value.keys())
    visit(departmentId)
  return descendantMap
})

function buildDepartmentTreeNodes(departments: FeishuDirectoryDepartment[]): DepartmentTreeNode[] {
  return departments.map((department) => {
    const memberCount = departmentSubtreeMemberCountMap.value.get(department.departmentId) || 0
    return {
      key: department.departmentId,
      title: `${department.name} (${memberCount})`,
      children: buildDepartmentTreeNodes(departmentChildrenMap.value.get(department.departmentId) || []),
    }
  })
}

const departmentTreeData = computed<DepartmentTreeNode[]>(() => {
  const topLevelDepartments = (() => {
    const rootDepartmentId = String(props.rootDepartmentId || '').trim()
    const rootChildren = rootDepartmentId
      ? (departmentChildrenMap.value.get(rootDepartmentId) || [])
      : []
    if (rootChildren.length)
      return rootChildren

    const nullChildren = departmentChildrenMap.value.get(null) || []
    if (nullChildren.length)
      return nullChildren.filter(item => item.departmentId !== rootDepartmentId)

    if (rootDepartmentId && departmentMap.value.has(rootDepartmentId))
      return [departmentMap.value.get(rootDepartmentId)!]
    return []
  })()

  const rootLabel = props.source === 'group_fallback'
    ? `管理员组目录 (${effectiveTotalMembers.value})`
    : `全部成员 (${effectiveTotalMembers.value})`

  return [{
    key: ALL_MEMBERS_KEY,
    title: rootLabel,
    children: buildDepartmentTreeNodes(topLevelDepartments),
  }]
})

const filteredMembers = computed(() => {
  const normalizedKeyword = keywordText.value
  if (normalizedKeyword) {
    return props.members.filter((member) => {
      const haystacks = [
        member.unionId,
        member.name,
        member.enName,
        member.email,
        member.mobile,
        member.userId,
        member.username,
      ].map(item => String(item || '').trim().toLowerCase())
      return haystacks.some(item => item.includes(normalizedKeyword))
    })
  }

  const departmentId = selectedDepartmentId.value
  if (!departmentId || departmentId === ALL_MEMBERS_KEY || departmentId === effectiveRootDepartmentId.value)
    return props.members

  const subtreeDepartmentIds = departmentDescendantIdMap.value.get(departmentId) || new Set([departmentId])
  return props.members.filter(member => (member.departmentIds || []).some(item => subtreeDepartmentIds.has(item)))
})

const selectedDepartmentLabel = computed(() => {
  if (searching.value)
    return '搜索结果（覆盖全员）'
  if (selectedDepartmentId.value === ALL_MEMBERS_KEY || selectedDepartmentId.value === effectiveRootDepartmentId.value)
    return '全部成员'
  return departmentMap.value.get(selectedDepartmentId.value)?.name || '部门成员'
})

const partialDiagnosticSummary = computed(() => {
  if (props.source === 'group_fallback')
    return '当前展示的是管理员组兜底目录，不代表飞书企业全量组织架构。'
  if (props.diagnosticCode === 'department_tree_permission_denied')
    return `当前仅拿到 ${effectiveTotalMembers.value} 个成员，部门树因可见范围或权限限制未完整展开，结果不是企业全量目录。`
  if (props.departmentTreeStatus === 'failed')
    return `当前仅拿到 ${effectiveTotalMembers.value} 个成员，部门树未完整展开，结果不是企业全量目录。`
  return '当前目录仅部分可见，请结合右侧成员列表继续操作。'
})

const scopeSummaryText = computed(() => {
  const summary = props.contactScopeSummary
  if (!summary)
    return ''
  return `通讯录授权范围：部门 ${summary.totalDepartments} 个，显式用户 ${summary.totalUsers} 个，用户组 ${summary.totalGroups} 个。`
})

const scopeSampleText = computed(() => {
  const summary = props.contactScopeSummary
  if (!summary)
    return ''
  const samples: string[] = []
  if (summary.departmentIds.length)
    samples.push(`部门ID：${summary.departmentIds.slice(0, 3).join(' / ')}`)
  if (summary.userIds.length)
    samples.push(`用户ID：${summary.userIds.slice(0, 3).join(' / ')}`)
  if (summary.groupIds.length)
    samples.push(`用户组ID：${summary.groupIds.slice(0, 3).join(' / ')}`)
  return samples.join('；')
})

function ensureDefaultSelection() {
  const nextSelectedKey = selectedKeys.value[0]
  const availableKeys = new Set<string>([
    ALL_MEMBERS_KEY,
    ...departmentMap.value.keys(),
  ])
  if (nextSelectedKey && availableKeys.has(nextSelectedKey))
    return
  selectedKeys.value = [ALL_MEMBERS_KEY]
}

watch(
  () => [props.rootDepartmentId, props.departments, props.members.length],
  () => {
    ensureDefaultSelection()
  },
  { immediate: true },
)

function formatDateTime(value?: string | null): string {
  const text = String(value || '').trim()
  if (!text)
    return '-'
  return text
}

function sourceLabel(source: 'tenant' | 'group_fallback' | ''): string {
  if (source === 'tenant')
    return '飞书全员目录'
  if (source === 'group_fallback')
    return '管理员组目录'
  return '目录来源未知'
}

function handleSelect(selectedDepartmentKeys: Array<string | number>) {
  const nextSelectedKey = String(selectedDepartmentKeys[0] || ALL_MEMBERS_KEY)
  selectedKeys.value = [nextSelectedKey]
}

function triggerRefresh(forceRefresh: boolean) {
  emit('refresh', forceRefresh)
}

function handleAdd(member: FeishuDirectoryUserCandidate) {
  if (member.hasContestAdmin)
    return

  if (member.userId)
    emit('addUser', member.userId)
  else
    emit('addUnion', member.unionId)
}

function memberDepartmentNames(member: FeishuDirectoryUserCandidate): string[] {
  return (member.departmentIds || [])
    .map(departmentId => departmentMap.value.get(String(departmentId || '').trim())?.name || '')
    .filter(Boolean)
}
</script>

<template>
  <div class="border border-slate-200 bg-white">
    <div class="px-3 py-2 border-b border-slate-200 flex flex-wrap gap-2 items-center justify-between">
      <div>
        <p class="text-[10px] text-slate-700 font-semibold m-0">
          飞书成员目录
        </p>
        <p class="text-[10px] text-slate-500 m-0 mt-1">
          左侧按部门浏览，右侧查看成员；搜索时会覆盖全员，不受部门选择限制。
        </p>
      </div>
      <div class="flex gap-2 items-center">
        <a-button size="mini" :loading="loading" @click="triggerRefresh(false)">
          刷新目录
        </a-button>
        <a-button size="mini" status="warning" :loading="loading" @click="triggerRefresh(true)">
          强制拉取
        </a-button>
      </div>
    </div>

    <div class="px-3 py-2 border-b border-slate-200 space-y-2">
      <div class="flex flex-wrap gap-2 items-center">
        <a-input
          v-model="keyword"
          size="small"
          class="max-w-[360px]"
          allow-clear
          placeholder="搜索 union_id / 姓名 / 邮箱 / 手机 / 本地账号"
        />
        <p class="text-[10px] text-slate-500 m-0">
          搜索即时生效；点击“强制拉取”会绕过缓存并刷新全量目录。
        </p>
      </div>

      <div class="flex flex-wrap gap-1 items-center">
        <a-tag v-if="source" color="arcoblue" size="small">
          来源：{{ sourceLabel(source) }}
        </a-tag>
        <a-tag v-if="source" :color="fromCache ? 'gray' : 'green'" size="small">
          {{ fromCache ? '缓存命中' : '实时拉取' }}
        </a-tag>
        <a-tag color="blue" size="small">
          总成员 {{ effectiveTotalMembers }}
        </a-tag>
        <a-tag color="purple" size="small">
          当前显示 {{ filteredMembers.length }}
        </a-tag>
      </div>

      <p v-if="fetchedAt || cacheExpiresAt" class="text-[10px] text-slate-500 m-0">
        数据时间：{{ formatDateTime(fetchedAt) }}；
        缓存到期：{{ formatDateTime(cacheExpiresAt) }}
      </p>
      <p v-if="notice" class="text-[10px] text-amber-700 m-0">
        {{ notice }}
      </p>
      <div v-if="showPartialDiagnostic" class="text-[10px] text-amber-800 p-2 border border-amber-200 bg-amber-50 space-y-1">
        <p class="m-0">
          诊断：{{ partialDiagnosticSummary }}
        </p>
        <p v-if="diagnosticMessage" class="m-0">
          原因：{{ diagnosticMessage }}
        </p>
      </div>
      <div
        v-if="directoryStatus !== 'ok' && (contactScopeStatus === 'ok' || Boolean(contactScopeErrorMessage))"
        class="text-[10px] text-slate-700 p-2 border border-slate-200 bg-slate-50 space-y-1"
      >
        <p v-if="contactScopeStatus === 'ok' && scopeSummaryText" class="m-0">
          范围自检：{{ scopeSummaryText }}
        </p>
        <p v-if="contactScopeStatus === 'ok' && scopeSampleText" class="m-0 break-all">
          {{ scopeSampleText }}
        </p>
        <p v-if="contactScopeStatus === 'failed' && contactScopeErrorMessage" class="m-0">
          范围自检失败：{{ contactScopeErrorMessage }}
        </p>
      </div>
      <p v-if="permissionHint" class="text-[10px] text-rose-700 m-0 p-2 border border-rose-200 bg-rose-50">
        权限自检：{{ permissionHint }}
      </p>
    </div>

    <div class="grid md:grid-cols-[280px_minmax(0,1fr)]">
      <aside class="px-2 py-2 border-r border-slate-200 bg-slate-50">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-[10px] text-slate-700 font-medium m-0">
            部门树
          </p>
          <p class="text-[10px] text-slate-500 m-0">
            {{ departments.length }} 个部门
          </p>
        </div>
        <div v-if="showDepartmentTreeFallbackNotice" class="text-[10px] text-amber-800 mb-2 p-2 border border-amber-200 bg-amber-50">
          部门树当前不可用，左侧仅显示降级结构；请优先查看右侧成员列表或直接搜索成员。
        </div>
        <a-tree
          :data="departmentTreeData"
          block-node
          size="small"
          :default-expand-all="true"
          :selected-keys="selectedKeys"
          @select="handleSelect"
        />
      </aside>

      <section class="px-3 py-2 min-w-0">
        <div class="mb-2 flex gap-2 items-center justify-between">
          <div>
            <p class="text-[10px] text-slate-700 font-medium m-0">
              {{ selectedDepartmentLabel }}
            </p>
            <p v-if="searching" class="text-[10px] text-slate-500 m-0 mt-1">
              搜索范围是全部成员，左侧部门树仅保留当前浏览定位。
            </p>
          </div>
          <p class="text-[10px] text-slate-500 m-0">
            {{ filteredMembers.length }} 人
          </p>
        </div>

        <p v-if="loading" class="text-[10px] text-slate-500 m-0">
          检索中...
        </p>
        <p v-else-if="!filteredMembers.length" class="text-[10px] text-slate-500 m-0">
          {{ searching ? '没有匹配到成员。' : '当前部门下暂无成员。' }}
        </p>

        <div v-else class="max-h-[380px] overflow-auto space-y-2">
          <div
            v-for="member in filteredMembers"
            :key="member.unionId"
            class="px-3 py-2 border border-slate-200 bg-white flex gap-3 items-start justify-between"
          >
            <div class="min-w-0 space-y-1">
              <p class="text-[10px] text-slate-800 m-0">
                {{ member.name || member.username || member.unionId }}
              </p>
              <p class="text-[10px] text-slate-500 font-mono m-0 break-all">
                union: {{ member.unionId }}
              </p>
              <p v-if="member.userId" class="text-[10px] text-slate-500 font-mono m-0 break-all">
                user: {{ member.userId }}{{ member.username ? ` / ${member.username}` : '' }}
              </p>
              <p v-if="memberDepartmentNames(member).length" class="text-[10px] text-slate-500 m-0 break-all">
                部门：{{ memberDepartmentNames(member).join(' / ') }}
              </p>
              <div class="pt-1 flex flex-wrap gap-1">
                <a-tag v-if="member.hasContestAdmin" color="green" size="small">
                  contest_admin
                </a-tag>
                <a-tag v-if="!member.userId" color="gray" size="small">
                  未建本地账号
                </a-tag>
              </div>
            </div>
            <a-button
              size="mini"
              type="primary"
              :disabled="member.hasContestAdmin"
              :loading="member.userId ? (manualAddingKey === `user:${member.userId}`) : (manualAddingKey === `union:${member.unionId}`)"
              @click="handleAdd(member)"
            >
              {{ member.hasContestAdmin ? '已是管理员' : '手动添加' }}
            </a-button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

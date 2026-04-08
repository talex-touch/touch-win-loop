<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  Contest,
  ContestStatus,
  PlatformPermission,
} from '~~/shared/types/domain'

definePageMeta({
  layout: 'admin',
})

const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)
const authApiFetch = useAuthApiFetch()
const route = useRoute()

function splitOrganizerText(value?: string): string[] {
  if (!value)
    return []
  return value
    .split(/[\n,，、;；/|]+/g)
    .map(item => item.trim())
    .filter(Boolean)
}

function extractOrganizerTags(contest: Contest): string[] {
  const merged = [...splitOrganizerText(contest.organizer), ...splitOrganizerText(contest.coOrganizer)]
  return Array.from(new Set(merged))
}

function statusColor(status?: ContestStatus): 'gray' | 'blue' | 'green' {
  if (status === 'published')
    return 'green'
  if (status === 'archived')
    return 'gray'
  return 'blue'
}

const loading = ref(false)
const permissionLoaded = ref(false)
const permissionErrorText = ref('')
const actionLoadingId = ref('')
const errorText = ref('')
const successText = ref('')

const isPlatformAdmin = ref(false)
const permissions = ref<PlatformPermission[]>([])
const contests = ref<Contest[]>([])

const statusFilter = ref<ContestStatus | ''>('')
const search = ref('')
const organizerFilter = ref<string[]>([])

const page = ref(1)
const pageSize = ref(10)

const isListRoute = computed(() => {
  const normalized = route.path.replace(/\/+$/, '') || '/'
  return normalized === '/admin/contests'
})

const canRead = computed(() => isPlatformAdmin.value || permissions.value.includes('contest.read_internal'))
const canWrite = computed(() => isPlatformAdmin.value || permissions.value.includes('contest.write'))
const canPublish = computed(() => isPlatformAdmin.value || permissions.value.includes('contest.publish'))
const canArchive = computed(() => isPlatformAdmin.value || permissions.value.includes('contest.archive'))

const organizerOptions = computed(() => {
  const set = new Set<string>()
  for (const item of contests.value) {
    for (const organizer of extractOrganizerTags(item))
      set.add(organizer)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'))
})

const filteredContests = computed(() => {
  if (organizerFilter.value.length === 0)
    return contests.value
  return contests.value.filter((item) => {
    const tags = extractOrganizerTags(item)
    return organizerFilter.value.every(filterTag => tags.includes(filterTag))
  })
})

const pagedContests = computed(() => {
  const start = (page.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredContests.value.slice(start, end)
})

const contestColumns = [
  { title: '赛事', dataIndex: 'name', slotName: 'name', ellipsis: true, tooltip: true },
  { title: '主办单位', dataIndex: 'organizers', slotName: 'organizers', width: 280 },
  { title: '级别', dataIndex: 'level', width: 110 },
  { title: '状态', dataIndex: 'status', slotName: 'status', width: 120 },
  { title: '可见性', dataIndex: 'visibility', width: 120 },
  { title: '操作', dataIndex: 'actions', slotName: 'actions', width: 320, fixed: 'right' as const },
]

watch([filteredContests, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(filteredContests.value.length / pageSize.value))
  if (page.value > maxPage)
    page.value = maxPage
})

async function loadPermissions() {
  permissionErrorText.value = ''
  const response = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
  permissions.value = response.data.user.platformPermissions || []
  isPlatformAdmin.value = Boolean(response.data.user.isPlatformAdmin)
}

async function loadContests() {
  loading.value = true
  errorText.value = ''
  try {
    const response = await $fetch<ApiResponse<Contest[]>>(endpoint('/admin/contests'), {
      query: {
        status: statusFilter.value,
        q: search.value.trim(),
      },
    })
    contests.value = response.data
    page.value = 1
  }
  catch (error: any) {
    contests.value = []
    errorText.value = String(error?.data?.message || '赛事列表加载失败。')
  }
  finally {
    loading.value = false
  }
}

function resetFilters() {
  statusFilter.value = ''
  search.value = ''
  organizerFilter.value = []
  void loadContests()
}

async function publishContest(contestId: string) {
  if (!canPublish.value)
    return
  actionLoadingId.value = contestId
  errorText.value = ''
  successText.value = ''
  try {
    await $fetch(endpoint(`/admin/contests/${contestId}/publish`), {
      method: 'POST',
    })
    successText.value = '赛事发布成功。'
    await loadContests()
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '发布失败。')
  }
  finally {
    actionLoadingId.value = ''
  }
}

async function archiveContest(contestId: string) {
  if (!canArchive.value)
    return
  actionLoadingId.value = contestId
  errorText.value = ''
  successText.value = ''
  try {
    await $fetch(endpoint(`/admin/contests/${contestId}/archive`), {
      method: 'POST',
    })
    successText.value = '赛事已下架。'
    await loadContests()
  }
  catch (error: any) {
    errorText.value = String(error?.data?.message || '下架失败。')
  }
  finally {
    actionLoadingId.value = ''
  }
}

async function goToContestWorkspace(contestId?: string) {
  if (!contestId) {
    errorText.value = '赛事 ID 缺失，无法进入工作区。'
    return
  }
  await navigateTo(`/admin/contests/${contestId}`)
}

async function goToContestOverviewEditor(contestId?: string) {
  if (!contestId) {
    errorText.value = '赛事 ID 缺失，无法进入编辑。'
    return
  }
  await navigateTo(`/admin/contests/${contestId}/overview/edit`)
}

async function goToContestAiPrompts(contestId?: string) {
  if (!contestId) {
    errorText.value = '赛事 ID 缺失，无法进入 AI 提示词。'
    return
  }
  await navigateTo(`/admin/contests/${contestId}/ai-prompts`)
}

async function bootstrapListPage() {
  try {
    await loadPermissions()
  }
  catch (error: any) {
    permissionErrorText.value = String(error?.data?.message || '权限加载失败。')
    permissions.value = []
    isPlatformAdmin.value = false
    permissionLoaded.value = true
    return
  }

  permissionLoaded.value = true
  if (canRead.value)
    await loadContests()
}

watch(isListRoute, async (value) => {
  if (!value)
    return
  await bootstrapListPage()
}, { immediate: true })
</script>

<template>
  <NuxtPage v-if="!isListRoute" />
  <div v-else class="text-[11px] space-y-3">
    <section
      v-if="!permissionLoaded"
      class="p-3 border border-slate-200 bg-white"
    >
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="6" />
      </a-skeleton>
    </section>

    <section
      v-else-if="permissionErrorText"
      class="text-amber-700 p-3 border border-amber-200 bg-amber-50"
    >
      {{ permissionErrorText }}
    </section>
    <section
      v-else-if="!canRead"
      class="text-rose-600 p-3 border border-rose-200 bg-rose-50"
    >
      403：当前账号没有赛事管理权限。
    </section>

    <template v-else>
      <section class="p-3 border border-slate-200 bg-white">
        <div class="gap-2 grid lg:grid-cols-[2fr_1fr_2fr_auto]">
          <a-input
            v-model="search"
            allow-clear
            size="small"
            placeholder="搜索：名称/主办方/官网/关键词"
            @press-enter="loadContests"
          />
          <a-select
            v-model="statusFilter"
            allow-clear
            size="small"
            placeholder="状态"
          >
            <a-option value="draft">
              draft
            </a-option>
            <a-option value="published">
              published
            </a-option>
            <a-option value="archived">
              archived
            </a-option>
          </a-select>
          <a-select
            v-model="organizerFilter"
            :max-tag-count="2"
            allow-clear
            allow-search
            multiple
            size="small"
            placeholder="按主办单位筛选（支持多选）"
          >
            <a-option v-for="item in organizerOptions" :key="item" :value="item">
              {{ item }}
            </a-option>
          </a-select>
          <div class="flex gap-2 items-center">
            <a-button size="small" type="primary" @click="loadContests">
              查询
            </a-button>
            <a-button size="small" @click="resetFilters">
              重置
            </a-button>
          </div>
        </div>
      </section>

      <section class="p-3 border border-slate-200 bg-white">
        <div class="mb-3 flex gap-2 items-center justify-between">
          <p class="text-[11px] text-slate-900 font-semibold m-0">
            赛事列表（{{ filteredContests.length }}）
          </p>
          <NuxtLink v-if="canWrite" to="/admin/contests/new">
            <a-button size="small" type="primary">
              新建赛事
            </a-button>
          </NuxtLink>
        </div>

        <a-skeleton v-if="loading" :animation="true">
          <a-skeleton-line :rows="8" />
        </a-skeleton>

        <template v-else>
          <a-table
            :bordered="{ cell: true }"
            :columns="contestColumns"
            :data="pagedContests"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #name="{ record }">
              <div class="min-w-0">
                <p class="text-[12px] text-slate-900 font-semibold m-0 truncate">
                  {{ record.name }}
                </p>
                <p class="text-[10px] text-slate-500 m-0 mt-1 truncate">
                  {{ record.officialUrl || '暂无官网链接' }}
                </p>
              </div>
            </template>

            <template #organizers="{ record }">
              <div class="flex flex-wrap gap-1">
                <a-tag
                  v-for="item in extractOrganizerTags(record)"
                  :key="`${record.id}-${item}`"
                  bordered
                  size="small"
                >
                  {{ item }}
                </a-tag>
                <span v-if="extractOrganizerTags(record).length === 0" class="text-[10px] text-slate-400">
                  待补充
                </span>
              </div>
            </template>

            <template #status="{ record }">
              <a-tag :color="statusColor(record.status)" size="small">
                {{ record.status || 'draft' }}
              </a-tag>
            </template>

            <template #actions="{ record }">
              <div class="flex flex-wrap gap-1 justify-end">
                <a-button size="mini" @click="goToContestOverviewEditor(record.id)">
                  编辑
                </a-button>
                <a-button size="mini" @click="goToContestWorkspace(record.id)">
                  工作区
                </a-button>
                <a-button v-if="canWrite" size="mini" @click="goToContestAiPrompts(record.id)">
                  AI提示词
                </a-button>
                <a-button
                  v-if="canPublish"
                  size="mini"
                  :loading="actionLoadingId === record.id"
                  @click="publishContest(record.id)"
                >
                  发布
                </a-button>
                <a-button
                  v-if="canArchive"
                  size="mini"
                  status="danger"
                  :loading="actionLoadingId === record.id"
                  @click="archiveContest(record.id)"
                >
                  下架
                </a-button>
              </div>
            </template>
          </a-table>

          <div class="mt-3 flex justify-end">
            <a-pagination
              :current="page"
              :page-size="pageSize"
              :page-size-options="[10, 20, 50]"
              :show-total="true"
              :total="filteredContests.length"
              size="small"
              @change="(value: number) => page = value"
              @page-size-change="(value: number) => { pageSize = value; page = 1 }"
            />
          </div>
        </template>
      </section>
    </template>

    <section v-if="errorText" class="text-rose-600 p-3 border border-rose-200 bg-rose-50">
      {{ errorText }}
    </section>

    <section v-if="successText" class="text-emerald-700 p-3 border border-emerald-200 bg-emerald-50">
      {{ successText }}
    </section>
  </div>
</template>

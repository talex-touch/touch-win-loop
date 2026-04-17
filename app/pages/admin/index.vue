<script setup lang="ts">
import type {
  ApiResponse,
  AuthMeResult,
  FeishuIntegrationConfig,
  PlatformPermission,
} from '~~/shared/types/domain'
import { resolveAuthDisplayMessage, resolveAuthRequestErrorInfo, resolveLoginRedirectTarget } from '~/utils/auth-request'

definePageMeta({
  layout: 'admin',
})

const authApiFetch = useAuthApiFetch()
const route = useRoute()

type BuildValueSource = 'env' | 'runtime' | 'fallback' | 'missing'

interface FeishuIntegrationConfigView extends FeishuIntegrationConfig {
  startupEffectiveVersion?: string
  startupEffectiveCommitSha?: string
  startupVersionSource?: BuildValueSource
  startupCommitShaSource?: BuildValueSource
}

const loading = ref(true)
const errorText = ref('')
const buildInfoError = ref('')
const permissions = ref<PlatformPermission[]>([])
const buildInfo = ref<{
  version: string
  commitSha: string
  versionSource: BuildValueSource
  commitShaSource: BuildValueSource
} | null>(null)

const canManageContest = computed(() => {
  return permissions.value.some(item =>
    ['contest.read_internal', 'contest.write', 'contest.publish', 'contest.archive'].includes(item),
  )
})
const canManagePricing = computed(() => permissions.value.includes('pricing.write'))
const canManageRoles = computed(() => permissions.value.includes('role.assign'))
const canManageIntegrations = computed(() => {
  return canManageRoles.value || permissions.value.includes('contest.write')
})
const canManageRuntimeSettings = computed(() => permissions.value.includes('contest.write'))
const canPublishNotifications = computed(() => permissions.value.includes('contest.write'))

function buildValueSourceLabel(source: BuildValueSource): string {
  if (source === 'env')
    return '环境变量'
  if (source === 'runtime')
    return '构建推导'
  if (source === 'fallback')
    return '集成配置兜底'
  return '未命中'
}

const summaryRows = computed(() => {
  return [
    { label: '赛事内容管理', value: canManageContest.value ? '已授权' : '未授权', tone: canManageContest.value ? 'ok' : 'mute' },
    { label: '计费规则管理', value: canManagePricing.value ? '已授权' : '未授权', tone: canManagePricing.value ? 'ok' : 'mute' },
    { label: '平台角色分配', value: canManageRoles.value ? '已授权' : '未授权', tone: canManageRoles.value ? 'ok' : 'mute' },
    { label: '当前权限数', value: String(permissions.value.length), tone: 'mute' },
  ]
})

async function loadBuildInfo() {
  buildInfo.value = null
  buildInfoError.value = ''
  if (!canManageRoles.value)
    return
  try {
    const response = await authApiFetch<ApiResponse<FeishuIntegrationConfigView>>('/admin/integrations/feishu/config')
    buildInfo.value = {
      version: String(response.data.startupEffectiveVersion || '').trim(),
      commitSha: String(response.data.startupEffectiveCommitSha || '').trim(),
      versionSource: response.data.startupVersionSource || 'missing',
      commitShaSource: response.data.startupCommitShaSource || 'missing',
    }
  }
  catch (error: any) {
    buildInfoError.value = String(error?.data?.message || '构建标识加载失败。')
  }
}

async function loadPermissions() {
  loading.value = true
  errorText.value = ''
  buildInfo.value = null
  buildInfoError.value = ''
  try {
    const response = await authApiFetch<ApiResponse<AuthMeResult>>('/auth/me')
    permissions.value = response.data.user.platformPermissions || []
    await loadBuildInfo()
  }
  catch (error: any) {
    const info = resolveAuthRequestErrorInfo(error)
    permissions.value = []
    if (info.isUnauthorized) {
      await navigateTo({
        path: '/login',
        query: { redirect: resolveLoginRedirectTarget(route, '/admin') },
      }, { replace: true })
      return
    }
    errorText.value = resolveAuthDisplayMessage(error, '权限加载失败，请稍后重试。')
  }
  finally {
    loading.value = false
  }
}

onMounted(loadPermissions)
</script>

<template>
  <div class="text-[11px] space-y-3">
    <section class="p-3 border border-slate-200 bg-white">
      <h1 class="text-[13px] text-slate-900 tracking-tight font-bold uppercase">
        平台管理总览
      </h1>
      <p class="text-[11px] text-slate-500 mt-1">
        最小可用录入台：赛事、资料、计费、权限。
      </p>
    </section>

    <section v-if="loading" class="p-3 border border-slate-200 bg-white">
      <a-skeleton :animation="true">
        <a-skeleton-line :rows="5" />
      </a-skeleton>
    </section>

    <section v-else-if="errorText" class="text-rose-600 p-3 border border-rose-200 bg-rose-50">
      {{ errorText }}
    </section>

    <section
      v-else-if="!canManageContest && !canManagePricing && !canManageRoles"
      class="text-rose-600 p-3 border border-rose-200 bg-rose-50"
    >
      403：当前账号没有平台管理权限。
    </section>

    <template v-else>
      <section class="border border-slate-200 bg-white overflow-hidden">
        <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
          Permission Summary
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4">
          <div
            v-for="item in summaryRows"
            :key="item.label"
            class="px-3 py-2 border-b border-r border-slate-200 last:border-r-0"
          >
            <p class="text-[10px] text-slate-400 tracking-wider uppercase">
              {{ item.label }}
            </p>
            <p
              class="text-[12px] font-bold mt-1"
              :class="item.tone === 'ok' ? 'text-emerald-600' : 'text-slate-700'"
            >
              {{ item.value }}
            </p>
          </div>
        </div>
      </section>

      <section class="border border-slate-200 bg-white overflow-hidden">
        <div class="text-[10px] text-slate-500 tracking-wider font-bold px-3 py-2 border-b border-slate-200 bg-slate-50 uppercase">
          Build Identity
        </div>
        <div class="text-[11px] p-3 space-y-1">
          <p class="text-slate-700 m-0">
            当前生效版本：{{ buildInfo?.version || '-' }}；Commit：{{ buildInfo?.commitSha || '-' }}
          </p>
          <p class="text-[10px] text-slate-500 m-0">
            版本来源：{{ buildValueSourceLabel(buildInfo?.versionSource || 'missing') }}；
            Commit 来源：{{ buildValueSourceLabel(buildInfo?.commitShaSource || 'missing') }}
          </p>
          <p v-if="!canManageRoles" class="text-[10px] text-slate-400 m-0">
            查看构建标识需要 `role.assign` 权限（读取飞书集成配置）。
          </p>
          <p v-if="buildInfoError" class="text-[10px] text-amber-700 m-0">
            {{ buildInfoError }}
          </p>
        </div>
      </section>

      <section class="gap-2 grid md:grid-cols-2 xl:grid-cols-3">
        <NuxtLink to="/admin/users" class="p-3 border border-slate-200 bg-white hover:bg-slate-50">
          <p class="text-[12px] text-slate-900 font-bold">
            用户管理
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            用户状态、角色、会话治理
          </p>
        </NuxtLink>

        <NuxtLink to="/admin/organizations" class="p-3 border border-slate-200 bg-white hover:bg-slate-50">
          <p class="text-[12px] text-slate-900 font-bold">
            组织管理
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            席位、套餐、组织维度配置
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageContest"
          to="/admin/contests"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            赛事管理
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            赛事基础信息、赛道、时间轴、rubric
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageContest"
          to="/admin/resources"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            资料管理
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            14 类资料入口、状态流转
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageContest"
          to="/admin/releases/queue"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            发布审批
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            飞书同步草稿、初审、随机二审、版本替换发布
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageContest"
          to="/admin/policies"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            政策库
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            政策项查看、版本审阅与替换发布
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageContest"
          to="/admin/docs"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            文档中心
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            管理员查看飞书同步、审批、发布替换操作教程
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageContest"
          to="/admin/operations"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            运营管控
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            平台运营指标、用户画像、经营对账、风险监控与临时报表
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageIntegrations"
          to="/admin/integrations"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            集成中心
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            飞书登录、管理员组同步、Bitable 映射任务
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canPublishNotifications"
          to="/admin/notifications"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            通知管理
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            发布平台通知，按全局或 workspace 范围下发
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageRuntimeSettings"
          to="/admin/runtime-settings"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            运行设置
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            调度参数、回收参数、自动 seed 开关（UI 覆盖 Env）
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageRuntimeSettings"
          to="/admin/meeting-providers"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            会议服务
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            LiveKit / ASR / worker 参数、后台密钥与链路健康状态
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageContest"
          to="/admin/resource-preview-worker"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            文档转换监控
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            查看转换任务进度、调度状态、成功率、调用次数与失败分析
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageContest"
          to="/admin/resource-recycle-worker"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            回收站清理
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            查看清理任务状态、最近运行结果与回收站积压
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageContest"
          to="/admin/resource-knowledge-worker"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            知识索引监控
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            查看 embeddings / 索引任务运行状态、积压项目、失败项和 worker 健康度
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManagePricing"
          to="/admin/billing"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            套餐计费
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            套餐规则配置、费用估算
          </p>
        </NuxtLink>

        <NuxtLink
          v-if="canManageRoles"
          to="/admin/roles"
          class="p-3 border border-slate-200 bg-white hover:bg-slate-50"
        >
          <p class="text-[12px] text-slate-900 font-bold">
            角色权限
          </p>
          <p class="text-[11px] text-slate-500 mt-1">
            分配 platform / contest / pricing 角色
          </p>
        </NuxtLink>
      </section>
    </template>
  </div>
</template>

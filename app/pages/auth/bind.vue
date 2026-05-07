<script setup lang="ts">
import { formatDateTime } from '~/composables/team-ui'

definePageMeta({
  layout: 'auth',
  middleware: 'auth-bind',
})

useHead({
  title: '账号绑定 - WinLoop',
})

const route = useRoute()
const authApiFetch = useAuthApiFetch()
const runtime = useRuntimeConfig()
const { endpoint } = useApiEndpoint(runtime)

const {
  feishuBindLoading,
  feishuBindRedirecting,
  feishuUnbinding,
  feishuUnbindConfirmVisible,
  feishuUnbindConfirmText,
  feishuBindError,
  feishuBindSuccess,
  feishuBindStatus,
  feishuMeta,
  oauthEnabled,
  oauthDisplayName,
  oauthBindLoading,
  oauthBindRedirecting,
  oauthBindError,
  oauthBindStatus,
  hasFeishuConflict,
  hasOauthConflict,
  feishuConflictTitle,
  oauthConflictTitle,
  feishuConflictCode,
  oauthConflictCode,
  feishuBoundUser,
  oauthBoundUser,
  loadAuthMeta,
  loadFeishuBindStatus,
  loadOauthBindStatus,
  startFeishuBind,
  startOauthBind,
  openFeishuUnbindConfirm,
  cancelFeishuUnbindConfirm,
  unbindFeishu,
  resetAuthBindingState,
} = useUserAuthBindings({
  authApiFetch,
  endpoint,
  route,
})

const feishuMetaItems = computed(() => {
  const items: Array<{ label: string, value: string, mono?: boolean }> = []

  if (feishuBindStatus.value?.linked && feishuBindStatus.value.unionId) {
    items.push({
      label: 'unionId',
      value: feishuBindStatus.value.unionId,
      mono: true,
    })
  }

  if (feishuBindStatus.value?.linked && feishuBindStatus.value.updatedAt) {
    items.push({
      label: '最近同步',
      value: formatDateTime(feishuBindStatus.value.updatedAt),
    })
  }

  return items
})

const oauthMetaItems = computed(() => {
  const items: Array<{ label: string, value: string, mono?: boolean }> = []

  if (oauthBindStatus.value?.linked && oauthBindStatus.value.subject) {
    items.push({
      label: 'sub',
      value: oauthBindStatus.value.subject,
      mono: true,
    })
  }

  if (oauthBindStatus.value?.linked && oauthBindStatus.value.updatedAt) {
    items.push({
      label: '最近同步',
      value: formatDateTime(oauthBindStatus.value.updatedAt),
    })
  }

  return items
})

const bindPageDescription = computed(() => {
  return `统一管理飞书与 ${oauthDisplayName.value} 身份绑定。`
})

onMounted(async () => {
  resetAuthBindingState()

  await Promise.allSettled([
    loadAuthMeta(),
    loadFeishuBindStatus(),
    loadOauthBindStatus(),
  ])
})
</script>

<template>
  <AuthPanelCard data-testid="auth-bind-page">
    <div class="relative space-y-5">
      <div class="text-center flex flex-col items-center space-y-3">
        <div class="space-y-2">
          <h1 class="text-3xl text-slate-900 tracking-tight font-semibold m-0">
            账号绑定
          </h1>
          <p class="text-sm text-slate-600 leading-6 m-0 max-w-sm">
            {{ bindPageDescription }}
          </p>
        </div>
      </div>

      <div class="space-y-3">
        <AuthConflictNotice
          v-if="hasFeishuConflict"
          :title="feishuConflictTitle"
          :description="feishuBindError"
          :bound-user="feishuBoundUser"
          bound-user-label="当前绑定平台账号"
        />

        <AuthConflictNotice
          v-if="hasOauthConflict"
          :title="oauthConflictTitle"
          :description="oauthBindError"
          :bound-user="oauthBoundUser"
          bound-user-label="当前绑定平台账号"
        />
      </div>

      <div class="space-y-4">
        <AuthBindingCard
          title="飞书账号"
          description="绑定后可直接通过飞书身份登录并关联当前平台账号。"
          :linked="Boolean(feishuBindStatus?.linked)"
          :meta-items="feishuMetaItems"
        >
          <template #actions>
            <button
              class="dense-btn text-slate-800 border-white/60 bg-white/72 justify-center backdrop-blur hover:text-white hover:border-slate-900 hover:bg-slate-900"
              :disabled="feishuBindLoading || feishuBindRedirecting || feishuUnbinding"
              @click="loadFeishuBindStatus"
            >
              {{ feishuBindLoading ? '刷新中...' : '刷新状态' }}
            </button>
            <button
              class="dense-btn text-white border-slate-900 bg-slate-900 justify-center hover:bg-black"
              :disabled="feishuBindLoading || feishuBindRedirecting || feishuUnbinding || !feishuMeta?.enabled"
              @click="startFeishuBind"
            >
              {{ feishuBindRedirecting ? '跳转中...' : (feishuBindStatus?.linked ? '重新绑定飞书' : '绑定飞书') }}
            </button>
            <button
              v-if="feishuBindStatus?.linked"
              class="dense-btn text-rose-700 border-rose-200/90 bg-rose-50/90 justify-center hover:text-white hover:border-rose-700 hover:bg-rose-700"
              :disabled="feishuBindLoading || feishuBindRedirecting || feishuUnbinding"
              @click="openFeishuUnbindConfirm"
            >
              {{ feishuUnbinding ? '解绑中...' : '解绑飞书' }}
            </button>
          </template>

          <p v-if="feishuBindLoading" class="text-sm text-slate-500 m-0">
            绑定状态加载中...
          </p>

          <p v-if="!feishuMeta?.enabled" class="text-sm text-slate-500 m-0">
            当前环境未启用飞书登录。
          </p>

          <div
            v-else-if="feishuUnbindConfirmVisible"
            class="p-3 border border-rose-200/90 rounded-2xl bg-rose-50/90 space-y-3"
          >
            <p class="text-sm text-rose-700 leading-6 m-0">
              解绑后将移除当前账号所有飞书身份映射。请输入 <span class="font-mono">UNBIND</span> 确认。
            </p>
            <input
              v-model="feishuUnbindConfirmText"
              type="text"
              class="dense-input border-rose-300 bg-white/90 focus:border-rose-500"
              placeholder="输入 UNBIND"
              :disabled="feishuUnbinding"
            >
            <div class="flex flex-wrap gap-2 justify-end">
              <button class="dense-btn text-slate-700 border-white/60 bg-white/82 justify-center hover:border-slate-300 hover:bg-white" :disabled="feishuUnbinding" @click="cancelFeishuUnbindConfirm">
                取消
              </button>
              <button class="dense-btn text-white border-rose-700 bg-rose-700 justify-center hover:bg-rose-800" :disabled="feishuUnbinding" @click="unbindFeishu">
                {{ feishuUnbinding ? '解绑中...' : '确认解绑' }}
              </button>
            </div>
          </div>

          <p
            v-else-if="feishuBindError && !hasFeishuConflict"
            class="text-sm text-rose-700 leading-6 m-0"
            :data-testid="feishuConflictCode ? 'auth-bind-feishu-conflict-code' : undefined"
          >
            {{ feishuBindError }}
          </p>

          <p v-if="feishuBindSuccess" class="text-sm text-emerald-700 leading-6 m-0">
            {{ feishuBindSuccess }}
          </p>
        </AuthBindingCard>

        <AuthBindingCard
          :title="`${oauthDisplayName} 账号`"
          description="绑定后可复用第三方 OAuth 身份登录当前平台。"
          :linked="Boolean(oauthBindStatus?.linked)"
          :meta-items="oauthMetaItems"
        >
          <template #actions>
            <button
              class="dense-btn text-slate-800 border-white/60 bg-white/72 justify-center backdrop-blur hover:text-white hover:border-slate-900 hover:bg-slate-900"
              :disabled="oauthBindLoading || oauthBindRedirecting"
              @click="loadOauthBindStatus"
            >
              {{ oauthBindLoading ? '刷新中...' : '刷新状态' }}
            </button>
            <button
              class="dense-btn text-white border-slate-900 bg-slate-900 justify-center hover:bg-black"
              :disabled="oauthBindLoading || oauthBindRedirecting || !oauthEnabled"
              @click="startOauthBind"
            >
              {{ oauthBindRedirecting ? '跳转中...' : (oauthBindStatus?.linked ? `重新绑定 ${oauthDisplayName}` : `绑定 ${oauthDisplayName}`) }}
            </button>
          </template>

          <p v-if="oauthBindLoading" class="text-sm text-slate-500 m-0">
            绑定状态加载中...
          </p>

          <p v-if="!oauthEnabled" class="text-sm text-slate-500 m-0">
            当前环境未启用第三方 OAuth 登录。
          </p>

          <p
            v-else-if="oauthBindError && !hasOauthConflict"
            class="text-sm text-rose-700 leading-6 m-0"
            :data-testid="oauthConflictCode ? 'auth-bind-oauth-conflict-code' : undefined"
          >
            {{ oauthBindError }}
          </p>
        </AuthBindingCard>
      </div>
    </div>
  </AuthPanelCard>
</template>

<script setup lang="ts">
import type { CasdoorAuthBindStatus, FeishuAuthBindStatus } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  feishuBindStatus?: FeishuAuthBindStatus | null
  feishuBindLoading?: boolean
  feishuBindRedirecting?: boolean
  feishuUnbinding?: boolean
  feishuBindError?: string
  feishuBindSuccess?: string
  feishuUnbindConfirmVisible?: boolean
  feishuUnbindConfirmText?: string
  oauthBindStatus?: CasdoorAuthBindStatus | null
  oauthBindLoading?: boolean
  oauthBindRedirecting?: boolean
  oauthBindError?: string
  oauthEnabled?: boolean
  oauthDisplayName?: string
  formatDateTime: (value: string) => string
}>(), {
  feishuBindStatus: null,
  feishuBindLoading: false,
  feishuBindRedirecting: false,
  feishuUnbinding: false,
  feishuBindError: '',
  feishuBindSuccess: '',
  feishuUnbindConfirmVisible: false,
  feishuUnbindConfirmText: '',
  oauthBindStatus: null,
  oauthBindLoading: false,
  oauthBindRedirecting: false,
  oauthBindError: '',
  oauthEnabled: false,
  oauthDisplayName: '第三方 OAuth',
})

const emit = defineEmits<{
  loadFeishuBindStatus: []
  startFeishuBind: []
  openFeishuUnbindConfirm: []
  updateFeishuUnbindConfirmText: [value: string]
  cancelFeishuUnbindConfirm: []
  unbindFeishu: []
  loadOauthBindStatus: []
  startOauthBind: []
}>()
</script>

<template>
  <div class="space-y-8">
    <section class="user-settings-panel">
      <div class="user-settings-row">
        <div class="user-settings-row__heading">
          <p class="user-settings-row__title">
            飞书账号
          </p>
          <p class="user-settings-row__desc">
            绑定后可直接通过飞书身份登录并关联当前平台账号。
          </p>
        </div>
        <div class="user-settings-row__content">
          <span
            class="text-xs font-medium px-2.5 py-1 border rounded-full inline-flex"
            :class="props.feishuBindStatus?.linked ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-600'"
          >
            {{ props.feishuBindStatus?.linked ? '已绑定' : '未绑定' }}
          </span>
          <p v-if="props.feishuBindStatus?.linked && props.feishuBindStatus.unionId" class="user-settings-copy break-all">
            unionId：{{ props.feishuBindStatus.unionId }}
          </p>
          <p v-if="props.feishuBindStatus?.linked && props.feishuBindStatus.updatedAt" class="user-settings-copy">
            最近同步：{{ props.formatDateTime(props.feishuBindStatus.updatedAt) }}
          </p>
          <div class="flex flex-wrap gap-2 justify-end">
            <button class="user-settings-btn" :disabled="props.feishuBindLoading || props.feishuBindRedirecting || props.feishuUnbinding" @click="emit('loadFeishuBindStatus')">
              {{ props.feishuBindLoading ? '刷新中...' : '刷新状态' }}
            </button>
            <button
              class="user-settings-btn user-settings-btn--primary"
              :disabled="props.feishuBindLoading || props.feishuBindRedirecting || props.feishuUnbinding"
              @click="emit('startFeishuBind')"
            >
              {{ props.feishuBindRedirecting ? '跳转中...' : (props.feishuBindStatus?.linked ? '重新绑定飞书' : '绑定飞书') }}
            </button>
            <button
              v-if="props.feishuBindStatus?.linked"
              class="user-settings-btn user-settings-btn--danger"
              :disabled="props.feishuBindLoading || props.feishuBindRedirecting || props.feishuUnbinding"
              @click="emit('openFeishuUnbindConfirm')"
            >
              {{ props.feishuUnbinding ? '解绑中...' : '解绑飞书' }}
            </button>
          </div>
          <p v-if="props.feishuBindError" class="user-settings-feedback user-settings-feedback--danger">
            {{ props.feishuBindError }}
          </p>
          <p v-if="props.feishuBindSuccess" class="user-settings-feedback user-settings-feedback--success">
            {{ props.feishuBindSuccess }}
          </p>
          <div v-if="props.feishuUnbindConfirmVisible" class="user-settings-feedback user-settings-feedback--danger space-y-3">
            <p class="user-settings-meta">
              解绑后将移除当前账号所有飞书身份映射。请输入 <span class="font-mono">UNBIND</span> 确认。
            </p>
            <input
              :value="props.feishuUnbindConfirmText"
              type="text"
              class="user-settings-input border-rose-300 focus:border-rose-500"
              placeholder="输入 UNBIND"
              :disabled="props.feishuUnbinding"
              @input="emit('updateFeishuUnbindConfirmText', ($event.target as HTMLInputElement).value)"
            >
            <div class="flex flex-wrap gap-2 justify-end">
              <button class="user-settings-btn" :disabled="props.feishuUnbinding" @click="emit('cancelFeishuUnbindConfirm')">
                取消
              </button>
              <button class="user-settings-btn user-settings-btn--danger" :disabled="props.feishuUnbinding" @click="emit('unbindFeishu')">
                {{ props.feishuUnbinding ? '解绑中...' : '确认解绑' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="user-settings-panel">
      <div class="user-settings-row">
        <div class="user-settings-row__heading">
          <p class="user-settings-row__title">
            {{ props.oauthDisplayName }} 账号
          </p>
          <p class="user-settings-row__desc">
            绑定后可复用该第三方 OAuth 身份登录当前平台。
          </p>
        </div>
        <div class="user-settings-row__content">
          <span
            class="text-xs font-medium px-2.5 py-1 border rounded-full inline-flex"
            :class="props.oauthBindStatus?.linked ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-600'"
          >
            {{ props.oauthBindStatus?.linked ? '已绑定' : '未绑定' }}
          </span>
          <p v-if="props.oauthBindStatus?.linked && props.oauthBindStatus.subject" class="user-settings-copy break-all">
            sub：{{ props.oauthBindStatus.subject }}
          </p>
          <p v-if="props.oauthBindStatus?.linked && props.oauthBindStatus.updatedAt" class="user-settings-copy">
            最近同步：{{ props.formatDateTime(props.oauthBindStatus.updatedAt) }}
          </p>
          <div class="flex flex-wrap gap-2 justify-end">
            <button class="user-settings-btn" :disabled="props.oauthBindLoading || props.oauthBindRedirecting" @click="emit('loadOauthBindStatus')">
              {{ props.oauthBindLoading ? '刷新中...' : '刷新状态' }}
            </button>
            <button
              class="user-settings-btn user-settings-btn--primary"
              :disabled="props.oauthBindLoading || props.oauthBindRedirecting"
              @click="emit('startOauthBind')"
            >
              {{ props.oauthBindRedirecting ? '跳转中...' : (props.oauthBindStatus?.linked ? `重新绑定 ${props.oauthDisplayName}` : `绑定 ${props.oauthDisplayName}`) }}
            </button>
          </div>
          <p v-if="props.oauthBindError" class="user-settings-feedback user-settings-feedback--danger">
            {{ props.oauthBindError }}
          </p>
          <p v-if="!props.oauthEnabled" class="user-settings-copy">
            当前环境未启用第三方 OAuth 登录。
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

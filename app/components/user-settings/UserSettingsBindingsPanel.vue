<script setup lang="ts">
import type { CasdoorAuthBindStatus, FeishuAuthBindStatus } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  feishuBindStatus?: FeishuAuthBindStatus | null
  feishuBindLoading?: boolean
  feishuBindError?: string
  oauthBindStatus?: CasdoorAuthBindStatus | null
  oauthBindLoading?: boolean
  oauthBindError?: string
  oauthEnabled?: boolean
  oauthDisplayName?: string
  formatDateTime: (value: string) => string
}>(), {
  feishuBindStatus: null,
  feishuBindLoading: false,
  feishuBindError: '',
  oauthBindStatus: null,
  oauthBindLoading: false,
  oauthBindError: '',
  oauthEnabled: false,
  oauthDisplayName: '第三方 OAuth',
})

const emit = defineEmits<{
  openBindPage: []
}>()

const feishuMetaItems = computed(() => {
  const items: Array<{ label: string, value: string, mono?: boolean }> = []

  if (props.feishuBindStatus?.linked && props.feishuBindStatus.unionId) {
    items.push({
      label: 'unionId',
      value: props.feishuBindStatus.unionId,
      mono: true,
    })
  }

  if (props.feishuBindStatus?.linked && props.feishuBindStatus.updatedAt) {
    items.push({
      label: '最近同步',
      value: props.formatDateTime(props.feishuBindStatus.updatedAt),
    })
  }

  return items
})

const oauthMetaItems = computed(() => {
  const items: Array<{ label: string, value: string, mono?: boolean }> = []

  if (props.oauthBindStatus?.linked && props.oauthBindStatus.subject) {
    items.push({
      label: 'sub',
      value: props.oauthBindStatus.subject,
      mono: true,
    })
  }

  if (props.oauthBindStatus?.linked && props.oauthBindStatus.updatedAt) {
    items.push({
      label: '最近同步',
      value: props.formatDateTime(props.oauthBindStatus.updatedAt),
    })
  }

  return items
})
</script>

<template>
  <div class="space-y-6">
    <section class="user-settings-panel">
      <div class="user-settings-row">
        <div class="user-settings-row__heading">
          <p class="user-settings-row__title">
            绑定管理已迁移
          </p>
          <p class="user-settings-row__desc">
            飞书和第三方 OAuth 的绑定、重绑与解绑操作已统一迁移到独立页面。
          </p>
        </div>
        <div class="user-settings-row__content user-settings-row__content--profile space-y-4">
          <AuthBindingCard
            title="飞书账号"
            description="绑定后可直接通过飞书身份登录并关联当前平台账号。"
            :linked="Boolean(props.feishuBindStatus?.linked)"
            :meta-items="feishuMetaItems"
          >
            <p v-if="props.feishuBindLoading" class="user-settings-copy">
              绑定状态加载中...
            </p>
            <p v-if="props.feishuBindError" class="user-settings-feedback user-settings-feedback--danger">
              {{ props.feishuBindError }}
            </p>
          </AuthBindingCard>

          <AuthBindingCard
            :title="`${props.oauthDisplayName} 账号`"
            description="绑定后可复用第三方 OAuth 身份登录当前平台。"
            :linked="Boolean(props.oauthBindStatus?.linked)"
            :meta-items="oauthMetaItems"
          >
            <p v-if="props.oauthBindLoading" class="user-settings-copy">
              绑定状态加载中...
            </p>
            <p v-if="props.oauthBindError" class="user-settings-feedback user-settings-feedback--danger">
              {{ props.oauthBindError }}
            </p>
            <p v-if="!props.oauthEnabled" class="user-settings-copy">
              当前环境未启用第三方 OAuth 登录。
            </p>
          </AuthBindingCard>

          <div class="flex justify-end">
            <button class="user-settings-btn user-settings-btn--primary" @click="emit('openBindPage')">
              前往绑定页
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

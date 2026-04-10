<script setup lang="ts">
const props = withDefaults(defineProps<{
  userName?: string
  hasUserAvatar?: boolean
  userAvatarUrl?: string
  userInitial?: string
  userIdentityItems?: Array<{ key: string, value: string, mono?: boolean }>
  loggingOut?: boolean
}>(), {
  userName: '未登录用户',
  hasUserAvatar: false,
  userAvatarUrl: '',
  userInitial: 'U',
  userIdentityItems: () => [],
  loggingOut: false,
})

const emit = defineEmits<{
  openLogoutConfirm: []
  openProfileEditorDialog: []
}>()
</script>

<template>
  <div class="user-settings-panel user-settings-panel--stack">
    <section class="user-settings-profile-section">
      <p class="user-settings-row__title">
        基础资料
      </p>

      <div class="user-settings-profile-content">
        <div class="user-settings-profile-card user-settings-profile-card--profile">
          <div class="user-settings-profile-card__main">
            <div class="user-settings-avatar user-settings-avatar--large">
              <img
                v-if="props.hasUserAvatar"
                :src="props.userAvatarUrl"
                alt="当前头像"
                class="user-settings-avatar__image"
              >
              <span v-else>{{ props.userInitial }}</span>
            </div>
            <div class="user-settings-profile-meta">
              <p class="text-lg text-slate-900 font-semibold">
                {{ props.userName }}
              </p>
              <div v-if="props.userIdentityItems.length" class="user-settings-identity-list">
                <p
                  v-for="item in props.userIdentityItems"
                  :key="item.key"
                  class="user-settings-identity-item"
                >
                  <span
                    class="user-settings-identity-item__value"
                    :class="{ 'user-settings-identity-item__value--mono': item.mono }"
                  >
                    {{ item.value }}
                  </span>
                </p>
              </div>
            </div>
          </div>
          <div class="user-settings-profile-card__footer">
            <button class="user-settings-btn user-settings-btn--danger" :disabled="props.loggingOut" @click="emit('openLogoutConfirm')">
              退出登录
            </button>
            <button class="user-settings-btn user-settings-btn--primary" @click="emit('openProfileEditorDialog')">
              编辑资料
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

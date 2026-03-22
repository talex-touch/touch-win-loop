<script setup lang="ts">
import type { DashboardMenuItem, DashboardTopic } from '~/types/dashboard'

withDefaults(defineProps<{
  menuItems?: DashboardMenuItem[]
  topics?: DashboardTopic[]
  analystName?: string
  analystTier?: string
  analystAvatar?: string
  showAdminBadge?: boolean
}>(), {
  menuItems: () => [],
  topics: () => [],
  analystName: '分析师 张明',
  analystTier: '高级会员',
  analystAvatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAgO3szaJLN0mB5xXQFUAcenjGXOhK0fc6jH78_wVb6AgKHW2rx7If2DG7Zro9-woZuymuskn7rGkTJWIN-l2SRqi6dvqXNZqAE8LUhcHv4Z7uY-ptVO0eKI9sZzfUw9Jp1lzLiYTdYykbvVyXdkKLj9TeWaK9DipDXCk0g0Tgtir3CsIXTaFlEbB7EtggaKgtgnWMXjiAiW1uwj-4mVXyLJqdaJfAvFHWfRaX1dosZdLgVxspcp2tPArmit3IFKKQ4HpECByj_ZGI1',
  showAdminBadge: false,
})

const route = useRoute()
const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'
const profileDialogVisible = ref(false)
const loggingOut = ref(false)
const actionError = ref('')
const isWorkspaceListRoute = computed(() => route.path.replace(/\/+$/, '') === '/workspace')

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

function isMenuItemActive(item: DashboardMenuItem): boolean {
  if (item.to === '/dashboard')
    return route.path === '/dashboard'
  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}

function openProfileDialog() {
  actionError.value = ''
  profileDialogVisible.value = true
}

function closeProfileDialog() {
  if (loggingOut.value)
    return
  profileDialogVisible.value = false
}

async function logout() {
  loggingOut.value = true
  actionError.value = ''
  try {
    await $fetch(endpoint('/auth/logout'), {
      method: 'POST',
    })
    profileDialogVisible.value = false
    await navigateTo('/login')
  }
  catch (error: any) {
    actionError.value = String(error?.data?.message || '退出失败，请稍后重试。')
  }
  finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <aside class="border-r border-blue-100 bg-white shrink-0 flex-col w-64 hidden lg:flex">
    <div class="p-6 flex gap-3 items-center">
      <div class="text-white rounded-lg bg-blue-700 flex h-8 w-8 items-center justify-center">
        <span class="material-symbols-outlined text-xl">analytics</span>
      </div>
      <h1 class="text-lg text-slate-900 tracking-tight font-bold">
        竞赛分析平台
      </h1>
    </div>

    <nav class="px-4 flex-1 space-y-1">
      <NuxtLink
        v-for="item in menuItems"
        :key="item.id"
        :to="item.to"
        class="px-3 py-2 rounded-lg flex gap-3 transition-colors items-center"
        :class="isMenuItemActive(item)
          ? 'bg-blue-50 text-blue-700 font-medium'
          : 'text-slate-600 hover:bg-slate-50'"
      >
        <span class="material-symbols-outlined text-[22px]">{{ item.icon }}</span>
        <span>{{ item.label }}</span>
      </NuxtLink>
    </nav>

    <div class="mt-auto p-4">
      <div class="p-4 border border-slate-100 rounded-xl bg-slate-50">
        <p class="text-xs text-slate-400 tracking-wider font-bold mb-3 uppercase">
          热门话题
        </p>
        <ul class="text-sm space-y-2">
          <li
            v-for="topic in topics"
            :key="topic.id"
            class="text-slate-600 flex gap-2 items-center hover:text-blue-700"
          >
            <span class="text-xs text-blue-700 font-bold">#</span>{{ topic.label }}
          </li>
        </ul>
      </div>

      <template v-if="!isWorkspaceListRoute">
        <WorkspaceSwitchEntry
          mode="link"
          label="工作区"
          icon="workspaces"
          to="/workspace"
        />

        <div class="mt-4 p-3 border border-slate-200 rounded-xl bg-white flex gap-3 items-center">
          <img
            :src="analystAvatar"
            class="border border-slate-200 rounded-full h-10 w-10 object-cover"
            alt="用户头像"
          >
          <div class="min-w-0">
            <p class="text-sm text-slate-900 font-semibold truncate">
              {{ analystName }}
            </p>
            <p
              v-if="showAdminBadge"
              class="text-[10px] text-rose-700 font-semibold mt-1 px-1.5 py-0.5 border border-rose-200 rounded-md bg-rose-50 inline-flex"
            >
              管理页
            </p>
            <p class="text-xs text-slate-500 truncate">
              {{ analystTier }}
            </p>
          </div>
          <button
            class="text-slate-500 ml-auto rounded-md flex h-8 w-8 transition-colors items-center justify-center hover:text-slate-800 hover:bg-slate-100"
            title="个人设置"
            @click="openProfileDialog"
          >
            <span class="material-symbols-outlined text-[20px]">settings</span>
          </button>
        </div>
      </template>
    </div>
  </aside>

  <Teleport to="body">
    <div
      v-if="profileDialogVisible"
      class="p-4 bg-black/30 flex items-center inset-0 justify-center fixed z-50"
      @click.self="closeProfileDialog"
    >
      <div class="p-4 border border-slate-200 rounded-xl bg-white max-w-sm w-full shadow-xl">
        <div class="flex items-center justify-between">
          <h3 class="text-base text-slate-900 font-semibold">
            个人信息
          </h3>
          <button
            class="text-slate-500 rounded flex h-7 w-7 items-center justify-center hover:bg-slate-100"
            @click="closeProfileDialog"
          >
            <span class="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div class="mt-3 p-3 border border-slate-200 rounded-lg bg-slate-50">
          <p class="text-sm text-slate-900 font-semibold">
            {{ analystName }}
          </p>
          <p class="text-xs text-slate-500 mt-1">
            {{ analystTier }}
          </p>
        </div>

        <p v-if="actionError" class="text-xs text-rose-600 mt-3">
          {{ actionError }}
        </p>

        <div class="mt-4 flex gap-2 items-center justify-end">
          <button class="dense-btn" :disabled="loggingOut" @click="closeProfileDialog">
            关闭
          </button>
          <button
            class="dense-btn !text-rose-700 !border-rose-300 hover:!bg-rose-50"
            :disabled="loggingOut"
            @click="logout"
          >
            {{ loggingOut ? '退出中...' : '退出登录' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

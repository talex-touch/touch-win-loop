<script setup lang="ts">
import type { ApiResponse, AuthMeResult, PlatformPermission } from '~~/shared/types/domain'

const route = useRoute()
const runtime = useRuntimeConfig()
const apiBase = runtime.public.apiBaseUrl || '/api'

function endpoint(path: string): string {
  if (apiBase.endsWith('/'))
    return `${apiBase.slice(0, -1)}${path}`
  return `${apiBase}${path}`
}

const platformPermissions = ref<PlatformPermission[]>([])

const hasAdminAccess = computed(() => {
  return platformPermissions.value.length > 0
})

const links = computed(() => {
  const baseLinks = [
    { to: '/dashboard', label: '首页' },
    { to: '/workspace', label: '工作台' },
    { to: '/contests', label: '竞赛库' },
    { to: '/resources', label: '资料中心' },
  ]
  if (hasAdminAccess.value)
    baseLinks.push({ to: '/admin', label: '平台管理' })
  return baseLinks
})

const hideGlobalHeader = computed(() => route.path.startsWith('/workspace'))

onMounted(async () => {
  try {
    const response = await $fetch<ApiResponse<AuthMeResult>>(endpoint('/auth/me'))
    platformPermissions.value = response.data.user.platformPermissions || []
  }
  catch {
    platformPermissions.value = []
  }
})
</script>

<template>
  <div class="text-black bg-white min-h-screen">
    <header v-if="!hideGlobalHeader" class="px-2 border-b border-gray-300 flex gap-2 h-11 items-center justify-between">
      <div class="text-xs tracking-wide font-semibold whitespace-nowrap">
        WINLOOP AI WORKBENCH
      </div>
      <nav class="flex gap-1 items-center overflow-x-auto">
        <NuxtLink
          v-for="item in links"
          :key="item.to"
          :to="item.to"
          class="text-xs px-2 py-1 border border-transparent whitespace-nowrap hover:border-gray-300"
          active-class="border-gray-900 font-semibold"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
    </header>
    <main :class="hideGlobalHeader ? 'min-h-screen' : 'min-h-[calc(100vh-44px)]'">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import type { Contest, PlatformPermission } from '~~/shared/types/domain'

interface DashboardPlatformPortalCard {
  id: string
  title: string
  desc: string
  to: string
  icon: string
}

withDefaults(defineProps<{
  portalCards?: DashboardPlatformPortalCard[]
  platformContests?: Contest[]
  platformPermissions?: PlatformPermission[]
  platformLoading?: boolean
  platformError?: string
  hasPlatformPortal?: boolean
}>(), {
  portalCards: () => [],
  platformContests: () => [],
  platformPermissions: () => [],
  platformLoading: false,
  platformError: '',
  hasPlatformPortal: false,
})
</script>

<template>
  <section class="p-5 border border-slate-200 rounded-2xl bg-white">
    <div class="flex flex-wrap gap-2 items-center justify-between">
      <div>
        <h3 class="text-lg text-slate-900 font-bold flex gap-2 items-center">
          <span class="material-symbols-outlined text-blue-700">hub</span>
          平台能力中心
        </h3>
        <p class="text-sm text-slate-500 mt-1">
          将赛事总库、资料中心与平台管理能力整合到项目台。
        </p>
      </div>
      <NuxtLink
        v-if="hasPlatformPortal"
        to="/admin"
        class="text-xs text-slate-700 font-semibold px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50"
      >
        进入平台管理
      </NuxtLink>
    </div>

    <div class="mt-4 gap-3 grid md:grid-cols-2 xl:grid-cols-3">
      <NuxtLink
        v-for="item in portalCards"
        :key="item.id"
        :to="item.to"
        class="p-4 border border-slate-100 rounded-xl transition-all hover:border-blue-200 hover:bg-blue-50/40"
      >
        <div class="text-slate-900 font-semibold flex gap-2 items-center">
          <span class="material-symbols-outlined text-blue-700">{{ item.icon }}</span>
          {{ item.title }}
        </div>
        <p class="text-xs text-slate-600 leading-relaxed mt-2">
          {{ item.desc }}
        </p>
      </NuxtLink>
    </div>

    <div class="mt-4 gap-4 grid xl:grid-cols-2">
      <article class="p-4 border border-slate-100 rounded-xl">
        <div class="flex items-center justify-between">
          <h4 class="text-sm text-slate-900 font-semibold">
            最近赛事动态
          </h4>
          <NuxtLink to="/contests" class="text-xs text-blue-700 hover:underline">
            查看全部
          </NuxtLink>
        </div>
        <div v-if="platformLoading" class="mt-3 space-y-2">
          <div
            v-for="index in 4"
            :key="`dashboard-contest-skeleton-${index}`"
            class="border border-slate-100 rounded-lg bg-slate-100 h-8 animate-pulse"
          />
        </div>
        <div v-else-if="platformContests.length === 0" class="text-xs text-slate-500 mt-3">
          暂无可展示赛事。
        </div>
        <div v-else class="mt-3 space-y-2">
          <NuxtLink
            v-for="item in platformContests"
            :key="item.id"
            :to="`/contests/${item.id}`"
            class="px-3 py-2 border border-slate-100 rounded-lg flex items-center justify-between hover:border-slate-300"
          >
            <span class="text-xs text-slate-700 pr-2 truncate">{{ item.name }}</span>
            <span class="text-[10px] text-slate-500 whitespace-nowrap">{{ item.status || 'published' }}</span>
          </NuxtLink>
        </div>
      </article>

      <article class="p-4 border border-slate-100 rounded-xl">
        <h4 class="text-sm text-slate-900 font-semibold">
          当前平台权限
        </h4>
        <div v-if="platformLoading" class="mt-3 flex flex-wrap gap-2">
          <span
            v-for="index in 4"
            :key="`dashboard-permission-skeleton-${index}`"
            class="rounded-full bg-slate-200 h-5 w-28 animate-pulse"
          />
        </div>
        <div v-else-if="platformPermissions.length === 0" class="text-xs text-slate-500 mt-3">
          当前账号暂无平台管理权限（普通用户模式）。
        </div>
        <div v-else class="mt-3 flex flex-wrap gap-2">
          <span
            v-for="permission in platformPermissions"
            :key="permission"
            class="text-[10px] text-emerald-700 font-semibold px-2 py-1 rounded-full bg-emerald-50"
          >
            {{ permission }}
          </span>
        </div>
        <p v-if="platformError" class="text-[10px] text-rose-500 mt-3">
          {{ platformError }}
        </p>
      </article>
    </div>
  </section>
</template>

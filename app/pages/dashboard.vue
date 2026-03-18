<script setup lang="ts">
definePageMeta({
  layout: false,
})

useHead({
  title: '竞赛分析 Dashboard',
  link: [
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap',
    },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght@300;400;500;600;700&display=swap',
    },
  ],
})

const {
  analystProfile,
  searchQuery,
  feedFilter,
  summary,
  menuItems,
  hotTopics,
  quickActions,
  visibleInsights,
  visibleCompetitions,
  skillMetrics,
  scheduleItems,
} = useDashboardWorkspace()
</script>

<template>
  <div class="dashboard-shell text-slate-900 bg-[#f6f6f8] flex h-screen overflow-hidden">
    <DashboardSidebar :menu-items="menuItems" :topics="hotTopics" />

    <main class="flex flex-1 flex-col min-w-0 overflow-hidden">
      <DashboardTopbar
        v-model="searchQuery"
        :analyst-name="analystProfile.name"
        :analyst-tier="analystProfile.tier"
      />

      <div class="dashboard-scrollbar p-4 flex-1 overflow-y-auto md:p-8">
        <section class="mb-10 flex flex-wrap gap-4 items-end justify-between">
          <div>
            <h2 class="text-3xl text-slate-900 tracking-tight font-extrabold">
              {{ summary.greeting }}
            </h2>
            <p class="text-slate-500 mt-1">
              {{ summary.subtitle }}
            </p>
            <div class="text-xs mt-3 flex flex-wrap gap-2">
              <span class="text-blue-700 font-semibold px-2 py-1 rounded-full bg-blue-100">进行中 {{ summary.ongoingCount }}</span>
              <span class="text-slate-700 font-semibold px-2 py-1 rounded-full bg-slate-200">即将开始 {{ summary.upcomingCount }}</span>
              <span class="text-emerald-700 font-semibold px-2 py-1 rounded-full bg-emerald-100">洞察 {{ summary.insightCount }}</span>
            </div>
          </div>

          <div class="flex gap-3">
            <button class="text-sm font-semibold px-4 py-2 border border-slate-200 rounded-lg bg-white flex gap-2 transition-colors items-center hover:bg-slate-50">
              <span class="material-symbols-outlined text-lg">download</span>
              导出报告
            </button>
            <NuxtLink
              to="/workspace"
              class="text-sm text-white font-semibold px-4 py-2 rounded-lg bg-blue-700 flex gap-2 transition-colors items-center hover:bg-blue-600"
            >
              <span class="material-symbols-outlined text-lg">add</span>
              新建分析
            </NuxtLink>
          </div>
        </section>

        <div class="gap-8 grid grid-cols-12">
          <div class="col-span-12 space-y-8 lg:col-span-8">
            <DashboardInsights :insights="visibleInsights" />
            <DashboardCompetitionFeed v-model:active-filter="feedFilter" :competitions="visibleCompetitions" />
          </div>

          <DashboardRightRail
            :quick-actions="quickActions"
            :skill-metrics="skillMetrics"
            :schedule-items="scheduleItems"
          />
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.dashboard-shell {
  font-family: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.dashboard-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.dashboard-scrollbar::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 9999px;
}
</style>

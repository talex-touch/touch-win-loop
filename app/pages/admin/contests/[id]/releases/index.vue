<script setup lang="ts">
definePageMeta({
  layout: 'admin',
})

const route = useRoute()
const contestId = computed(() => {
  const value = route.params.id
  return Array.isArray(value) ? (value[0] || '') : String(value || '')
})
</script>

<template>
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 class="text-lg text-slate-900 font-semibold">
            竞赛版本发布
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            当前竞赛 ID：{{ contestId }}。这里查看飞书同步形成的版本稿、审批记录和替换发布历史。
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <NuxtLink class="dense-btn" to="/admin/docs">
            查看教程
          </NuxtLink>
          <NuxtLink class="dense-btn" :to="`/admin/contests/${contestId}`">
            返回竞赛工作区
          </NuxtLink>
        </div>
      </div>
    </section>

    <AdminReleaseWorkbench
      title="竞赛版本列表"
      description="竞赛主表、赛道、赛道时间节点、资料库的同步结果都会收敛到这里统一审批发布。"
      :fetch-path="`/admin/contests/${contestId}/releases`"
      :show-claim-button="true"
      scope-kind="contest"
    />
  </div>
</template>

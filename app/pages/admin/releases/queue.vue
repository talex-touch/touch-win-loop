<script setup lang="ts">
definePageMeta({
  layout: 'admin',
})
</script>

<template>
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 class="text-lg text-slate-900 font-semibold">
            发布审批队列
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            飞书同步只生成版本草稿，所有版本必须经过初审、随机二审，再人工发布替换线上版本。
          </p>
        </div>
        <NuxtLink class="dense-btn" to="/admin/docs">
          查看教程
        </NuxtLink>
      </div>
    </section>

    <AdminReleaseWorkbench
      title="待审版本队列"
      description="覆盖竞赛库、赛道库、资料库和政策库。二审任务可随机领取，审批日志会记录全过程。"
      fetch-path="/admin/releases/queue"
      :fetch-query="{ limit: 500 }"
      :show-claim-button="true"
    />
  </div>
</template>

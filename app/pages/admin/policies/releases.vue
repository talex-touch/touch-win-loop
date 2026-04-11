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
            政策库版本发布
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            飞书同步写入政策库版本稿，经过双人审批后再发布替换当前线上政策列表。
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <NuxtLink class="dense-btn" to="/admin/docs">
            查看教程
          </NuxtLink>
          <NuxtLink class="dense-btn" to="/admin/policies">
            返回政策库
          </NuxtLink>
        </div>
      </div>
    </section>

    <AdminReleaseWorkbench
      title="政策库版本列表"
      description="会议名称、简介、日期、重要程度以及各平台资料链接统一在这里做人工审阅。"
      fetch-path="/admin/policies/releases"
      :show-claim-button="true"
      scope-kind="policy_library"
    />
  </div>
</template>

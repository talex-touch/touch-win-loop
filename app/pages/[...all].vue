<script setup lang="ts">
const router = useRouter()
</script>

<template>
  <PageShell size="auth" gap="lg">
    <PageHeader title="页面不存在" description="请求的页面路径不存在，或该入口已经下线。" />

    <SectionCard>
      <StateBlock tone="warning" centered description="请返回上一页，或从主导航重新进入目标模块。">
        <div class="mt-4 text-4xl text-amber-600">
          <div i-carbon-warning inline-block />
        </div>
        <ActionBar class="mt-4 justify-center">
          <button class="dense-btn" type="button" @click="router.back()">
            返回上一页
          </button>
        </ActionBar>
      </StateBlock>
    </SectionCard>
  </PageShell>
</template>

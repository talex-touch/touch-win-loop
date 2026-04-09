<script setup lang="ts">
const props = defineProps<{
  contestId: string
}>()

const route = useRoute()

const tabItems = computed(() => {
  const id = props.contestId
  return [
    { key: 'overview', label: '概览', to: `/admin/contests/${id}` },
    { key: 'basic', label: '基础信息', to: `/admin/contests/${id}/overview/edit` },
    { key: 'faq', label: 'FAQ', to: `/admin/contests/${id}/faq` },
    { key: 'tracks', label: '赛道', to: `/admin/contests/${id}/tracks` },
    { key: 'track-timelines', label: '赛道时间线', to: `/admin/contests/${id}/track-timelines` },
    { key: 'timelines', label: '时间节点', to: `/admin/contests/${id}/timelines` },
    { key: 'rubrics', label: '评委细则', to: `/admin/contests/${id}/rubrics` },
    { key: 'guidelines', label: '赛道详解', to: `/admin/contests/${id}/judge-guidelines` },
    { key: 'resources', label: '资料', to: `/admin/contests/${id}/resources` },
    { key: 'prompts', label: 'AI提示词', to: `/admin/contests/${id}/ai-prompts` },
    { key: 'audit', label: '审计历史', to: `/admin/contests/${id}/audit` },
  ]
})

function isActive(to: string): boolean {
  if (to === `/admin/contests/${props.contestId}`)
    return route.path === to
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <nav class="p-2 border border-slate-200 rounded-lg bg-white">
    <div class="flex flex-wrap gap-2">
      <NuxtLink
        v-for="item in tabItems"
        :key="item.key"
        :to="item.to"
        class="text-xs font-medium px-3 py-1.5 rounded transition-colors"
        :class="isActive(item.to)
          ? 'bg-slate-900 text-white'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'"
      >
        {{ item.label }}
      </NuxtLink>
    </div>
  </nav>
</template>

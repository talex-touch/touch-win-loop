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

const tabs = computed(() => {
  return tabItems.value.map(item => ({
    key: item.key,
    label: item.label,
    to: item.to,
  }))
})

const activeKey = computed(() => {
  return tabItems.value.find(item => isActive(item.to))?.key || ''
})
</script>

<template>
  <SectionCard compact>
    <PillTabs :items="tabs" :active-key="activeKey" />
  </SectionCard>
</template>

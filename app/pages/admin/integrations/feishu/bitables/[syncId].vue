<script setup lang="ts">
definePageMeta({
  layout: 'admin',
})

const route = useRoute()

function readRouteParam(name: string): string {
  const params = route.params as Record<string, string | string[] | undefined>
  const value = params[name]
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim()
}

function readQueryValue(name: string): string {
  const value = route.query[name]
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim()
}

const syncId = computed(() => readRouteParam('syncId'))
const selectedItemId = computed(() => readQueryValue('item'))
const draftTableId = computed(() => readQueryValue('draftTableId'))
const draftViewId = computed(() => readQueryValue('draftViewId'))

async function handleItemChange(itemId: string) {
  const nextId = String(itemId || '').trim()
  const nextQuery = {
    ...route.query,
  } as Record<string, string>
  if (nextId)
    nextQuery.item = nextId
  else
    delete nextQuery.item
  await navigateTo({
    path: route.path,
    query: nextQuery,
  }, { replace: true })
}
</script>

<template>
  <div class="p-4">
    <AdminFeishuBitableSyncEditor
      v-if="syncId"
      :sync-id="syncId"
      :selected-item-id="selectedItemId"
      :draft-table-id="draftTableId"
      :draft-view-id="draftViewId"
      @item-change="handleItemChange"
    />
    <a-empty v-else description="同步信息不存在" />
  </div>
</template>

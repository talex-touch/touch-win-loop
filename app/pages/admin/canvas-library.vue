<script setup lang="ts">
import AdminCanvasLibraryItemsManager from '~/components/admin/canvas-library/AdminCanvasLibraryItemsManager.vue'
import AdminCanvasLibraryMockupModelsManager from '~/components/admin/canvas-library/AdminCanvasLibraryMockupModelsManager.vue'

definePageMeta({
  layout: 'admin',
})

type CanvasLibraryAdminTab = 'items' | 'mockups'

const route = useRoute()
const router = useRouter()

const TAB_OPTIONS: Array<{ key: CanvasLibraryAdminTab, label: string }> = [
  { key: 'items', label: '模板 / 素材' },
  { key: 'mockups', label: 'Mockup 型号' },
]

const activeTab = computed<CanvasLibraryAdminTab>(() => {
  const raw = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
  return raw === 'mockups' ? 'mockups' : 'items'
})

function setActiveTab(nextTab: CanvasLibraryAdminTab): void {
  const nextQuery: Record<string, string | string[]> = {}

  Object.entries(route.query).forEach(([key, value]) => {
    if (key === 'tab' || value === undefined)
      return
    if (Array.isArray(value)) {
      nextQuery[key] = value.filter((entry): entry is string => typeof entry === 'string')
      return
    }
    if (typeof value === 'string')
      nextQuery[key] = value
  })

  if (nextTab !== 'items')
    nextQuery.tab = nextTab

  void router.replace({
    query: nextQuery,
  })
}
</script>

<template>
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <h1 class="text-lg text-slate-900 font-semibold">
        画布资源库
      </h1>
      <p class="text-xs text-slate-500 leading-5 mt-1">
        统一管理模板、素材和 Mockup 型号。Mockup 不再单开后台模块，而是作为画布资源库里的专项类型维护。
      </p>
    </section>

    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="item in TAB_OPTIONS"
          :key="item.key"
          class="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
          :class="activeTab === item.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
          type="button"
          @click="setActiveTab(item.key)"
        >
          {{ item.label }}
        </button>
      </div>
    </section>

    <AdminCanvasLibraryItemsManager v-if="activeTab === 'items'" />
    <AdminCanvasLibraryMockupModelsManager
      v-else
      @open-library-items="setActiveTab('items')"
    />
  </div>
</template>

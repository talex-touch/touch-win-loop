<script setup lang="ts">
interface UserSettingsTabItem {
  id: string
  label: string
  icon: string
}

interface UserSettingsTabGroup {
  id: string
  label: string
  tabs: UserSettingsTabItem[]
}

const props = withDefaults(defineProps<{
  visible?: boolean
  activeTab: string
  tabGroups: UserSettingsTabGroup[]
  closeDisabled?: boolean
}>(), {
  visible: false,
  closeDisabled: false,
})

const emit = defineEmits<{
  close: []
  selectTab: [tabId: string]
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="props.visible"
      class="p-4 bg-slate-950/40 flex items-center inset-0 justify-center fixed z-50"
      @click.self="emit('close')"
    >
      <div class="border border-slate-200 rounded-[24px] bg-white flex flex-col h-full max-h-[84vh] max-w-[860px] w-full shadow-2xl overflow-hidden lg:h-[560px] lg:max-h-[560px]">
        <div class="flex flex-1 flex-col min-h-0 lg:flex-row">
          <aside class="border-b border-slate-200 bg-slate-50 flex shrink-0 flex-col lg:border-b-0 lg:border-r lg:w-[176px]">
            <div class="px-3 pb-1.5 pt-3 flex items-center lg:px-4 lg:pb-2 lg:pt-4">
              <button
                class="text-slate-500 rounded-full flex h-10 w-10 transition items-center justify-center hover:text-slate-800 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="props.closeDisabled"
                @click="emit('close')"
              >
                <span class="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>

            <div class="user-settings-nav">
              <section
                v-for="group in props.tabGroups"
                :key="group.id"
                class="user-settings-nav-group"
              >
                <p class="user-settings-nav-group__label">
                  {{ group.label }}
                </p>
                <div class="user-settings-nav-group__tabs">
                  <button
                    v-for="tab in group.tabs"
                    :key="tab.id"
                    type="button"
                    class="user-settings-tab"
                    :class="{ 'is-active': props.activeTab === tab.id }"
                    @click="emit('selectTab', tab.id)"
                  >
                    <span class="material-symbols-outlined text-[18px]">{{ tab.icon }}</span>
                    <span class="user-settings-tab__label">{{ tab.label }}</span>
                  </button>
                </div>
              </section>
            </div>
          </aside>

          <section class="bg-white flex flex-1 flex-col min-h-0">
            <div class="px-4 py-4 flex-1 min-h-0 overflow-y-auto sm:px-5">
              <slot />
            </div>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { WorkspaceMetaKItem, WorkspaceMetaKSection } from '~/utils/workspace-metak'

const props = withDefaults(defineProps<{
  visible?: boolean
  query?: string
  sections?: WorkspaceMetaKSection[]
  shortcutLabel?: string
}>(), {
  visible: false,
  query: '',
  sections: () => [],
  shortcutLabel: '⌘K',
})

const emit = defineEmits<{
  (event: 'update:query', value: string): void
  (event: 'close'): void
  (event: 'execute', item: WorkspaceMetaKItem): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const activeItemId = ref('')
const itemRefs = new Map<string, HTMLElement>()

const flatItems = computed(() => props.sections.flatMap(section => section.items))

function setItemRef(itemId: string, element: unknown): void {
  if (element instanceof HTMLElement)
    itemRefs.set(itemId, element)
  else
    itemRefs.delete(itemId)
}

function focusInput(): void {
  nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
}

function syncActiveItem(options: { preserve?: boolean } = {}): void {
  if (!flatItems.value.length) {
    activeItemId.value = ''
    return
  }

  if (options.preserve && flatItems.value.some(item => item.id === activeItemId.value))
    return

  activeItemId.value = flatItems.value[0]!.id
}

function scrollActiveItemIntoView(): void {
  const element = itemRefs.get(activeItemId.value)
  if (!element)
    return
  element.scrollIntoView({
    block: 'nearest',
  })
}

function activeIndex(): number {
  return flatItems.value.findIndex(item => item.id === activeItemId.value)
}

function moveActive(offset: number): void {
  if (!flatItems.value.length)
    return

  const currentIndex = activeIndex()
  const fallbackIndex = currentIndex < 0 ? 0 : currentIndex
  const nextIndex = (fallbackIndex + offset + flatItems.value.length) % flatItems.value.length
  activeItemId.value = flatItems.value[nextIndex]!.id
  nextTick(scrollActiveItemIntoView)
}

function executeActiveItem(): void {
  const item = flatItems.value.find(candidate => candidate.id === activeItemId.value)
  if (!item)
    return
  emit('execute', item)
}

function onInput(event: Event): void {
  emit('update:query', (event.target as HTMLInputElement).value)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveActive(1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveActive(-1)
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    executeActiveItem()
  }
}

function selectItem(item: WorkspaceMetaKItem): void {
  activeItemId.value = item.id
  emit('execute', item)
}

function activateItem(itemId: string): void {
  activeItemId.value = itemId
}

function metaTypeLabel(item: WorkspaceMetaKItem): string {
  switch (item.type) {
    case 'command':
      return '命令'
    case 'resource':
      return '资源'
    case 'outline':
      return '大纲'
    case 'meeting':
      return '会议'
    case 'issue':
      return 'Issue'
    case 'contest':
      return '竞赛'
    case 'workspace':
      return '空间'
    case 'project':
      return '项目'
    case 'library_resource':
      return '资料库'
  }
}

watch(() => props.visible, (nextVisible) => {
  if (!nextVisible)
    return
  syncActiveItem()
  focusInput()
}, { immediate: true })

watch(() => props.query, () => {
  syncActiveItem()
}, { immediate: true })

watch(flatItems, () => {
  syncActiveItem({ preserve: true })
}, { deep: true })
</script>

<template>
  <Teleport to="body">
    <Transition name="workspace-metak-fade">
      <div
        v-if="visible"
        class="workspace-metak px-4 py-4 flex items-center inset-0 justify-center fixed z-[90] sm:py-6"
        data-testid="workspace-metak"
      >
        <button
          class="border-none bg-slate-950/10 inset-0 absolute"
          type="button"
          aria-label="关闭 MetaK"
          @click="emit('close')"
        />

        <section
          class="workspace-metak__panel border border-slate-200/90 rounded-[16px] bg-white flex flex-col max-h-[min(60vh,520px)] max-w-[640px] w-full relative overflow-hidden"
          @keydown="onKeydown"
        >
          <header class="px-4 py-2.5 border-b border-slate-100 sm:px-5">
            <div class="flex gap-1.5 items-center">
              <div class="text-blue-600 rounded-md bg-blue-50 flex shrink-0 h-[30px] w-[30px] items-center justify-center">
                <span class="material-symbols-outlined text-[17px]">search</span>
              </div>
              <div class="flex-1 min-w-0">
                <input
                  id="workspace-metak-search-input"
                  ref="inputRef"
                  :value="query"
                  class="text-[12px] text-slate-900 leading-5 font-medium px-0 py-0 outline-none border-none bg-transparent w-full placeholder:text-slate-400"
                  data-testid="workspace-metak-search-input"
                  placeholder="搜索命令、资源、会议、竞赛或系统资料库"
                  type="text"
                  @input="onInput"
                >
              </div>
              <div class="text-[9px] text-slate-500 leading-none font-semibold px-1.5 py-0.5 border border-slate-200 rounded-md bg-slate-50 hidden sm:block">
                {{ shortcutLabel }}
              </div>
            </div>
          </header>

          <div class="px-2 py-0.5 flex-1 min-h-0 overflow-y-auto sm:px-3">
            <template v-if="sections.length > 0">
              <section
                v-for="section in sections"
                :key="section.id"
                class="workspace-metak__section"
                :data-testid="`workspace-metak-section-${section.id}`"
              >
                <div class="workspace-metak__section-head">
                  <span>{{ section.title }}</span>
                  <span v-if="section.loading" class="text-slate-400">检索中...</span>
                </div>

                <div class="space-y-1">
                  <button
                    v-for="item in section.items"
                    :ref="(element) => setItemRef(item.id, element)"
                    :key="item.id"
                    class="workspace-metak__item"
                    :class="{ 'workspace-metak__item--active': activeItemId === item.id }"
                    data-testid="workspace-metak-item"
                    type="button"
                    @focus="activateItem(item.id)"
                    @click="selectItem(item)"
                  >
                    <span class="workspace-metak__item-icon">
                      <span class="material-symbols-outlined text-[16px]">{{ item.icon }}</span>
                    </span>
                    <span class="flex-1 min-w-0">
                      <span class="flex gap-1.5 items-center">
                        <span class="text-[13px] leading-5 font-semibold truncate">{{ item.title }}</span>
                        <span
                          v-if="item.badge"
                          class="text-[9px] text-slate-500 leading-none font-semibold px-1.5 py-0.5 rounded-full bg-slate-100"
                        >
                          {{ item.badge }}
                        </span>
                      </span>
                      <span
                        v-if="item.subtitle"
                        class="text-[10px] text-slate-500 leading-4 mt-0.5 block truncate"
                      >
                        {{ item.subtitle }}
                      </span>
                    </span>
                    <span class="text-right shrink-0">
                      <span class="text-[9px] text-slate-400 leading-none tracking-[0.12em] font-semibold block uppercase">
                        {{ metaTypeLabel(item) }}
                      </span>
                      <span
                        v-if="item.hint"
                        class="text-[10px] text-slate-500 leading-4 mt-0.5 block"
                      >
                        {{ item.hint }}
                      </span>
                    </span>
                  </button>
                </div>
              </section>
            </template>

            <div
              v-else
              class="px-6 py-5 text-center flex flex-col min-h-[128px] items-center justify-center"
              data-testid="workspace-metak-empty"
            >
              <div class="text-slate-400 rounded-xl bg-slate-100 flex h-10 w-10 items-center justify-center">
                <span class="material-symbols-outlined text-[20px]">search_off</span>
              </div>
              <p class="text-[13px] text-slate-800 font-semibold mt-3">
                没有匹配结果
              </p>
              <p class="text-[11px] text-slate-500 leading-5 mt-1.5 max-w-md">
                试试更短的关键词，或者直接搜索命令名、资源标题、会议名称、竞赛名称。
              </p>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.workspace-metak__section + .workspace-metak__section {
  margin-top: 0.125rem;
}

.workspace-metak__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.3125rem 0.75rem 0.1875rem;
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: rgb(100 116 139);
  text-transform: uppercase;
}

.workspace-metak__item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.625rem;
  border: 1px solid transparent;
  border-radius: 0.75rem;
  background: transparent;
  padding: 0.4375rem 0.625rem;
  text-align: left;
  transition:
    border-color 140ms ease,
    background-color 140ms ease;
}

.workspace-metak__item:focus-visible,
.workspace-metak__item--active {
  border-color: rgb(191 219 254);
  background: rgb(248 250 252);
  outline: none;
}

.workspace-metak__item-icon {
  display: inline-flex;
  height: 1.75rem;
  width: 1.75rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: rgb(248 250 252);
  color: rgb(71 85 105);
  transition:
    background-color 140ms ease,
    color 140ms ease;
}

.workspace-metak__item:focus-visible .workspace-metak__item-icon,
.workspace-metak__item--active .workspace-metak__item-icon {
  background: rgb(219 234 254);
  color: rgb(37 99 235);
}

.workspace-metak-fade-enter-active,
.workspace-metak-fade-leave-active {
  transition: opacity 180ms ease;
}

.workspace-metak-fade-enter-active .workspace-metak__panel,
.workspace-metak-fade-leave-active .workspace-metak__panel {
  transition:
    transform 180ms ease,
    opacity 180ms ease;
}

.workspace-metak-fade-enter-from,
.workspace-metak-fade-leave-to {
  opacity: 0;
}

.workspace-metak-fade-enter-from .workspace-metak__panel,
.workspace-metak-fade-leave-to .workspace-metak__panel {
  opacity: 0;
  transform: translateY(-6px) scale(0.985);
}
</style>

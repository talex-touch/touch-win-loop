<script setup lang="ts">
import WLDesignLayer from './WLDesignLayer.vue'

const props = withDefaults(defineProps<{
  title?: string
  subtitle?: string
  scrollable?: boolean
  headerSticky?: boolean
  padding?: 'sm' | 'md' | 'lg'
}>(), {
  title: '',
  subtitle: '',
  scrollable: true,
  headerSticky: false,
  padding: 'md',
})

function resolvePaddingClass(): string {
  if (props.padding === 'sm')
    return 'p-2'
  if (props.padding === 'lg')
    return 'p-3.5'
  return 'p-3'
}
</script>

<template>
  <WLDesignLayer variant="surface" :scrollable="false" :padded="false" :fill="true">
    <div class="flex h-full min-h-0 flex-col" data-testid="wl-design-container">
      <div
        v-if="props.title || props.subtitle || $slots.actions || $slots['header-extra'] || $slots['header-title'] || $slots['header-title-extra']"
        class="border-b border-slate-200/80 px-3.5 py-3"
        :class="props.headerSticky ? 'sticky top-0 z-10 bg-white/90 backdrop-blur-xl' : ''"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div v-if="props.title || $slots['header-title'] || $slots['header-title-extra']" class="flex min-w-0 items-center gap-2">
              <slot name="header-title">
                <h3 v-if="props.title" class="truncate text-sm font-bold text-slate-900">
                  {{ props.title }}
                </h3>
              </slot>
              <slot name="header-title-extra" />
            </div>
            <p v-if="props.subtitle" class="mt-1 text-xs leading-5 text-slate-500">
              {{ props.subtitle }}
            </p>
          </div>
          <div v-if="$slots.actions" class="shrink-0">
            <slot name="actions" />
          </div>
        </div>
        <div v-if="$slots['header-extra']" class="mt-3 flex flex-col gap-2">
          <slot name="header-extra" />
        </div>
      </div>

      <div v-if="$slots.badges" class="border-b border-slate-200/80 px-3.5 py-2.5">
        <div class="flex flex-wrap gap-2">
          <slot name="badges" />
        </div>
      </div>

      <div
        class="min-h-0 flex-1 min-w-0"
        :class="[props.scrollable ? 'overflow-y-auto overflow-x-hidden overscroll-contain' : 'overflow-hidden', resolvePaddingClass()]"
      >
        <slot />
      </div>

      <div v-if="$slots.footer" class="border-t border-slate-200/80 px-3.5 py-3">
        <slot name="footer" />
      </div>
    </div>
  </WLDesignLayer>
</template>

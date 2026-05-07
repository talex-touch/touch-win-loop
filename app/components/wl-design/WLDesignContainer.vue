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
    <div class="flex flex-col h-full min-h-0" data-testid="wl-design-container">
      <div
        v-if="props.title || props.subtitle || $slots.actions || $slots['header-extra'] || $slots['header-title'] || $slots['header-title-extra']"
        class="px-3.5 py-3 border-b border-slate-200/80"
        :class="props.headerSticky ? 'sticky top-0 z-10 bg-white/90 backdrop-blur-xl' : ''"
      >
        <div class="flex gap-3 items-start justify-between">
          <div class="min-w-0">
            <div v-if="props.title || $slots['header-title'] || $slots['header-title-extra']" class="flex gap-2 min-w-0 items-center">
              <slot name="header-title">
                <h3 v-if="props.title" class="text-sm text-slate-900 font-bold truncate">
                  {{ props.title }}
                </h3>
              </slot>
              <slot name="header-title-extra" />
            </div>
            <p v-if="props.subtitle" class="text-xs text-slate-500 leading-5 mt-1">
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

      <div v-if="$slots.badges" class="px-3.5 py-2.5 border-b border-slate-200/80">
        <div class="flex flex-wrap gap-2">
          <slot name="badges" />
        </div>
      </div>

      <div
        class="flex-1 min-h-0 min-w-0"
        :class="[props.scrollable ? 'overflow-y-auto overflow-x-hidden overscroll-contain' : 'overflow-hidden', resolvePaddingClass()]"
      >
        <slot />
      </div>

      <div v-if="$slots.footer" class="px-3.5 py-3 border-t border-slate-200/80">
        <slot name="footer" />
      </div>
    </div>
  </WLDesignLayer>
</template>

<script setup lang="ts">
import UniverseBackground from '~/components/common/UniverseBackground.vue'
</script>

<template>
  <!-- Contract anchor: grid min-h-[calc(100svh-3rem)] -->
  <div class="bg-slate-100 min-h-screen relative overflow-hidden isolate" data-testid="auth-layout">
    <div class="op-50 inset-0 absolute">
      <UniverseBackground
        :color-stops="['#5227FF', '#FF9FFC', '#B19EEF']"
        :speed="0.25"
        :blend="0.5"
        :amplitude="1.0"
        :intensity="1.0"
        class="h-full w-full"
      />
    </div>

    <div class="px-4 py-6 min-h-screen relative z-10 lg:px-8 sm:px-6">
      <div class="mx-auto grid max-w-6xl min-h-[calc(100svh-3rem)] w-full">
        <div class="flex col-start-1 row-start-1 items-center justify-center">
          <slot />
        </div>

        <div class="col-start-1 row-start-1 self-end">
          <LoginFooterBar />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import UniverseBackground from '~/components/common/UniverseBackground.vue'
</script>

<template>
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

    <div class="mx-auto px-4 py-6 flex flex-col max-w-6xl min-h-screen w-full relative z-10 lg:px-8 sm:px-6">
      <div class="flex flex-1 items-center justify-center">
        <slot />
      </div>

      <div class="pt-6">
        <LoginFooterBar />
      </div>
    </div>
  </div>
</template>

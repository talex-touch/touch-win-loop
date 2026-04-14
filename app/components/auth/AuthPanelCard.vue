<script setup lang="ts">
defineOptions({
  inheritAttrs: false,
})
</script>

<template>
  <section
    class="auth-panel-card"
    v-bind="$attrs"
  >
    <div class="auth-panel-card__glow">
      <div class="auth-panel-card__glow-orb auth-panel-card__glow-orb--top" />
      <div class="auth-panel-card__glow-orb auth-panel-card__glow-orb--bottom" />
      <div class="auth-panel-card__line" />
    </div>

    <div class="auth-panel-card__content">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.auth-panel-card {
  position: relative;
  overflow: hidden;
  width: 100%;
  max-width: 460px;
  padding: 24px;
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.42);
  box-shadow: 0 28px 90px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(24px);
}

.auth-panel-card__glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.auth-panel-card__glow-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(48px);
}

.auth-panel-card__glow-orb--top {
  top: -80px;
  right: -56px;
  width: 192px;
  height: 192px;
  background: rgba(255, 255, 255, 0.55);
}

.auth-panel-card__glow-orb--bottom {
  bottom: -72px;
  left: -44px;
  width: 144px;
  height: 144px;
  background: rgba(226, 232, 240, 0.45);
}

.auth-panel-card__line {
  position: absolute;
  inset-inline: 32px;
  top: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.9), transparent);
}

.auth-panel-card__content {
  position: relative;
}

@media (max-width: 640px) {
  .auth-panel-card {
    padding: 20px;
    border-radius: 28px;
  }
}
</style>

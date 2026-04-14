<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    leftWidth?: number;
    leftCollapsed?: boolean;
    collapsedLeftWidth?: number;
    rightWidth?: number;
    rightCollapsed?: boolean;
    collapsedRightWidth?: number;
    minCanvasWidth?: number;
    gap?: number;
  }>(),
  {
    leftWidth: 336,
    leftCollapsed: false,
    collapsedLeftWidth: 36,
    rightWidth: 312,
    rightCollapsed: false,
    collapsedRightWidth: 36,
    minCanvasWidth: 720,
    gap: 14,
  },
);

const layoutStyle = computed<Record<string, string>>(() => {
  const leftWidth = props.leftCollapsed
    ? props.collapsedLeftWidth
    : props.leftWidth;
  const rightWidth = props.rightCollapsed
    ? props.collapsedRightWidth
    : props.rightWidth;
  return {
    "--wl-design-gap": `${props.gap}px`,
    "--wl-design-left-width": `${leftWidth}px`,
    "--wl-design-right-width": `${rightWidth}px`,
    "--wl-design-min-canvas-width": `${props.minCanvasWidth}px`,
  };
});
</script>

<template>
  <div
    class="wl-design-layout relative h-full min-h-0 w-full overflow-hidden"
    :style="layoutStyle"
    :data-left-collapsed="props.leftCollapsed ? 'true' : 'false'"
    :data-right-collapsed="props.rightCollapsed ? 'true' : 'false'"
    data-testid="wl-design-layout"
  >
    <section class="absolute inset-0 z-0 min-h-0 min-w-0">
      <slot name="canvas" />
    </section>

    <aside class="wl-design-layout__dock wl-design-layout__dock--left">
      <div class="wl-design-layout__dock-inner">
        <slot name="left" />
      </div>
    </aside>

    <aside class="wl-design-layout__dock wl-design-layout__dock--right">
      <div class="wl-design-layout__dock-inner">
        <slot name="right" />
      </div>
    </aside>

    <div class="wl-design-layout__toolbar">
      <div class="wl-design-layout__toolbar-inner">
        <slot name="bottom-toolbar" />
      </div>
    </div>

    <div
      class="wl-design-layout__floating-controls"
      data-wl-design-floating-controls-root
    />

    <div class="pointer-events-none absolute inset-0 z-[50]">
      <slot name="overlay" />
    </div>
  </div>
</template>

<style scoped>
.wl-design-layout__dock {
  position: absolute;
  top: var(--wl-design-gap);
  bottom: var(--wl-design-gap);
  z-index: 20;
  pointer-events: none;
}

.wl-design-layout__dock--left {
  left: var(--wl-design-gap);
  width: min(
    var(--wl-design-left-width),
    calc(100vw - (var(--wl-design-gap) * 2))
  );
  transition: width 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.wl-design-layout__dock--right {
  right: var(--wl-design-gap);
  width: min(
    var(--wl-design-right-width),
    calc(100vw - (var(--wl-design-gap) * 2))
  );
  transition: width 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.wl-design-layout__dock-inner {
  pointer-events: auto;
}

.wl-design-layout__dock--left .wl-design-layout__dock-inner {
  height: auto;
  max-height: 100%;
}

.wl-design-layout__dock--right .wl-design-layout__dock-inner {
  height: 100%;
}

.wl-design-layout__toolbar {
  position: absolute;
  bottom: var(--wl-design-gap);
  left: 50%;
  z-index: 30;
  width: max-content;
  max-width: calc(100vw - (var(--wl-design-gap) * 2));
  transform: translateX(-50%);
  pointer-events: none;
}

.wl-design-layout__toolbar-inner {
  display: flex;
  justify-content: center;
  width: 100%;
  pointer-events: auto;
}

.wl-design-layout__floating-controls {
  position: absolute;
  inset: 0;
  z-index: 40;
  pointer-events: none;
}

@media (max-width: 1023px) {
  .wl-design-layout__dock {
    left: 12px;
    right: 12px;
    width: auto;
    max-width: calc(100vw - 24px);
  }

  .wl-design-layout__dock--left {
    top: 12px;
    bottom: auto;
    height: min(42vh, 360px);
  }

  .wl-design-layout__dock--right {
    top: auto;
    bottom: 88px;
    height: min(36vh, 320px);
  }

  .wl-design-layout[data-left-collapsed="true"] .wl-design-layout__dock--left {
    right: auto;
    width: min(var(--wl-design-left-width), calc(100vw - 24px));
  }

  .wl-design-layout[data-right-collapsed="true"]
    .wl-design-layout__dock--right {
    left: auto;
    width: min(var(--wl-design-right-width), calc(100vw - 24px));
  }

  .wl-design-layout__toolbar {
    left: 12px;
    right: 12px;
    bottom: 12px;
    width: auto;
    max-width: none;
    transform: none;
  }
}
</style>

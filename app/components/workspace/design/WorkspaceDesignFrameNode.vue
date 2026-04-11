<script setup lang="ts">
import type { DesignElementModel, DesignFrameModel } from '~~/shared/types/domain'
import { computed } from 'vue'
import { resolveDeviceFramePreset } from '~~/shared/utils/scene-document'

const props = withDefaults(defineProps<{
  frame: DesignFrameModel
  selected?: boolean
}>(), {
  selected: false,
})

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function findElement(type: DesignElementModel['type'], preferredId = ''): DesignElementModel | null {
  const elements = props.frame.elements || []
  return elements.find(element => element.id === preferredId)
    || elements.find(element => element.type === type)
    || null
}

const themeTokens = computed(() => {
  return {
    background: normalizeString(props.frame.themeTokens?.background) || '#0f172a',
    surface: normalizeString(props.frame.themeTokens?.surface) || '#ffffff',
    accent: normalizeString(props.frame.themeTokens?.accent) || '#38bdf8',
    text: normalizeString(props.frame.themeTokens?.text) || '#e2e8f0',
    muted: normalizeString(props.frame.themeTokens?.muted) || '#94a3b8',
  }
})

const titleText = computed(() => normalizeString(findElement('text', 'title')?.text) || props.frame.name)
const subtitleText = computed(() => normalizeString(findElement('caption', 'subtitle')?.text))
const badgeText = computed(() => normalizeString(findElement('badge', 'badge')?.text))
const imageSrc = computed(() => normalizeString(findElement('image', 'hero-image')?.imageSrc))
const devicePreset = computed(() => {
  if (props.frame.kind !== 'device_mockup')
    return null
  return resolveDeviceFramePreset(props.frame.deviceFramePresetKey || 'iphone-16-pro')
})
const diagramStats = computed(() => {
  const embeddedScene = props.frame.embeddedScene
  return {
    drawMode: normalizeString(embeddedScene?.drawMode) || 'diagram',
    nodeCount: embeddedScene?.sceneModel?.nodes?.length || 0,
    edgeCount: embeddedScene?.sceneModel?.edges?.length || 0,
  }
})
</script>

<template>
  <article
    class="relative h-full w-full overflow-hidden rounded-[28px] border bg-slate-950/90 shadow-[0_30px_80px_rgba(15,23,42,0.2)]"
    :class="selected ? 'border-sky-400 ring-2 ring-sky-300/40' : 'border-slate-700/80'"
  >
    <div
      class="absolute inset-0"
      :style="{
        background: `linear-gradient(135deg, ${themeTokens.background} 0%, ${themeTokens.accent}22 100%)`,
      }"
    />
    <div class="absolute left-5 top-4 z-10 flex flex-wrap items-center gap-2">
      <span class="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/90">
        {{ frame.kind }}
      </span>
      <span
        v-if="badgeText"
        class="rounded-full px-2.5 py-1 text-[10px] font-semibold"
        :style="{
          backgroundColor: `${themeTokens.accent}22`,
          color: themeTokens.accent,
        }"
      >
        {{ badgeText }}
      </span>
      <span
        v-if="frame.locked"
        class="rounded-full border border-amber-200/40 bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold text-amber-100"
      >
        Locked
      </span>
    </div>

    <template v-if="frame.kind === 'device_mockup'">
      <div class="absolute inset-y-0 left-0 w-[46%] px-6 pb-6 pt-16">
        <h3 class="text-2xl font-semibold leading-tight" :style="{ color: themeTokens.text }">
          {{ titleText }}
        </h3>
        <p v-if="subtitleText" class="mt-3 text-sm leading-6" :style="{ color: themeTokens.muted }">
          {{ subtitleText }}
        </p>
      </div>

      <div class="absolute inset-y-0 right-0 flex w-[52%] items-center justify-center px-8 py-10">
        <div
          class="relative overflow-hidden border border-white/10 shadow-[0_28px_72px_rgba(15,23,42,0.28)]"
          :class="devicePreset?.deviceFamily === 'browser' ? 'rounded-[22px]' : 'rounded-[34px]'"
          :style="{ backgroundColor: devicePreset?.background || '#020617', width: devicePreset?.deviceFamily === 'browser' ? '92%' : '68%', aspectRatio: `${devicePreset?.width || 390} / ${devicePreset?.height || 844}` }"
        >
          <div
            v-if="devicePreset?.deviceFamily === 'browser'"
            class="flex h-10 items-center gap-2 border-b border-slate-200/70 bg-slate-100 px-4"
          >
            <span class="h-2.5 w-2.5 rounded-full bg-rose-400" />
            <span class="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span class="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
          <div class="absolute inset-x-3 bottom-3 top-3 overflow-hidden rounded-[26px] bg-slate-100" :class="devicePreset?.deviceFamily === 'browser' ? 'top-14 rounded-[18px]' : ''">
            <img v-if="imageSrc" :src="imageSrc" alt="" class="h-full w-full object-cover">
            <div v-else class="flex h-full items-center justify-center text-center text-sm font-medium text-slate-500">
              上传截图
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else-if="frame.kind === 'diagram'">
      <div class="absolute inset-0 p-6 pt-16">
        <div class="grid grid-cols-3 gap-3">
          <div class="rounded-2xl border border-white/10 bg-white/10 p-3">
            <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
              Draw Mode
            </p>
            <p class="mt-2 text-sm font-semibold text-white">
              {{ diagramStats.drawMode }}
            </p>
          </div>
          <div class="rounded-2xl border border-white/10 bg-white/10 p-3">
            <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
              Nodes
            </p>
            <p class="mt-2 text-sm font-semibold text-white">
              {{ diagramStats.nodeCount }}
            </p>
          </div>
          <div class="rounded-2xl border border-white/10 bg-white/10 p-3">
            <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
              Edges
            </p>
            <p class="mt-2 text-sm font-semibold text-white">
              {{ diagramStats.edgeCount }}
            </p>
          </div>
        </div>
        <div class="mt-5 rounded-[24px] border border-dashed border-white/12 bg-white/5 p-5">
          <h3 class="text-xl font-semibold leading-tight" :style="{ color: themeTokens.text }">
            {{ titleText }}
          </h3>
          <p class="mt-3 text-sm leading-6" :style="{ color: themeTokens.muted }">
            双击后进入图编辑态的下一步仍然走语义化结构，不把节点打散成普通自由对象。
          </p>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="absolute inset-0 p-6 pt-16">
        <h3 class="max-w-[70%] text-2xl font-semibold leading-tight" :style="{ color: themeTokens.text }">
          {{ titleText }}
        </h3>
        <p v-if="subtitleText" class="mt-3 max-w-[76%] text-sm leading-6" :style="{ color: themeTokens.muted }">
          {{ subtitleText }}
        </p>
        <div class="mt-6 grid h-[58%] grid-cols-[minmax(0,1fr),220px] gap-4">
          <div class="rounded-[24px] border border-white/10 bg-white/10 p-4">
            <div class="flex h-full flex-col justify-between">
              <div class="space-y-3">
                <div class="h-3 w-24 rounded-full bg-white/15" />
                <div class="h-3 w-full rounded-full bg-white/10" />
                <div class="h-3 w-[82%] rounded-full bg-white/10" />
              </div>
              <div class="flex gap-2">
                <span class="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span class="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span class="h-2.5 w-2.5 rounded-full bg-white/20" />
              </div>
            </div>
          </div>
          <div class="overflow-hidden rounded-[24px] border border-white/10 bg-white/10">
            <img v-if="imageSrc" :src="imageSrc" alt="" class="h-full w-full object-cover">
            <div v-else class="flex h-full items-center justify-center text-sm font-medium text-white/50">
              图片 / 形状
            </div>
          </div>
        </div>
      </div>
    </template>
  </article>
</template>

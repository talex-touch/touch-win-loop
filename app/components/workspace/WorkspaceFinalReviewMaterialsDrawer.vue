<script setup lang="ts">
import type { ProjectResourceShare, Resource } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  open?: boolean
  resources?: Resource[]
  shares?: ProjectResourceShare[]
  resourcesLoading?: boolean
  sharesLoading?: boolean
}>(), {
  open: false,
  resources: () => [],
  shares: () => [],
  resourcesLoading: false,
  sharesLoading: false,
})

const emit = defineEmits<{
  close: []
  openResource: [resourceId: string]
}>()

function formatShareExpiry(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return '过期时间待确认'
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} 到期`
}
</script>

<template>
  <div
    class="workspace-final-review-materials-layer"
    :class="{ 'workspace-final-review-materials-layer--open': props.open }"
  >
    <button
      class="workspace-final-review-materials-layer__scrim"
      type="button"
      aria-label="关闭终审资料抽屉"
      @click="emit('close')"
    />

    <aside
      data-testid="workspace-final-review-materials-drawer"
      class="workspace-final-review-materials-drawer"
      :aria-hidden="props.open ? 'false' : 'true'"
    >
      <header class="workspace-final-review-materials-drawer__header">
        <div class="space-y-1">
          <p class="workspace-final-review-materials-drawer__eyebrow">
            终审资料
          </p>
          <h2 class="workspace-final-review-materials-drawer__title">
            资料与共享抽屉
          </h2>
          <p class="workspace-final-review-materials-drawer__summary">
            保留资料列表、共享链接与打开资源动作，不再占主布局宽度。
          </p>
        </div>

        <button class="workspace-final-review-materials-drawer__close" type="button" @click="emit('close')">
          关闭
        </button>
      </header>

      <section class="workspace-final-review-materials-drawer__section">
        <div class="workspace-final-review-materials-drawer__section-header">
          <strong>项目资料</strong>
          <span>{{ props.resources.length }} 份</span>
        </div>

        <p v-if="props.resourcesLoading" class="workspace-final-review-materials-drawer__empty">
          正在读取项目资料...
        </p>
        <ul v-else-if="props.resources.length > 0" class="workspace-final-review-materials-drawer__list">
          <li v-for="resource in props.resources" :key="resource.id" class="workspace-final-review-materials-drawer__item">
            <div class="min-w-0">
              <strong class="workspace-final-review-materials-drawer__item-title">{{ resource.title }}</strong>
              <p class="workspace-final-review-materials-drawer__item-meta">
                {{ resource.type || '资料' }}
                <span v-if="resource.source"> · {{ resource.source }}</span>
              </p>
            </div>
            <button class="workspace-final-review-materials-drawer__action" type="button" @click="emit('openResource', resource.id)">
              打开
            </button>
          </li>
        </ul>
        <p v-else class="workspace-final-review-materials-drawer__empty">
          当前还没有关联项目资料。
        </p>
      </section>

      <section class="workspace-final-review-materials-drawer__section">
        <div class="workspace-final-review-materials-drawer__section-header">
          <strong>共享链接</strong>
          <span>{{ props.shares.length }} 条</span>
        </div>

        <p v-if="props.sharesLoading" class="workspace-final-review-materials-drawer__empty">
          正在读取共享信息...
        </p>
        <ul v-else-if="props.shares.length > 0" class="workspace-final-review-materials-drawer__list">
          <li v-for="share in props.shares" :key="share.id" class="workspace-final-review-materials-drawer__item workspace-final-review-materials-drawer__item--stacked">
            <div class="min-w-0">
              <strong class="workspace-final-review-materials-drawer__item-title">{{ share.resourceTitle }}</strong>
              <p class="workspace-final-review-materials-drawer__item-meta">
                {{ share.visibility }} · {{ share.duration }} · {{ formatShareExpiry(share.expiresAt) }}
              </p>
              <p class="workspace-final-review-materials-drawer__item-link">
                {{ share.shareUrl }}
              </p>
            </div>
          </li>
        </ul>
        <p v-else class="workspace-final-review-materials-drawer__empty">
          当前还没有可用共享链接。
        </p>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.workspace-final-review-materials-layer {
  position: absolute;
  inset: 0;
  z-index: 24;
  pointer-events: none;
}

.workspace-final-review-materials-layer--open {
  pointer-events: auto;
}

.workspace-final-review-materials-layer__scrim {
  position: absolute;
  inset: 0;
  border: none;
  background: rgba(15, 23, 42, 0.08);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.workspace-final-review-materials-layer--open .workspace-final-review-materials-layer__scrim {
  opacity: 1;
  pointer-events: auto;
}

.workspace-final-review-materials-drawer {
  position: absolute;
  top: 16px;
  bottom: 16px;
  left: 16px;
  width: min(368px, calc(100% - 32px));
  border: 1px solid rgba(214, 224, 238, 0.95);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(18px);
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px;
  transform: translateX(-108%);
  opacity: 0;
  transition:
    transform 0.22s ease,
    opacity 0.18s ease;
}

.workspace-final-review-materials-layer--open .workspace-final-review-materials-drawer {
  transform: translateX(0);
  opacity: 1;
}

.workspace-final-review-materials-drawer__header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.workspace-final-review-materials-drawer__eyebrow,
.workspace-final-review-materials-drawer__section-header span {
  color: #5473a3;
  font-size: 11px;
  line-height: 1.4;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.workspace-final-review-materials-drawer__title {
  margin: 0;
  color: #0f172a;
  font-size: 20px;
  line-height: 1.2;
  font-weight: 700;
}

.workspace-final-review-materials-drawer__summary,
.workspace-final-review-materials-drawer__empty,
.workspace-final-review-materials-drawer__item-meta,
.workspace-final-review-materials-drawer__item-link {
  margin: 0;
  color: #617591;
  font-size: 12px;
  line-height: 1.7;
}

.workspace-final-review-materials-drawer__close,
.workspace-final-review-materials-drawer__action {
  border: 1px solid #d9e2ef;
  border-radius: 999px;
  background: #ffffff;
  color: #264061;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease;
}

.workspace-final-review-materials-drawer__close {
  min-height: 34px;
  padding: 0 12px;
  font-size: 12px;
  line-height: 1;
  font-weight: 600;
}

.workspace-final-review-materials-drawer__action {
  min-height: 32px;
  padding: 0 11px;
  font-size: 12px;
  line-height: 1;
  font-weight: 600;
  white-space: nowrap;
}

.workspace-final-review-materials-drawer__close:hover,
.workspace-final-review-materials-drawer__action:hover {
  border-color: #bfd1eb;
  background: #f7faff;
}

.workspace-final-review-materials-drawer__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.workspace-final-review-materials-drawer__section-header {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.workspace-final-review-materials-drawer__section-header strong,
.workspace-final-review-materials-drawer__item-title {
  color: #14213a;
  font-size: 14px;
  line-height: 1.5;
  font-weight: 600;
}

.workspace-final-review-materials-drawer__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

.workspace-final-review-materials-drawer__item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  border: 1px solid #e3eaf4;
  border-radius: 16px;
  background: #fbfdff;
  padding: 12px 13px;
}

.workspace-final-review-materials-drawer__item--stacked {
  justify-content: flex-start;
}

.workspace-final-review-materials-drawer__item-link {
  word-break: break-all;
}
</style>

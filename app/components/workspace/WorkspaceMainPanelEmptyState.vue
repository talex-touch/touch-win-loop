<script setup lang="ts">
const emit = defineEmits<{
  openDashboard: []
}>()
</script>

<template>
  <div class="workspace-main-empty-state">
    <div class="workspace-main-empty-state__watermark" aria-hidden="true">
      <span>WIN</span>
      <span>LOOP</span>
    </div>

    <div class="workspace-main-empty-state__card">
      <div class="workspace-main-empty-state__eyebrow">
        工作区视图
      </div>
      <h2 class="workspace-main-empty-state__title">
        从默认仪表盘继续当前项目
      </h2>
      <p class="workspace-main-empty-state__description">
        关闭所有标签页后，仍然可以从默认仪表盘重新进入分析、协作和设置链路。
      </p>
      <button
        class="workspace-main-empty-state__button"
        type="button"
        @click="emit('openDashboard')"
      >
        打开默认仪表盘
      </button>
    </div>
  </div>
</template>

<style scoped>
.workspace-main-empty-state {
  position: relative;
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 32px 20px;
}

.workspace-main-empty-state__watermark {
  position: absolute;
  inset: 24px auto 24px 24px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: clamp(44px, 7vw, 92px);
  line-height: 0.84;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: rgba(15, 23, 42, 0.05);
  user-select: none;
}

.workspace-main-empty-state__card {
  position: relative;
  z-index: 1;
  width: min(100%, 520px);
  border: 1px solid #dbe2ee;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 250, 252, 0.96) 100%);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
  padding: 32px;
  text-align: center;
}

.workspace-main-empty-state__eyebrow {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #2563eb;
}

.workspace-main-empty-state__title {
  margin-top: 14px;
  font-size: 28px;
  line-height: 1.15;
  font-weight: 700;
  color: #0f172a;
}

.workspace-main-empty-state__description {
  margin-top: 12px;
  font-size: 13px;
  line-height: 1.7;
  color: #475569;
}

.workspace-main-empty-state__button {
  margin-top: 24px;
  min-width: 188px;
  padding: 11px 20px;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  background: #ffffff;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.workspace-main-empty-state__button:hover {
  background: #2563eb;
  border-color: #2563eb;
  color: #ffffff;
}

@media (max-width: 768px) {
  .workspace-main-empty-state {
    padding: 24px 16px;
  }

  .workspace-main-empty-state__watermark {
    inset: 16px auto 16px 16px;
    font-size: clamp(36px, 14vw, 72px);
  }

  .workspace-main-empty-state__card {
    padding: 24px 20px;
    border-radius: 20px;
  }

  .workspace-main-empty-state__title {
    font-size: 24px;
  }
}
</style>

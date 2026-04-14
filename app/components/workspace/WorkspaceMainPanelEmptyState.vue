<template>
  <div class="workspace-main-empty-state">
    <WinLoopTextLogo />
  </div>
</template>

<style scoped>
.workspace-main-empty-state {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
}

@media (max-width: 768px) {
  .workspace-main-empty-state {
    padding: 24px 16px;
  }
}
</style>

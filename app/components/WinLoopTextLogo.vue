<template>
  <div class="winloop-text-logo" aria-label="WinLoop">
    <BrandLogo variant="lockup" class="winloop-text-logo__brand" />
  </div>
</template>

<style scoped>
.winloop-text-logo {
  display: inline-block;
  width: var(--winloop-text-logo-width, calc(var(--winloop-text-logo-size, 56px) * 4.6));
  max-width: min(72vw, 320px);
  line-height: 0;
}

.winloop-text-logo__brand {
  --winloop-brand-lockup-width: 100%;
  display: block;
  width: 100%;
}
</style>

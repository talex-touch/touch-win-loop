<template>
  <footer class="login-footer-bar">
    <span class="login-footer-bar__item login-footer-bar__item--left">隐私政策</span>
    <span class="login-footer-bar__brand">Powered by SayBang.</span>
    <span class="login-footer-bar__item login-footer-bar__item--right">使用协议</span>
  </footer>
</template>

<style scoped>
.login-footer-bar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: rgba(15, 23, 42, 0.74);
  font-size: 12px;
  line-height: 1;
  backdrop-filter: blur(14px);
}

.login-footer-bar__brand {
  justify-self: center;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.login-footer-bar__item--left {
  justify-self: start;
}

.login-footer-bar__item--right {
  justify-self: end;
}

@media (max-width: 640px) {
  .login-footer-bar {
    padding: 12px 14px;
    font-size: 11px;
  }

  .login-footer-bar__brand {
    letter-spacing: 0.02em;
  }
}
</style>

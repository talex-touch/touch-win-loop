<script setup lang="ts">
useHead({
  title: 'Logo Preview - WinLoop',
})

const logoVariants = [
  {
    id: 'mark',
    title: 'logo',
    description: '纯品牌图形，供导航、favicon 与入口图标使用。',
    variant: 'mark' as const,
    animated: false,
  },
  {
    id: 'lockup',
    title: 'logo+text',
    description: '图形与字标一体，用于登录页、空态页与品牌头部。',
    variant: 'lockup' as const,
    animated: false,
  },
  {
    id: 'animated',
    title: 'logo+animation',
    description: '仅用于品牌预览，真实页面默认保持静态。',
    variant: 'lockup' as const,
    animated: true,
  },
]
</script>

<template>
  <main class="logo-preview-page" data-testid="logo-preview-page">
    <section class="logo-preview-page__hero">
      <p class="logo-preview-page__eyebrow">
        WinLoop Brand Preview
      </p>
      <h1 class="logo-preview-page__title">
        统一品牌 Logo 预览
      </h1>
      <p class="logo-preview-page__description">
        当前页面只负责展示三种品牌用法，真实业务入口统一保持静态版本。
      </p>
    </section>

    <section class="logo-preview-page__grid">
      <article
        v-for="item in logoVariants"
        :key="item.id"
        class="logo-preview-card"
        :data-testid="`logo-preview-${item.id}`"
      >
        <div class="logo-preview-card__stage">
          <BrandLogo
            :variant="item.variant"
            :animated="item.animated"
            class="logo-preview-card__logo"
            :class="item.variant === 'mark' ? 'logo-preview-card__logo--mark' : ''"
          />
        </div>
        <div class="logo-preview-card__meta">
          <h2>{{ item.title }}</h2>
          <p>{{ item.description }}</p>
        </div>
      </article>
    </section>
  </main>
</template>

<style scoped>
.logo-preview-page {
  min-height: 100vh;
  padding: 56px 24px 72px;
  background:
    radial-gradient(circle at top left, rgba(56, 177, 245, 0.16), transparent 32%),
    linear-gradient(180deg, #f8fbff 0%, #eef5ff 100%);
}

.logo-preview-page__hero {
  max-width: 720px;
  margin: 0 auto 32px;
  text-align: center;
}

.logo-preview-page__eyebrow {
  margin: 0;
  color: #0f172a;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.logo-preview-page__title {
  margin: 12px 0 0;
  color: #0f172a;
  font-size: clamp(32px, 4vw, 44px);
  font-weight: 800;
  line-height: 1.05;
}

.logo-preview-page__description {
  margin: 14px auto 0;
  max-width: 560px;
  color: #475569;
  font-size: 15px;
  line-height: 1.7;
}

.logo-preview-page__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  max-width: 1120px;
  margin: 0 auto;
}

.logo-preview-card {
  display: grid;
  gap: 18px;
  padding: 22px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(16px);
}

.logo-preview-card__stage {
  display: grid;
  place-items: center;
  min-height: 260px;
  border-radius: 22px;
  background:
    radial-gradient(circle at top, rgba(56, 177, 245, 0.18), transparent 48%),
    linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

.logo-preview-card__logo {
  --winloop-brand-lockup-width: min(240px, 72%);
}

.logo-preview-card__logo--mark {
  --winloop-brand-mark-size: min(132px, 30vw);
}

.logo-preview-card__meta h2 {
  margin: 0;
  color: #0f172a;
  font-size: 18px;
  font-weight: 700;
}

.logo-preview-card__meta p {
  margin: 8px 0 0;
  color: #64748b;
  font-size: 14px;
  line-height: 1.65;
}

@media (max-width: 960px) {
  .logo-preview-page__grid {
    grid-template-columns: 1fr;
    max-width: 560px;
  }

  .logo-preview-card__stage {
    min-height: 220px;
  }
}
</style>

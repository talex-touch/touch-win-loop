import { pwa } from './app/config/pwa'
import { appDescription } from './app/constants'
import { getEnvPriorityOrder, loadWinloopEnv, resolveEnvNumber, resolveEnvValue } from './config/env'

loadWinloopEnv()

export default defineNuxtConfig({
  modules: [
    '@vueuse/nuxt',
    '@unocss/nuxt',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
    '@vite-pwa/nuxt',
    '@nuxt/eslint',
  ],

  devtools: {
    enabled: true,
  },

  app: {
    head: {
      viewport: 'width=device-width,initial-scale=1',
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/svg+xml', href: '/nuxt.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: appDescription },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', content: '#ffffff' },
      ],
    },
  },

  colorMode: {
    classSuffix: '',
    preference: 'light',
    fallback: 'light',
  },

  runtimeConfig: {
    envPriority: getEnvPriorityOrder().join(' > '),
    ai: {
      provider: resolveEnvValue('WINLOOP_AI_PROVIDER', 'openai-compatible'),
      baseURL: resolveEnvValue('WINLOOP_AI_BASE_URL', ''),
      apiKey: resolveEnvValue('WINLOOP_AI_API_KEY', ''),
      model: resolveEnvValue('WINLOOP_AI_MODEL', 'gpt-4o-mini'),
      timeoutMs: resolveEnvNumber('WINLOOP_AI_TIMEOUT_MS', 15000),
      maxRetries: resolveEnvNumber('WINLOOP_AI_MAX_RETRIES', 2),
    },
    pg: {
      url: resolveEnvValue('WINLOOP_PG_URL', 'postgresql://winloop@127.0.0.1:5432/winloop'),
    },
    redis: {
      url: resolveEnvValue('WINLOOP_REDIS_URL', 'redis://127.0.0.1:6379/0'),
    },
    public: {
      apiBaseUrl: resolveEnvValue('WINLOOP_API_BASE_URL', '/api'),
    },
  },

  devServer: {
    port: 3510,
  },

  future: {
    compatibilityVersion: 4,
  },

  experimental: {
    payloadExtraction: false,
    renderJsonPayloads: true,
    typedPages: true,
  },

  compatibilityDate: '2024-08-14',

  nitro: {
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    prerender: {
      crawlLinks: false,
      routes: ['/workspace'],
    },
  },

  eslint: {
    config: {
      standalone: false,
      nuxt: {
        sortConfigKeys: true,
      },
    },
  },

  pwa,
})

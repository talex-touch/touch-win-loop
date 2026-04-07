import { pwa } from './app/config/pwa'
import { appDescription } from './app/constants'
import {
  getEnvPriorityOrder,
  loadWinloopEnv,
  resolveBuildCommitSha,
  resolveBuildVersion,
  resolveEnvBoolean,
  resolveEnvNumber,
  resolveEnvValue,
} from './config/env'

loadWinloopEnv()
const resolvedBuildVersion = resolveBuildVersion()
const resolvedBuildCommitSha = resolveBuildCommitSha()

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
    nitro: {
      envPrefix: 'WINLOOP_',
    },
    envPriority: getEnvPriorityOrder().join(' > '),
    build: {
      version: resolvedBuildVersion,
      commitSha: resolvedBuildCommitSha,
    },
    ai: {
      provider: 'mock',
      baseURL: '',
      apiKey: '',
      model: 'gpt-4o-mini',
      embeddingModel: 'text-embedding-3-small',
      modelCatalogJson: '',
      modelPricingJson: '',
      providersJson: '',
      channelsJson: '',
      temperature: 0.2,
      topP: 1,
      maxTokens: 0,
      presencePenalty: 0,
      frequencyPenalty: 0,
      timeoutMs: 15000,
      maxRetries: 2,
    },
    docAi: {
      provider: 'mock',
      baseURL: '',
      apiKey: '',
      model: 'gpt-4o-mini',
      modelPricingJson: '',
      timeoutMs: 15000,
      maxRetries: 2,
    },
    onlyOffice: {
      endpoint: resolveEnvValue('WINLOOP_ONLYOFFICE_ENDPOINT', ''),
      jwtSecret: resolveEnvValue('WINLOOP_ONLYOFFICE_JWT_SECRET', ''),
      sourceBaseURL: resolveEnvValue('WINLOOP_PUBLIC_BASE_URL', ''),
    },
    projectResource: {
      accessUrlTtlSeconds: resolveEnvNumber('WINLOOP_PROJECT_RESOURCE_ACCESS_URL_TTL_SECONDS', 600),
    },
    storage: {
      provider: resolveEnvValue('WINLOOP_STORAGE_PROVIDER', 'local'),
      localRoot: resolveEnvValue('WINLOOP_STORAGE_LOCAL_ROOT', './tmp/document-storage'),
      endpoint: resolveEnvValue('WINLOOP_STORAGE_ENDPOINT', ''),
      region: resolveEnvValue('WINLOOP_STORAGE_REGION', ''),
      bucket: resolveEnvValue('WINLOOP_STORAGE_BUCKET', ''),
      accessKey: resolveEnvValue('WINLOOP_STORAGE_ACCESS_KEY', ''),
      secretKey: resolveEnvValue('WINLOOP_STORAGE_SECRET_KEY', ''),
      forcePathStyle: resolveEnvBoolean('WINLOOP_STORAGE_FORCE_PATH_STYLE', true),
    },
    adminAi: {
      enabled: false,
      tavilyApiKey: '',
      webTimeoutMs: 12000,
      maxWebResults: 5,
      maxPageChars: 10000,
    },
    pg: {
      url: resolveEnvValue('WINLOOP_PG_URL', 'postgresql://winloop@127.0.0.1:5432/winloop'),
    },
    redis: {
      url: resolveEnvValue('WINLOOP_REDIS_URL', 'redis://127.0.0.1:6379/0'),
    },
    contest: {
      autoSeed: resolveEnvBoolean('WINLOOP_CONTEST_AUTO_SEED', false),
    },
    resourceRecycle: {
      enabled: true,
      intervalMs: 1800000,
      retentionDays: 30,
      batchSize: 200,
    },
    feishuScheduler: {
      enabled: false,
      intervalMs: 60000,
      batchSize: 20,
      lockTtlMs: 600000,
    },
    secureConfig: {
      masterKey: resolveEnvValue('WINLOOP_CONFIG_MASTER_KEY', ''),
    },
    public: {
      apiBaseUrl: resolveEnvValue('WINLOOP_API_BASE_URL', '/api'),
      appBaseUrl: resolveEnvValue('WINLOOP_PUBLIC_BASE_URL', ''),
    },
  },

  routeRules: {
    '/topics': { redirect: { to: '/workspace', statusCode: 301 } },
    '/topics/**': { redirect: { to: '/workspace', statusCode: 301 } },
    '/reviews': { redirect: { to: '/workspace', statusCode: 301 } },
    '/reviews/**': { redirect: { to: '/workspace', statusCode: 301 } },
    '/defense': { redirect: { to: '/workspace', statusCode: 301 } },
    '/defense/**': { redirect: { to: '/workspace', statusCode: 301 } },
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
    experimental: {
      websocket: true,
    },
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
  },

  vite: {
    server: {
      allowedHosts: true,
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

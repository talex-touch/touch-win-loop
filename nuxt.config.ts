import { pwa } from './app/config/pwa'
import { appDescription } from './app/constants'
import { getEnvPriorityOrder, loadWinloopEnv, resolveEnvBoolean, resolveEnvNumber, resolveEnvValue } from './config/env'

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
    nitro: {
      envPrefix: 'WINLOOP_',
    },
    envPriority: getEnvPriorityOrder().join(' > '),
    ai: {
      provider: resolveEnvValue('WINLOOP_AI_PROVIDER', 'openai-compatible'),
      baseURL: resolveEnvValue('WINLOOP_AI_BASE_URL', ''),
      apiKey: resolveEnvValue('WINLOOP_AI_API_KEY', ''),
      model: resolveEnvValue('WINLOOP_AI_MODEL', 'gpt-4o-mini'),
      embeddingModel: resolveEnvValue('WINLOOP_AI_EMBEDDING_MODEL', 'text-embedding-3-small'),
      modelCatalogJson: resolveEnvValue('WINLOOP_AI_MODEL_CATALOG_JSON', ''),
      modelPricingJson: resolveEnvValue('WINLOOP_AI_MODEL_PRICING_JSON', ''),
      providersJson: resolveEnvValue('WINLOOP_AI_PROVIDERS_JSON', ''),
      channelsJson: resolveEnvValue('WINLOOP_AI_CHANNELS_JSON', ''),
      temperature: resolveEnvNumber('WINLOOP_AI_TEMPERATURE', 0.2),
      topP: resolveEnvNumber('WINLOOP_AI_TOP_P', 1),
      maxTokens: resolveEnvNumber('WINLOOP_AI_MAX_TOKENS', 0),
      presencePenalty: resolveEnvNumber('WINLOOP_AI_PRESENCE_PENALTY', 0),
      frequencyPenalty: resolveEnvNumber('WINLOOP_AI_FREQUENCY_PENALTY', 0),
      timeoutMs: resolveEnvNumber('WINLOOP_AI_TIMEOUT_MS', 15000),
      maxRetries: resolveEnvNumber('WINLOOP_AI_MAX_RETRIES', 2),
    },
    docAi: {
      provider: resolveEnvValue('WINLOOP_DOC_AI_PROVIDER', 'openai-compatible'),
      baseURL: resolveEnvValue('WINLOOP_DOC_AI_BASE_URL', ''),
      apiKey: resolveEnvValue('WINLOOP_DOC_AI_API_KEY', ''),
      model: resolveEnvValue('WINLOOP_DOC_AI_MODEL', 'gpt-4o-mini'),
      modelPricingJson: resolveEnvValue('WINLOOP_DOC_AI_MODEL_PRICING_JSON', ''),
      timeoutMs: resolveEnvNumber('WINLOOP_DOC_AI_TIMEOUT_MS', 15000),
      maxRetries: resolveEnvNumber('WINLOOP_DOC_AI_MAX_RETRIES', 2),
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
      enabled: resolveEnvValue('WINLOOP_ADMIN_AI_ENABLED', 'false'),
      tavilyApiKey: resolveEnvValue('WINLOOP_TAVILY_API_KEY', ''),
      webTimeoutMs: resolveEnvNumber('WINLOOP_ADMIN_AI_WEB_TIMEOUT_MS', 12000),
      maxWebResults: resolveEnvNumber('WINLOOP_ADMIN_AI_MAX_WEB_RESULTS', 5),
      maxPageChars: resolveEnvNumber('WINLOOP_ADMIN_AI_MAX_PAGE_CHARS', 10000),
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
      enabled: resolveEnvBoolean('WINLOOP_RESOURCE_RECYCLE_WORKER_ENABLED', true),
      intervalMs: resolveEnvNumber('WINLOOP_RESOURCE_RECYCLE_WORKER_INTERVAL_MS', 1800000),
      retentionDays: resolveEnvNumber('WINLOOP_RESOURCE_RECYCLE_RETENTION_DAYS', 30),
      batchSize: resolveEnvNumber('WINLOOP_RESOURCE_RECYCLE_WORKER_BATCH_SIZE', 200),
    },
    feishuScheduler: {
      enabled: resolveEnvBoolean('WINLOOP_FEISHU_SCHEDULER_ENABLED', true),
      intervalMs: resolveEnvNumber('WINLOOP_FEISHU_SCHEDULER_INTERVAL_MS', 60000),
      batchSize: resolveEnvNumber('WINLOOP_FEISHU_SCHEDULER_BATCH_SIZE', 20),
      lockTtlMs: resolveEnvNumber('WINLOOP_FEISHU_SCHEDULER_LOCK_TTL_MS', 600000),
    },
    public: {
      apiBaseUrl: resolveEnvValue('WINLOOP_API_BASE_URL', '/api'),
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

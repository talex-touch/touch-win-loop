import process from 'node:process'
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
import {
  resolveSentryBuildOrganization,
  resolveSentryBuildProject,
  resolveSentryDsn,
  resolveSentryEnvironment,
  resolveSentryRelease,
  resolveSentrySourceMapsUploadState,
  resolveSentryTracesSampleRate,
} from './config/sentry'

loadWinloopEnv()
const resolvedBuildVersion = resolveBuildVersion()
const resolvedBuildCommitSha = resolveBuildCommitSha()
const resolvedSentryRelease = resolveSentryRelease(resolvedBuildVersion)
const resolvedSentrySourceMaps = resolveSentrySourceMapsUploadState()
const shouldWarnSentrySourceMaps = process.env.NODE_ENV === 'production'
  && process.argv.some(arg => /\b(?:build|generate)\b/.test(arg))

if (shouldWarnSentrySourceMaps && !resolvedSentrySourceMaps.enabled) {
  console.warn(
    `[sentry] Source map upload disabled because required build-time env is missing: ${resolvedSentrySourceMaps.missing.join(', ')}.`,
  )
}

export default defineNuxtConfig({
  modules: [
    '@vueuse/nuxt',
    '@unocss/nuxt',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
    '@vite-pwa/nuxt',
    '@nuxt/eslint',
    '@sentry/nuxt/module',
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
    auth: {
      registrationEnabled: resolveEnvBoolean('WINLOOP_AUTH_REGISTRATION_ENABLED', true),
    },
    onlyOffice: {
      endpoint: resolveEnvValue('WINLOOP_ONLYOFFICE_ENDPOINT', ''),
      jwtSecret: resolveEnvValue('WINLOOP_ONLYOFFICE_JWT_SECRET', ''),
      sourceBaseURL: resolveEnvValue('WINLOOP_PUBLIC_BASE_URL', ''),
    },
    projectResource: {
      accessUrlTtlSeconds: resolveEnvNumber('WINLOOP_PROJECT_RESOURCE_ACCESS_URL_TTL_SECONDS', 600),
    },
    meeting: {
      rtc: {
        provider: resolveEnvValue('WINLOOP_MEETING_RTC_PROVIDER', 'mock'),
        serverUrl: resolveEnvValue('WINLOOP_MEETING_RTC_SERVER_URL', ''),
        apiKey: resolveEnvValue('WINLOOP_MEETING_RTC_API_KEY', ''),
        apiSecret: resolveEnvValue('WINLOOP_MEETING_RTC_API_SECRET', ''),
        embedBaseUrl: resolveEnvValue('WINLOOP_MEETING_RTC_EMBED_BASE_URL', ''),
        webhookSecret: resolveEnvValue('WINLOOP_MEETING_RTC_WEBHOOK_SECRET', ''),
        roomPrefix: resolveEnvValue('WINLOOP_MEETING_RTC_ROOM_PREFIX', 'winloop'),
      },
      asr: {
        provider: resolveEnvValue('WINLOOP_MEETING_ASR_PROVIDER', 'mock'),
        serviceUrl: resolveEnvValue('WINLOOP_MEETING_ASR_SERVICE_URL', ''),
        apiKey: resolveEnvValue('WINLOOP_MEETING_ASR_API_KEY', ''),
        webhookSecret: resolveEnvValue('WINLOOP_MEETING_ASR_WEBHOOK_SECRET', ''),
      },
      worker: {
        enabled: resolveEnvBoolean('WINLOOP_MEETING_WORKER_ENABLED', true),
        intervalMs: resolveEnvNumber('WINLOOP_MEETING_WORKER_INTERVAL_MS', 5000),
        batchSize: resolveEnvNumber('WINLOOP_MEETING_WORKER_BATCH_SIZE', 6),
        maxAttempts: resolveEnvNumber('WINLOOP_MEETING_WORKER_MAX_ATTEMPTS', 5),
      },
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
      sentry: {
        dsn: resolveSentryDsn(),
        environment: resolveSentryEnvironment(),
        release: resolvedSentryRelease,
        tracesSampleRate: resolveSentryTracesSampleRate(),
      },
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

  sourcemap: {
    client: 'hidden',
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

  sentry: {
    authToken: resolveEnvValue('SENTRY_AUTH_TOKEN', ''),
    errorHandler(error) {
      console.warn(`[sentry] Source map upload skipped: ${error.message}`)
    },
    org: resolveSentryBuildOrganization(),
    project: resolveSentryBuildProject(),
    release: resolvedSentryRelease
      ? {
          name: resolvedSentryRelease,
        }
      : undefined,
    sourcemaps: {
      disable: !resolvedSentrySourceMaps.enabled,
    },
    telemetry: false,
  },
})

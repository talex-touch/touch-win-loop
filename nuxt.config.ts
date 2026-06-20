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

const duplicateAutoImportFileSuffixes = [
  'shared/types/api.ts',
  'shared/types/domain-legacy.ts',
  'shared/utils/device-arrangement-document.ts',
] as const
const autoImportExcludedFiles = duplicateAutoImportFileSuffixes.map(file => `!${file}`)

function isDuplicateAutoImportFile(file: string): boolean {
  const normalizedFile = file.replace(/\\/g, '/')
  return duplicateAutoImportFileSuffixes.some(suffix => normalizedFile.endsWith(suffix))
}

function shouldScanAutoImportFile(file: string): boolean {
  return !isDuplicateAutoImportFile(file)
}

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
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Material+Symbols+Outlined:wght@300;400;500;600;700&display=swap',
        },
        { key: 'app-favicon-ico', rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { key: 'app-favicon-svg', id: 'app-favicon-svg', rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg', sizes: 'any' },
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

  css: [
    '@arco-design/web-vue/dist/arco.css',
    '~/assets/styles/design-tokens.css',
    '~/assets/styles/ui-primitives.css',
    '~/assets/styles/user-settings.css',
    '~/assets/styles/workspace-left-sidebar.css',
  ],

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
      clientType: 'langchain',
      baseURL: '',
      apiKey: '',
      model: 'gpt-4o-mini',
      embeddingModel: 'text-embedding-3-small',
      embeddingApiStyle: 'openai-compatible-text',
      embeddingDimensions: 1024,
      visionModel: '',
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
    storage: {
      provider: 'local',
      localRoot: './tmp/document-storage',
      endpoint: '',
      region: '',
      bucket: '',
      accessKey: '',
      secretKey: '',
      forcePathStyle: true,
      primaryChannelId: '',
      channels: [],
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
    meeting: {
      rtc: {
        provider: '',
        serverUrl: '',
        apiKey: '',
        apiSecret: '',
        embedBaseUrl: '',
        webhookSecret: '',
        roomPrefix: 'winloop',
      },
      asr: {
        provider: '',
        serviceUrl: '',
        apiKey: '',
        webhookSecret: '',
      },
      worker: {
        enabled: true,
        intervalMs: 5000,
        batchSize: 6,
        maxAttempts: 5,
      },
      monitoring: {
        prometheusBaseUrl: '',
      },
    },
    defenseRealtime: {
      qwen: {
        baseWsUrl: resolveEnvValue('WINLOOP_DEFENSE_REALTIME_QWEN_BASE_WS_URL', 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'),
        apiKey: resolveEnvValue('WINLOOP_DEFENSE_REALTIME_QWEN_API_KEY', ''),
        workspaceId: resolveEnvValue('WINLOOP_DEFENSE_REALTIME_QWEN_WORKSPACE_ID', ''),
        appId: resolveEnvValue('WINLOOP_DEFENSE_REALTIME_QWEN_APP_ID', ''),
        voice: resolveEnvValue('WINLOOP_DEFENSE_REALTIME_QWEN_VOICE', ''),
        frameIntervalMs: resolveEnvNumber('WINLOOP_DEFENSE_REALTIME_QWEN_FRAME_INTERVAL_MS', 1000),
      },
      coze: {
        baseUrl: resolveEnvValue('WINLOOP_DEFENSE_REALTIME_COZE_BASE_URL', 'https://api.coze.cn'),
        botId: resolveEnvValue('WINLOOP_DEFENSE_REALTIME_COZE_BOT_ID', ''),
        connectorId: resolveEnvValue('WINLOOP_DEFENSE_REALTIME_COZE_CONNECTOR_ID', ''),
        voiceId: resolveEnvValue('WINLOOP_DEFENSE_REALTIME_COZE_VOICE_ID', ''),
        authMode: resolveEnvValue('WINLOOP_DEFENSE_REALTIME_COZE_AUTH_MODE', 'pat'),
        patOrOauthSecret: resolveEnvValue('WINLOOP_DEFENSE_REALTIME_COZE_PAT_OR_OAUTH_SECRET', ''),
      },
    },
    secureConfig: {
      masterKey: resolveEnvValue('WINLOOP_CONFIG_MASTER_KEY', ''),
    },
    public: {
      apiBaseUrl: resolveEnvValue('WINLOOP_API_BASE_URL', '/api'),
      appBaseUrl: resolveEnvValue('WINLOOP_PUBLIC_BASE_URL', ''),
      drawio: {
        embedBaseUrl: resolveEnvValue('WINLOOP_PUBLIC_DRAWIO_EMBED_BASE_URL', 'https://embed.diagrams.net'),
      },
      tldraw: {
        licenseKey: resolveEnvValue(
          'WINLOOP_TLDRAW_LICENSE_KEY',
          resolveEnvValue(
            'TLDRAW_LICENSE_KEY',
            resolveEnvValue('VITE_TLDRAW_LICENSE_KEY', ''),
          ),
        ),
      },
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

  hooks: {
    'imports:dirs': function (dirs) {
      dirs.push(...autoImportExcludedFiles)
    },
    'nitro:config': function (nitroConfig) {
      if (nitroConfig.imports === false)
        return

      nitroConfig.imports ||= {}
      nitroConfig.imports.dirsScanOptions = {
        ...nitroConfig.imports.dirsScanOptions,
        fileFilter: shouldScanAutoImportFile,
      }
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

// @ts-check
import antfu from '@antfu/eslint-config'
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

const nuxt = createConfigForNuxt({
  features: {
    standalone: false,
    nuxt: {
      sortConfigKeys: true,
    },
  },
  dirs: {
    pages: ['app/pages'],
    composables: ['app/composables', 'app/utils'],
    components: ['app/components'],
    componentsPrefixed: [],
    layouts: ['app/layouts'],
    plugins: ['app/plugins'],
    middleware: ['app/middleware'],
    modules: ['modules'],
    servers: [],
    root: [],
    src: ['app'],
  },
})

export default antfu(
  {
    unocss: true,
    formatters: true,
    pnpm: true,
  },
)
  .append(nuxt)

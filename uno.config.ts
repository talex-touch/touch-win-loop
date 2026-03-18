import { createLocalFontProcessor } from '@unocss/preset-web-fonts/local'
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetWebFonts,
  presetWind4,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  shortcuts: [
    ['dense-btn', 'h-8 px-2 border border-black text-xs font-semibold inline-flex items-center justify-center hover:bg-black hover:text-white transition-colors'],
    ['dense-input', 'h-8 w-full border border-gray-300 bg-white px-2 text-xs outline-none focus:border-black'],
    ['dense-panel', 'border border-gray-300 bg-white'],
    ['chip', 'h-6 px-2 border border-gray-300 text-xs inline-flex items-center'],
  ],
  presets: [
    presetWind4(),
    presetAttributify(),
    presetIcons({
      scale: 1.15,
    }),
    presetTypography(),
    presetWebFonts({
      fonts: {
        sans: 'IBM Plex Sans',
        mono: 'IBM Plex Mono',
      },
      processors: createLocalFontProcessor(),
    }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})

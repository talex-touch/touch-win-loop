import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetWind4,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  theme: {
    font: {
      sans: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
      mono: '"IBM Plex Mono", ui-monospace, SFMono-Regular, monospace',
    },
  },
  shortcuts: [
    ['dense-btn', 'h-8 px-2 border border-black text-xs font-semibold inline-flex items-center justify-center hover:bg-black hover:text-white transition-colors'],
    ['dense-input', 'h-8 w-full border border-gray-300 bg-white px-2 text-xs outline-none focus:border-black'],
    ['dense-panel', 'border border-gray-300 bg-white'],
    ['chip', 'h-6 px-2 border border-gray-300 text-xs inline-flex items-center'],
    ['db-panel', 'border border-slate-200 rounded-lg bg-white'],
    ['db-panel-muted', '!border-slate-200 !bg-slate-50'],
    ['db-panel-elevated', '!border-transparent'],
    ['db-hover-lift', 'transition-colors hover:border-slate-300 hover:bg-white'],
    ['db-focus-ring', 'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-1'],
    ['db-btn', 'inline-flex gap-1.5 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-60'],
    ['db-btn-ghost', 'text-slate-900'],
    ['db-chip', 'inline-flex items-center px-2.5 py-1 border rounded-md text-[11px] font-semibold'],
    ['db-chip-primary', 'border-blue-100 bg-blue-50 text-blue-700'],
    ['db-chip-success', 'border-emerald-100 bg-emerald-50 text-emerald-700'],
    ['db-chip-warning', 'border-amber-100 bg-amber-50 text-amber-700'],
    ['db-chip-muted', 'border-slate-200 bg-slate-50 text-slate-600'],
    ['db-eyebrow', 'text-xs text-slate-500 font-semibold'],
    ['db-eyebrow-tight', 'tracking-[0.02em]'],
    ['db-muted', 'text-slate-600'],
    ['db-skeleton', 'bg-slate-100 animate-pulse'],
  ],
  presets: [
    presetWind4(),
    presetAttributify(),
    presetIcons({
      scale: 1.15,
    }),
    presetTypography(),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})

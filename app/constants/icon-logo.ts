export type IconLogoTheme = 'light' | 'dark'

export interface IconLogoPathDefinition {
  readonly d: string
  readonly length: number
  readonly transform?: string
}

export const ICON_LOGO_VIEW_BOX = '0 0 32 32'

export const ICON_LOGO_PATHS: readonly IconLogoPathDefinition[] = [
  {
    d: 'M6,21C6,19.586 6,18.879 6.44,18.44C6.878,18 7.585,18 9,18L15,18C16.414,18 17.121,18 17.56,18.44C18,18.879 18,19.586 18,21L18,22L6,22L6,21ZM4,22L20,22',
    length: 46.635215759277344,
    transform: 'matrix(1.333333,0,0,1.333333,0,0)',
  },
  {
    d: 'M13.037,2.867L14.092,4.996C14.236,5.292 14.62,5.576 14.944,5.631L16.858,5.951C18.082,6.157 18.37,7.052 17.488,7.936L16,9.436C15.748,9.69 15.61,10.18 15.688,10.531L16.114,12.387C16.45,13.857 15.676,14.426 14.386,13.657L12.593,12.587C12.269,12.393 11.735,12.393 11.405,12.587L9.611,13.657C8.327,14.426 7.547,13.851 7.883,12.387L8.309,10.53C8.387,10.18 8.249,9.69 7.997,9.436L6.509,7.936C5.633,7.052 5.915,6.157 7.139,5.951L9.053,5.631C9.371,5.576 9.755,5.292 9.899,4.996L10.955,2.866C11.531,1.711 12.467,1.711 13.037,2.866',
    length: 41.367218017578125,
    transform: 'matrix(1.333333,0,0,1.333333,0,0)',
  },
] as const

export const ICON_LOGO_LIGHT_STROKE = '#111111'
export const ICON_LOGO_DARK_STROKE = '#ffffff'

export function resolveIconLogoStroke(theme: IconLogoTheme): string {
  return theme === 'dark' ? ICON_LOGO_DARK_STROKE : ICON_LOGO_LIGHT_STROKE
}

export function renderIconLogoSvg(stroke: string): string {
  const paths = ICON_LOGO_PATHS.map((path) => {
    const transformAttribute = path.transform ? ` transform="${path.transform}"` : ''
    return `<path d="${path.d}"${transformAttribute} fill="none" stroke="${stroke}" stroke-width="1.5"/>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ICON_LOGO_VIEW_BOX}" fill="none" style="stroke-linecap:round;stroke-linejoin:round">${paths}</svg>`
}

export function createIconLogoFaviconHref(theme: IconLogoTheme): string {
  return `data:image/svg+xml,${encodeURIComponent(renderIconLogoSvg(resolveIconLogoStroke(theme)))}`
}

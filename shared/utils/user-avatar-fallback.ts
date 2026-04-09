export function resolveAvatarFallbackValue(username: string): string {
  const normalized = String(username || '').trim()
  if (!normalized)
    return '??'

  const chineseChars = Array.from(normalized).filter(char => /[\u4E00-\u9FFF]/.test(char))
  if (chineseChars.length >= 2)
    return chineseChars.slice(0, 2).join('')
  const firstChineseChar = chineseChars[0]
  if (chineseChars.length === 1 && firstChineseChar)
    return firstChineseChar

  const segments = normalized
    .split(/[\s_.-]+/)
    .map(item => item.trim())
    .filter(Boolean)
  const [firstSegment = '', secondSegment = ''] = segments
  if (segments.length >= 2)
    return `${firstSegment.charAt(0)}${secondSegment.charAt(0)}`.toUpperCase()

  const ascii = normalized.replace(/[^a-z0-9]/gi, '')
  if (ascii.length >= 2)
    return ascii.slice(0, 2).toUpperCase()
  if (ascii.length === 1)
    return ascii.toUpperCase()

  return Array.from(normalized).slice(0, 2).join('').toUpperCase()
}

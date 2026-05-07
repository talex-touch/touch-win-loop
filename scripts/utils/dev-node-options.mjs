const SENTRY_SERVER_PRELOAD_PATTERN = /(?:^|\s)--import(?:=|\s+)(?:"([^"]*sentry\.server\.config\.mjs)"|'([^']*sentry\.server\.config\.mjs)'|(\S*sentry\.server\.config\.mjs))/g

export function stripSentryServerPreload(nodeOptions = '') {
  const source = String(nodeOptions || '')
  const removed = []

  const sanitized = source
    .replace(SENTRY_SERVER_PRELOAD_PATTERN, (segment, doubleQuotedPath, singleQuotedPath, plainPath) => {
      const resolvedPath = String(doubleQuotedPath || singleQuotedPath || plainPath || '').trim()
      if (resolvedPath)
        removed.push(resolvedPath)
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()

  return {
    nodeOptions: sanitized,
    removed,
  }
}

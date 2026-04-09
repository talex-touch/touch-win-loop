import type { ApiResponse, AuthMeResult } from '~~/shared/types/domain'

const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/contests',
  '/resources',
  '/hi',
]

const PROTECTED_PATH_PREFIXES = [
  '/dashboard',
  '/team',
  '/projects',
  '/admin',
]

const RETIRED_ROUTE_REDIRECT_MAP: Record<string, string> = {
  '/topics': '/team',
  '/reviews': '/team',
  '/defense': '/team',
}

function normalizePath(path: string): string {
  const normalized = path.trim().replace(/\/+$/, '')
  return normalized || '/'
}

function isPathMatch(path: string, prefix: string): boolean {
  if (prefix === '/')
    return path === '/'
  return path === prefix || path.startsWith(`${prefix}/`)
}

function isPublicPath(path: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(prefix => isPathMatch(path, prefix))
}

function isProtectedPath(path: string): boolean {
  return PROTECTED_PATH_PREFIXES.some(prefix => isPathMatch(path, prefix))
}

function sanitizeRedirectTarget(value: unknown): string {
  const redirect = String(value || '').trim()
  if (!redirect)
    return '/dashboard'
  if (!redirect.startsWith('/') || redirect.startsWith('//'))
    return '/dashboard'
  if (redirect.startsWith('/login'))
    return '/dashboard'
  return redirect
}

export default defineNuxtRouteMiddleware(async (to) => {
  const targetPath = normalizePath(to.path)
  const retiredRedirectTarget = RETIRED_ROUTE_REDIRECT_MAP[targetPath]
  if (retiredRedirectTarget) {
    return navigateTo(retiredRedirectTarget, {
      redirectCode: 301,
      replace: true,
    })
  }

  const publicRoute = isPublicPath(targetPath)
  const protectedRoute = isProtectedPath(targetPath)
  const loginRoute = isPathMatch(targetPath, '/login')

  if (!publicRoute && !protectedRoute)
    return
  if (publicRoute && !loginRoute)
    return

  const runtime = useRuntimeConfig()
  const { endpoint } = useApiEndpoint(runtime)
  const authEndpoint = endpoint('/auth/me')

  let authenticated = false
  try {
    const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
    const response = await fetch(authEndpoint, {
      headers,
      credentials: 'include',
    })
    const payload = await response.json().catch(() => null) as ApiResponse<AuthMeResult> | null
    if (!response.ok || !payload || payload.code !== 0)
      throw new Error(String(payload?.message || '认证状态校验失败。'))
    authenticated = true
  }
  catch {
    authenticated = false
  }

  if (loginRoute && authenticated) {
    const target = sanitizeRedirectTarget(to.query.redirect)
    return navigateTo(target, { replace: true })
  }

  if (!protectedRoute || authenticated)
    return

  const redirectPath = to.fullPath || targetPath
  return navigateTo({
    path: '/login',
    query: { redirect: redirectPath },
  }, { replace: true })
})

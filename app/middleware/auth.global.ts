import type { ApiResponse, AuthSessionProbeResult } from '~~/shared/types/domain'
import { buildAuthRequestErrorInfo, logAuthProbeDegraded, resolveAuthRequestErrorInfo } from '~/utils/auth-request'

const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/auth/onboarding',
  '/meeting',
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
  const authEndpoint = endpoint('/auth/session')
  const authProbeUrl = import.meta.server
    ? new URL(String(authEndpoint), useRequestURL()).toString()
    : authEndpoint

  let authState: 'authenticated' | 'unauthorized' | 'forbidden' | 'degraded' = 'unauthorized'
  try {
    const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
    const response = await fetch(authProbeUrl, {
      headers,
      credentials: 'include',
    })
    const payload = await response.json().catch(() => null) as ApiResponse<AuthSessionProbeResult> | null
    if (response.ok && payload && payload.code === 0) {
      authState = 'authenticated'
    }
    else {
      const info = buildAuthRequestErrorInfo({
        statusCode: response.ok ? 0 : response.status,
        message: String(payload?.message || '登录态校验失败。'),
        traceId: String(payload?.meta?.traceId || response.headers.get('x-trace-id') || '').trim(),
      })

      if (info.isUnauthorized) {
        authState = 'unauthorized'
      }
      else if (info.isForbidden) {
        authState = 'forbidden'
      }
      else {
        authState = 'degraded'
        logAuthProbeDegraded({
          context: 'route-middleware',
          route: to.fullPath || targetPath,
          statusCode: info.statusCode,
          message: info.message,
          traceId: info.traceId,
        })
      }
    }
  }
  catch (error) {
    const info = resolveAuthRequestErrorInfo(error)
    if (info.isUnauthorized) {
      authState = 'unauthorized'
    }
    else if (info.isForbidden) {
      authState = 'forbidden'
    }
    else {
      authState = 'degraded'
      logAuthProbeDegraded({
        context: 'route-middleware',
        route: to.fullPath || targetPath,
        error,
      })
    }
  }

  if (loginRoute && authState === 'authenticated') {
    const target = sanitizeRedirectTarget(to.query.redirect)
    return navigateTo(target, { replace: true })
  }

  if (!protectedRoute || authState !== 'unauthorized')
    return

  const redirectPath = to.fullPath || targetPath
  return navigateTo({
    path: '/login',
    query: { redirect: redirectPath },
  }, { replace: true })
})

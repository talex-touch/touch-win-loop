import type { ApiResponse, AuthSessionProbeResult } from '~~/shared/types/domain'
import { buildAuthRequestErrorInfo, logAuthProbeDegraded } from '~/utils/auth-request'

export default defineNuxtRouteMiddleware(async (to) => {
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

      if (info.isUnauthorized)
        authState = 'unauthorized'
      else if (info.isForbidden)
        authState = 'forbidden'
      else
        authState = 'degraded'

      if (authState === 'degraded') {
        logAuthProbeDegraded({
          context: 'auth-bind-middleware',
          route: to.fullPath || '/auth/bind',
          statusCode: info.statusCode,
          message: info.message,
          traceId: info.traceId,
        })
      }
    }
  }
  catch (error) {
    authState = 'degraded'
    logAuthProbeDegraded({
      context: 'auth-bind-middleware',
      route: to.fullPath || '/auth/bind',
      error,
    })
  }

  if (authState !== 'unauthorized')
    return

  return navigateTo({
    path: '/login',
    query: {
      redirect: to.fullPath || '/auth/bind',
    },
  }, { replace: true })
})

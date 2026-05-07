import type { Peer } from 'crossws'
import type { AuthUser } from '~~/shared/types/domain'
import {
  ACCESS_COOKIE_NAME,
  LEGACY_SESSION_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from '~~/server/utils/auth'
import { getAiChatSessionById } from '~~/server/utils/chat-store'
import { withClient, withTransaction } from '~~/server/utils/db'
import {
  buildQwenRealtimeUpstreamUrl,
  normalizeDefenseRealtimeSessionMeta,
  resolveDefenseQwenVoiceProvider,
  resolveDefenseRealtimeQwenApiKey,
} from '~~/server/utils/defense-realtime'
import { readEffectiveRuntimeSettings } from '~~/server/utils/platform-ai-config-store'
import { findAuthBySessionTokenHash } from '~~/server/utils/platform-store'
import { getProjectDefenseSessionState } from '~~/server/utils/project-defense-store'
import { resolveProjectRealtimeAccess } from '~~/server/utils/realtime-access'
import { hashToken } from '~~/server/utils/security'

const RELAY_CONTEXT_KEY = '__defenseQwenRelay'

interface DefenseQwenRelayContext {
  upstream: WebSocket | null
}

interface DefenseQwenRelayUpstreamConfig {
  url: string
  apiKey: string
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function parseCookieHeader(rawCookie: string): Record<string, string> {
  const cookieMap: Record<string, string> = {}
  const normalized = normalizeString(rawCookie)
  if (!normalized)
    return cookieMap

  for (const chunk of normalized.split(';')) {
    const part = normalizeString(chunk)
    if (!part)
      continue
    const index = part.indexOf('=')
    if (index <= 0)
      continue

    const key = normalizeString(part.slice(0, index))
    const value = normalizeString(part.slice(index + 1))
    if (!key || !value)
      continue

    try {
      cookieMap[key] = decodeURIComponent(value)
    }
    catch {
      cookieMap[key] = value
    }
  }

  return cookieMap
}

function readRequestHeader(peer: Peer, headerName: string): string {
  const targetName = normalizeString(headerName).toLowerCase()
  if (!targetName)
    return ''

  const rawHeaders = peer.request?.headers as unknown
  if (!rawHeaders)
    return ''

  const maybeHeaders = rawHeaders as { get?: (name: string) => string | null }
  if (typeof maybeHeaders.get === 'function')
    return normalizeString(maybeHeaders.get(targetName))

  if (typeof rawHeaders !== 'object' || Array.isArray(rawHeaders))
    return ''

  const headersRecord = rawHeaders as Record<string, unknown>
  const value = headersRecord[targetName] ?? headersRecord[headerName]
  if (Array.isArray(value))
    return normalizeString(value[0] || '')
  return normalizeString(value)
}

function readRequestUrl(peer: Peer): URL | null {
  const rawUrl = normalizeString(String(peer.request?.url || ''))
  if (!rawUrl)
    return null

  const host = readRequestHeader(peer, 'host') || 'localhost'
  const protocol = normalizeString(readRequestHeader(peer, 'x-forwarded-proto')) === 'https' ? 'https' : 'http'
  try {
    return new URL(rawUrl, `${protocol}://${host}`)
  }
  catch {
    return null
  }
}

function resolveRelayRouteParams(peer: Peer): { projectId: string, sessionId: string } {
  const requestUrl = readRequestUrl(peer)
  const pathname = normalizeString(requestUrl?.pathname || '')
  const matched = pathname.match(/\/projects\/([^/]+)\/defense\/realtime-sessions\/([^/]+)\/qwen-relay$/)
  if (!matched) {
    return {
      projectId: '',
      sessionId: '',
    }
  }
  return {
    projectId: normalizeString(matched[1]),
    sessionId: normalizeString(matched[2]),
  }
}

function absorbSocketResult(result: unknown): void {
  if (!result || typeof (result as PromiseLike<unknown>).then !== 'function')
    return
  void (result as PromiseLike<unknown>).then(undefined, () => {})
}

function safeClose(peer: Peer, code: number, reason: string): void {
  try {
    absorbSocketResult(peer.close(code, reason))
  }
  catch {
  }
}

function sendPeerMessage(peer: Peer, payload: unknown): void {
  try {
    absorbSocketResult(peer.send(payload))
  }
  catch {
  }
}

function resolveRelayContext(peer: Peer): DefenseQwenRelayContext | null {
  const value = peer.context?.[RELAY_CONTEXT_KEY]
  if (!value || typeof value !== 'object')
    return null
  return value as DefenseQwenRelayContext
}

function setRelayContext(peer: Peer, context: DefenseQwenRelayContext): void {
  peer.context[RELAY_CONTEXT_KEY] = context
}

function clearRelayContext(peer: Peer): void {
  delete peer.context[RELAY_CONTEXT_KEY]
}

async function resolveAuthUserFromPeer(peer: Peer): Promise<AuthUser | null> {
  const cookieHeader = readRequestHeader(peer, 'cookie')
  if (!cookieHeader)
    return null

  const cookies = parseCookieHeader(cookieHeader)
  const token = normalizeString(
    cookies[ACCESS_COOKIE_NAME]
    || cookies[REFRESH_COOKIE_NAME]
    || cookies[LEGACY_SESSION_COOKIE_NAME]
    || '',
  )
  if (!token)
    return null

  return withClient(undefined, async (db) => {
    const auth = await findAuthBySessionTokenHash(db, hashToken(token))
    return auth?.user || null
  })
}

function resolveQwenRealtimeProfile(input: {
  runtime: Awaited<ReturnType<typeof readEffectiveRuntimeSettings>>['runtime']
  metadata: Record<string, unknown>
}) {
  const qwenVoice = resolveDefenseQwenVoiceProvider(input.runtime)?.voice?.qwen
  const requestedRealtimeProfileId = normalizeString(input.metadata.voiceRuntimeProfileId)
  return qwenVoice?.realtimeProfiles.find(item => item.enabled && item.id === requestedRealtimeProfileId)
    || qwenVoice?.realtimeProfiles.find(item => item.enabled)
    || null
}

async function resolveRelayUpstreamConfig(input: {
  user: AuthUser
  projectId: string
  sessionId: string
}): Promise<DefenseQwenRelayUpstreamConfig | null> {
  const { runtime } = await readEffectiveRuntimeSettings()
  const qwenApiKey = resolveDefenseRealtimeQwenApiKey(runtime)
  if (!qwenApiKey)
    return null

  let upstreamUrl = ''
  await withTransaction(undefined, async (db) => {
    const access = await resolveProjectRealtimeAccess(db, input.user, input.projectId)
    if (!access)
      throw new Error('FORBIDDEN')

    const session = await getAiChatSessionById(db, {
      workspaceId: access.workspaceId,
      sessionId: input.sessionId,
      projectId: input.projectId,
      mode: 'defense',
      strictScope: true,
    })
    if (!session)
      throw new Error('NOT_FOUND')

    const state = await getProjectDefenseSessionState(db, { sessionId: input.sessionId })
    const realtime = normalizeDefenseRealtimeSessionMeta(state?.realtime)
    if (!state || realtime.provider !== 'qwen')
      throw new Error('NOT_FOUND')

    const realtimeProfile = resolveQwenRealtimeProfile({
      runtime,
      metadata: realtime.metadata || {},
    })
    upstreamUrl = buildQwenRealtimeUpstreamUrl({
      baseWsUrl: realtimeProfile?.baseWsUrl || runtime.defenseRealtime.qwen.baseWsUrl,
      model: realtimeProfile?.model,
    })
  })

  if (!upstreamUrl)
    return null

  return {
    url: upstreamUrl,
    apiKey: qwenApiKey,
  }
}

export default defineWebSocketHandler({
  async open(peer) {
    const user = await resolveAuthUserFromPeer(peer)
    if (!user) {
      safeClose(peer, 4401, 'unauthorized')
      return
    }
    if (user.isDisabled) {
      safeClose(peer, 4403, 'forbidden')
      return
    }

    const { projectId, sessionId } = resolveRelayRouteParams(peer)
    if (!projectId || !sessionId) {
      safeClose(peer, 4404, 'invalid_route')
      return
    }

    let upstreamConfig: DefenseQwenRelayUpstreamConfig | null = null
    try {
      upstreamConfig = await resolveRelayUpstreamConfig({
        user,
        projectId,
        sessionId,
      })
    }
    catch (error) {
      safeClose(peer, error instanceof Error && error.message === 'FORBIDDEN' ? 4403 : 4404, error instanceof Error ? error.message.toLowerCase() : 'relay_bootstrap_failed')
      return
    }
    if (!upstreamConfig?.url) {
      safeClose(peer, 4503, 'qwen_config_missing')
      return
    }

    const UpstreamWebSocket = globalThis.WebSocket as unknown as {
      new (url: string, init?: unknown): WebSocket
    }
    const upstream = new UpstreamWebSocket(upstreamConfig.url, {
      headers: {
        Authorization: `Bearer ${upstreamConfig.apiKey}`,
      },
    })
    upstream.binaryType = 'arraybuffer'
    setRelayContext(peer, {
      upstream,
    })

    upstream.addEventListener('message', (event) => {
      sendPeerMessage(peer, event.data)
    })
    upstream.addEventListener('close', (event) => {
      safeClose(peer, event.code || 1000, normalizeString(event.reason) || 'upstream_closed')
      clearRelayContext(peer)
    })
    upstream.addEventListener('error', () => {
      safeClose(peer, 1011, 'upstream_error')
      clearRelayContext(peer)
    })
  },

  async message(peer, message) {
    const context = resolveRelayContext(peer)
    if (!context?.upstream || context.upstream.readyState !== WebSocket.OPEN)
      return

    try {
      const rawData = message.rawData
      if (typeof rawData === 'string') {
        context.upstream.send(rawData)
        return
      }
      context.upstream.send(message.arrayBuffer())
    }
    catch {
      safeClose(peer, 1011, 'relay_message_failed')
    }
  },

  async close(peer) {
    const context = resolveRelayContext(peer)
    clearRelayContext(peer)
    if (context?.upstream && context.upstream.readyState < WebSocket.CLOSING)
      context.upstream.close(1000, 'client_closed')
  },

  async error(peer) {
    const context = resolveRelayContext(peer)
    clearRelayContext(peer)
    if (context?.upstream && context.upstream.readyState < WebSocket.CLOSING)
      context.upstream.close(1011, 'relay_error')
  },
})

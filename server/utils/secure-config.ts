import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import process from 'node:process'
import { useRuntimeConfig } from '#imports'

const CONFIG_SECRET_PREFIX = 'enc:v1:'
const CONFIG_SECRET_IV_LENGTH = 12
const CONFIG_SECRET_AUTH_TAG_LENGTH = 16

function toText(raw: unknown): string {
  return String(raw || '')
}

function resolveMasterKey(event?: H3Event): string {
  const runtime = useRuntimeConfig(event)
  const fromRuntime = toText(runtime.secureConfig?.masterKey).trim()
  if (fromRuntime)
    return fromRuntime

  return toText(process.env.WINLOOP_CONFIG_MASTER_KEY).trim()
}

function resolveCipherKey(masterKey: string): Buffer {
  return createHash('sha256').update(masterKey).digest()
}

export function hasConfigMasterKey(event?: H3Event): boolean {
  return Boolean(resolveMasterKey(event))
}

export function isEncryptedConfigValue(raw: unknown): boolean {
  return toText(raw).startsWith(CONFIG_SECRET_PREFIX)
}

export function encryptConfigSecret(value: unknown, event?: H3Event): string {
  const plaintext = toText(value)
  if (!plaintext)
    return ''

  const masterKey = resolveMasterKey(event)
  if (!masterKey)
    throw new Error('CONFIG_MASTER_KEY_REQUIRED')

  const iv = randomBytes(CONFIG_SECRET_IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', resolveCipherKey(masterKey), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  const encoded = Buffer.concat([iv, authTag, ciphertext]).toString('base64')
  return `${CONFIG_SECRET_PREFIX}${encoded}`
}

export function decryptConfigSecret(value: unknown, event?: H3Event): string {
  const raw = toText(value)
  if (!isEncryptedConfigValue(raw))
    return raw

  const payload = toText(raw).slice(CONFIG_SECRET_PREFIX.length)
  const masterKey = resolveMasterKey(event)
  if (!masterKey)
    throw new Error('CONFIG_MASTER_KEY_REQUIRED')

  const packed = Buffer.from(payload, 'base64')
  if (packed.length <= CONFIG_SECRET_IV_LENGTH + CONFIG_SECRET_AUTH_TAG_LENGTH)
    throw new Error('CONFIG_SECRET_INVALID_FORMAT')

  const ivEnd = CONFIG_SECRET_IV_LENGTH
  const authTagEnd = ivEnd + CONFIG_SECRET_AUTH_TAG_LENGTH
  const iv = packed.subarray(0, ivEnd)
  const authTag = packed.subarray(ivEnd, authTagEnd)
  const ciphertext = packed.subarray(authTagEnd)

  const decipher = createDecipheriv('aes-256-gcm', resolveCipherKey(masterKey), iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString('utf8')
}

export function decryptConfigSecretSafe(value: unknown, event?: H3Event): string {
  const raw = toText(value)
  if (!raw)
    return ''

  if (!isEncryptedConfigValue(raw))
    return raw

  try {
    return decryptConfigSecret(raw, event)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[secure-config] 解密密文字段失败，已保留原始值：', message)
    return raw
  }
}

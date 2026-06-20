import type { Writable } from 'node:stream'
import type { RuntimeSettings, RuntimeStorageChannel } from '~~/server/utils/env'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { PassThrough, Readable } from 'node:stream'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { withClient } from '~~/server/utils/db'
import { readRuntimeSettings } from '~~/server/utils/env'
import {
  applyPlatformRuntimeOverrides,
  getCachedPlatformRuntimeOverridesSnapshot,
  readEffectivePlatformRuntimeSettings,
} from '~~/server/utils/platform-runtime-config-store'
import { selectStorageWriteChannel } from '~~/server/utils/storage-service-store'

export interface StoredObjectInput {
  key: string
  body: Buffer | Readable
  contentType?: string
}

export interface MergeStoredObjectsInput {
  key: string
  sourceKeys: string[]
  contentType?: string
}

export interface DocumentStorage {
  provider: string
  channelId: string
  putObject: (input: StoredObjectInput) => Promise<void>
  putChunkObject: (input: StoredObjectInput) => Promise<void>
  getObjectBuffer: (key: string) => Promise<Buffer>
  getObjectStream: (key: string) => Promise<Readable>
  deleteObject: (key: string) => Promise<void>
  deleteObjects: (keys: string[]) => Promise<void>
  mergeObjects: (input: MergeStoredObjectsInput) => Promise<void>
}

type StorageErrorLike = Error & {
  code?: string
  name?: string
}

export class DocumentStorageObjectNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`对象存储文件不存在：${key}`)
    this.name = 'DocumentStorageObjectNotFoundError'
  }
}

function isFsObjectNotFoundError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && (error as StorageErrorLike).code === 'ENOENT',
  )
}

function isRemoteObjectNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error))
    return false

  const storageError = error as StorageErrorLike
  const normalizedMessage = error.message.toLowerCase()
  return storageError.code === 'NoSuchKey'
    || storageError.name === 'NoSuchKey'
    || storageError.code === 'NotFound'
    || storageError.name === 'NotFound'
    || normalizedMessage.includes('no such key')
    || normalizedMessage.includes('key does not exist')
}

export function isDocumentStorageObjectNotFoundError(error: unknown): error is DocumentStorageObjectNotFoundError {
  return error instanceof DocumentStorageObjectNotFoundError
    || isFsObjectNotFoundError(error)
    || isRemoteObjectNotFoundError(error)
}

class LocalDocumentStorage implements DocumentStorage {
  provider = 'local'
  channelId: string

  constructor(private readonly rootDir: string, channelId = 'local') {
    this.channelId = channelId
  }

  async putObject(input: StoredObjectInput): Promise<void> {
    const filePath = this.resolveKey(input.key)
    await mkdir(dirname(filePath), { recursive: true })
    if (Buffer.isBuffer(input.body)) {
      await writeFile(filePath, input.body)
      return
    }
    await writeReadableToFile(input.body, filePath)
  }

  async putChunkObject(input: StoredObjectInput): Promise<void> {
    await this.putObject(input)
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    try {
      return await readFile(this.resolveKey(key))
    }
    catch (error) {
      if (isFsObjectNotFoundError(error))
        throw new DocumentStorageObjectNotFoundError(key)
      throw error
    }
  }

  async getObjectStream(key: string): Promise<Readable> {
    return createReadStream(this.resolveKey(key))
  }

  async deleteObject(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true })
  }

  async deleteObjects(keys: string[]): Promise<void> {
    await Promise.all(keys.map(async key => await this.deleteObject(key)))
  }

  async mergeObjects(input: MergeStoredObjectsInput): Promise<void> {
    const filePath = this.resolveKey(input.key)
    await mkdir(dirname(filePath), { recursive: true })
    const target = createWriteStream(filePath)
    try {
      for (const sourceKey of input.sourceKeys) {
        const source = createReadStream(this.resolveKey(sourceKey))
        await pipeReadableIntoWritable(source, target, false)
      }
      target.end()
      await once(target, 'finish')
    }
    catch (error) {
      target.destroy()
      throw error
    }
  }

  private resolveKey(key: string): string {
    return resolve(this.rootDir, key)
  }
}

interface BodyLike {
  transformToByteArray?: () => Promise<Uint8Array>
  [Symbol.asyncIterator]?: () => AsyncIterator<unknown>
}

async function toBuffer(value: unknown): Promise<Buffer> {
  if (!value)
    return Buffer.alloc(0)
  if (Buffer.isBuffer(value))
    return value
  if (value instanceof Uint8Array)
    return Buffer.from(value)
  if (typeof value === 'string')
    return Buffer.from(value)

  const body = value as BodyLike
  if (body && typeof body.transformToByteArray === 'function') {
    const bytes = await body.transformToByteArray()
    return Buffer.from(bytes)
  }

  if (typeof body[Symbol.asyncIterator] === 'function') {
    const chunks: Buffer[] = []
    for await (const chunk of body as AsyncIterable<unknown>) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk)
        continue
      }
      if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk))
        continue
      }
      chunks.push(Buffer.from(String(chunk)))
    }
    return Buffer.concat(chunks)
  }

  throw new Error('对象存储返回了不支持的内容类型。')
}

function toReadable(value: unknown): Readable {
  if (value instanceof Readable)
    return value

  const body = value as BodyLike
  if (body && typeof body[Symbol.asyncIterator] === 'function')
    return Readable.from(body as AsyncIterable<unknown>)

  if (typeof body.transformToByteArray === 'function') {
    const transformToByteArray = body.transformToByteArray.bind(body)
    return Readable.from((async function* () {
      yield await transformToByteArray()
    })())
  }

  throw new Error('对象存储返回了不支持的流类型。')
}

async function writeChunkToWritable(target: Writable, chunk: Buffer): Promise<void> {
  if (target.write(chunk))
    return
  await once(target, 'drain')
}

async function pipeReadableIntoWritable(source: Readable, target: Writable, shouldEnd: boolean): Promise<void> {
  try {
    for await (const chunk of source) {
      if (Buffer.isBuffer(chunk)) {
        await writeChunkToWritable(target, chunk)
        continue
      }
      if (chunk instanceof Uint8Array) {
        await writeChunkToWritable(target, Buffer.from(chunk))
        continue
      }
      await writeChunkToWritable(target, Buffer.from(String(chunk)))
    }
    if (shouldEnd)
      target.end()
  }
  finally {
    source.destroy()
  }
}

async function writeReadableToFile(source: Readable, filePath: string): Promise<void> {
  const target = createWriteStream(filePath)
  try {
    await pipeReadableIntoWritable(source, target, true)
    await once(target, 'finish')
  }
  catch (error) {
    target.destroy()
    throw error
  }
}

class S3DocumentStorage implements DocumentStorage {
  private readonly client: S3Client
  private readonly bucket: string
  provider: string
  channelId: string

  constructor(input: {
    channelId: string
    provider: string
    endpoint: string
    region: string
    bucket: string
    accessKey: string
    secretKey: string
    forcePathStyle: boolean
  }) {
    this.provider = input.provider
    this.channelId = input.channelId
    this.bucket = input.bucket
    this.client = new S3Client({
      region: input.region || 'auto',
      endpoint: input.endpoint || undefined,
      forcePathStyle: input.forcePathStyle,
      credentials: input.accessKey && input.secretKey
        ? {
            accessKeyId: input.accessKey,
            secretAccessKey: input.secretKey,
          }
        : undefined,
    })
  }

  async putObject(input: StoredObjectInput): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType || 'application/octet-stream',
    }))
  }

  async putChunkObject(input: StoredObjectInput): Promise<void> {
    await this.putObject(input)
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }))
      return toBuffer(response.Body)
    }
    catch (error) {
      if (isRemoteObjectNotFoundError(error))
        throw new DocumentStorageObjectNotFoundError(key)
      throw error
    }
  }

  async getObjectStream(key: string): Promise<Readable> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }))
    return toReadable(response.Body)
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }))
  }

  async deleteObjects(keys: string[]): Promise<void> {
    await Promise.all(keys.map(async key => await this.deleteObject(key)))
  }

  async mergeObjects(input: MergeStoredObjectsInput): Promise<void> {
    const passThrough = new PassThrough()
    const putPromise = this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      Body: passThrough,
      ContentType: input.contentType || 'application/octet-stream',
    }))

    try {
      for (const sourceKey of input.sourceKeys) {
        const source = await this.getObjectStream(sourceKey)
        await pipeReadableIntoWritable(source, passThrough, false)
      }
      passThrough.end()
      await putPromise
    }
    catch (error) {
      passThrough.destroy()
      throw error
    }
  }
}

let storageInstance: DocumentStorage | null = null
let storageInstanceKey = ''
const channelStorageInstances = new Map<string, DocumentStorage>()

function toAbsoluteRoot(localRoot: string): string {
  if (localRoot.startsWith('/'))
    return localRoot
  return resolve(process.cwd(), localRoot)
}

function resolveDocumentStorageRuntime(runtime?: RuntimeSettings): RuntimeSettings {
  if (runtime)
    return runtime
  return applyPlatformRuntimeOverrides(readRuntimeSettings(), getCachedPlatformRuntimeOverridesSnapshot())
}

function buildStorageInstanceKey(runtime: RuntimeSettings): string {
  return JSON.stringify(runtime.storage)
}

export function invalidateDocumentStorage(): void {
  storageInstance = null
  storageInstanceKey = ''
  channelStorageInstances.clear()
}

function createDocumentStorageForChannel(channel: RuntimeStorageChannel): DocumentStorage {
  const provider = channel.provider.trim().toLowerCase()

  if (provider === 'local') {
    return new LocalDocumentStorage(toAbsoluteRoot(channel.localRoot), channel.id)
  }

  if (provider === 's3' || provider === 'minio') {
    if (!channel.bucket) {
      throw new Error('对象存储配置缺失：Bucket 不能为空。')
    }
    if (provider === 'minio' && !channel.endpoint) {
      throw new Error('MinIO 模式下 Endpoint 不能为空。')
    }

    return new S3DocumentStorage({
      channelId: channel.id,
      provider,
      endpoint: channel.endpoint,
      region: channel.region || 'auto',
      bucket: channel.bucket,
      accessKey: channel.accessKey,
      secretKey: channel.secretKey,
      forcePathStyle: channel.forcePathStyle,
    })
  }

  throw new Error(`不支持的存储 provider：${provider}。仅支持 local/s3/minio。`)
}

function resolveStorageChannel(runtime: RuntimeSettings, channelId?: string): RuntimeStorageChannel {
  const requested = String(channelId || '').trim()
  const channels = runtime.storage.channels || []
  if (requested) {
    const exact = channels.find(channel => channel.id === requested)
    if (exact)
      return exact
    const providerMatch = channels.find(channel => channel.provider === requested)
    if (providerMatch)
      return providerMatch
  }

  const primary = channels.find(channel => channel.id === runtime.storage.primaryChannelId)
  if (primary)
    return primary
  return channels[0] || {
    id: 'local',
    name: '本机存储',
    provider: 'local',
    enabled: true,
    priority: 0,
    capacityBytes: 0,
    watermarkPercent: 90,
    localRoot: runtime.storage.localRoot || './tmp/document-storage',
    endpoint: runtime.storage.endpoint || '',
    region: runtime.storage.region || '',
    bucket: runtime.storage.bucket || '',
    accessKey: runtime.storage.accessKey || '',
    secretKey: runtime.storage.secretKey || '',
    forcePathStyle: runtime.storage.forcePathStyle,
  }
}

export function getDocumentStorage(runtime?: RuntimeSettings): DocumentStorage {
  const resolvedRuntime = resolveDocumentStorageRuntime(runtime)
  const nextKey = buildStorageInstanceKey(resolvedRuntime)
  if (storageInstance && storageInstanceKey === nextKey)
    return storageInstance

  const channel = resolveStorageChannel(resolvedRuntime)
  storageInstance = createDocumentStorageForChannel(channel)
  storageInstanceKey = nextKey
  return storageInstance
}

export function getDocumentStorageByChannel(channelId: string, runtime?: RuntimeSettings): DocumentStorage {
  const resolvedRuntime = resolveDocumentStorageRuntime(runtime)
  const channel = resolveStorageChannel(resolvedRuntime, channelId)
  const key = `${buildStorageInstanceKey(resolvedRuntime)}:${channel.id}`
  const cached = channelStorageInstances.get(key)
  if (cached)
    return cached
  const storage = createDocumentStorageForChannel(channel)
  channelStorageInstances.set(key, storage)
  return storage
}

export async function selectDocumentWriteStorage(input: {
  incomingBytes: number
  runtime?: RuntimeSettings
}): Promise<DocumentStorage> {
  const runtime = input.runtime
    ? applyPlatformRuntimeOverrides(input.runtime, getCachedPlatformRuntimeOverridesSnapshot())
    : (await readEffectivePlatformRuntimeSettings()).runtime
  const selection = await withClient(undefined, db => selectStorageWriteChannel(db, runtime, input.incomingBytes))
  return getDocumentStorageByChannel(selection.channel.id, runtime)
}

export async function deleteObjectsAcrossStorageChannels(keys: string[], runtime?: RuntimeSettings): Promise<void> {
  const normalizedKeys = [...new Set(keys.map(key => String(key || '').trim()).filter(Boolean))]
  if (normalizedKeys.length === 0)
    return
  const resolvedRuntime = resolveDocumentStorageRuntime(runtime)
  const channelIds = [...new Set((resolvedRuntime.storage.channels || []).map(channel => channel.id))]
  await Promise.allSettled(channelIds.map(async (channelId) => {
    const storage = getDocumentStorageByChannel(channelId, resolvedRuntime)
    await storage.deleteObjects(normalizedKeys)
  }))
}

function sanitizePathPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildDocumentObjectKey(contestId: string, fileName: string): string {
  const date = new Date()
  const yyyy = String(date.getUTCFullYear())
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const safeContestId = sanitizePathPart(contestId || 'unknown-contest')
  const safeFileName = sanitizePathPart(fileName || 'document.pdf') || 'document.pdf'
  return `documents/${safeContestId}/${yyyy}/${mm}/${randomUUID()}-${safeFileName}`
}

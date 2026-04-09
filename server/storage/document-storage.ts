import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { readRuntimeSettings } from '~~/server/utils/env'

export interface StoredObjectInput {
  key: string
  body: Buffer
}

export interface DocumentStorage {
  provider: string
  putObject: (input: StoredObjectInput) => Promise<void>
  getObjectBuffer: (key: string) => Promise<Buffer>
  deleteObject: (key: string) => Promise<void>
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

  constructor(private readonly rootDir: string) {}

  async putObject(input: StoredObjectInput): Promise<void> {
    const filePath = this.resolveKey(input.key)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, input.body)
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

  async deleteObject(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true })
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
  if (typeof body.transformToByteArray === 'function') {
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

class S3DocumentStorage implements DocumentStorage {
  private readonly client: S3Client
  private readonly bucket: string
  provider: string

  constructor(input: {
    provider: string
    endpoint: string
    region: string
    bucket: string
    accessKey: string
    secretKey: string
    forcePathStyle: boolean
  }) {
    this.provider = input.provider
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
      ContentType: 'application/pdf',
    }))
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

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }))
  }
}

let storageInstance: DocumentStorage | null = null

function toAbsoluteRoot(localRoot: string): string {
  if (localRoot.startsWith('/'))
    return localRoot
  return resolve(process.cwd(), localRoot)
}

export function getDocumentStorage(): DocumentStorage {
  if (storageInstance)
    return storageInstance

  const runtime = readRuntimeSettings()
  const provider = runtime.storage.provider.trim().toLowerCase()

  if (provider === 'local') {
    storageInstance = new LocalDocumentStorage(toAbsoluteRoot(runtime.storage.localRoot))
    return storageInstance
  }

  if (provider === 's3' || provider === 'minio') {
    if (!runtime.storage.bucket) {
      throw new Error('对象存储配置缺失：WINLOOP_STORAGE_BUCKET 不能为空。')
    }
    if (provider === 'minio' && !runtime.storage.endpoint) {
      throw new Error('MinIO 模式下 WINLOOP_STORAGE_ENDPOINT 不能为空。')
    }

    storageInstance = new S3DocumentStorage({
      provider,
      endpoint: runtime.storage.endpoint,
      region: runtime.storage.region || 'auto',
      bucket: runtime.storage.bucket,
      accessKey: runtime.storage.accessKey,
      secretKey: runtime.storage.secretKey,
      forcePathStyle: runtime.storage.forcePathStyle,
    })
    return storageInstance
  }

  throw new Error(`不支持的存储 provider：${provider}。仅支持 local/s3/minio。`)
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

import type { RunnableConfig } from '@langchain/core/runnables'
import type {
  BaseStore,
  Checkpoint,
  CheckpointListOptions,
  CheckpointMetadata,
  CheckpointPendingWrite,
  CheckpointTuple,
  Item,
  Operation,
  OperationResults,
  PendingWrite,
  SearchItem,
} from '@langchain/langgraph-checkpoint'
import type { RuntimeSettings } from '~~/server/utils/env'
import { BaseCheckpointSaver, BaseStore as BaseStoreClass } from '@langchain/langgraph-checkpoint'
import { createDeepAgent } from 'deepagents'
import { getPool } from '~~/server/utils/db'

const NAMESPACE_SEPARATOR = '\u001F'

interface DeepAgentCheckpointRow {
  thread_id: string
  checkpoint_ns: string
  checkpoint_id: string
  parent_checkpoint_id: string
  checkpoint_json: Checkpoint
  metadata_json: CheckpointMetadata
  pending_writes_json: unknown
}

interface DeepAgentStoreItemRow {
  namespace_path: string
  namespace_json: string[]
  item_key: string
  value_json: Record<string, any>
  created_at: string
  updated_at: string
}

function toText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, any>
}

function normalizeCheckpointPendingWrites(value: unknown): CheckpointPendingWrite[] {
  if (!Array.isArray(value))
    return []

  return value.filter((entry): entry is CheckpointPendingWrite => {
    return Array.isArray(entry) && entry.length === 3 && typeof entry[0] === 'string' && typeof entry[1] === 'string'
  })
}

function encodeNamespacePath(namespace: string[]): string {
  return namespace.map(item => toText(item)).filter(Boolean).join(NAMESPACE_SEPARATOR)
}

function decodeNamespacePath(path: string): string[] {
  return String(path || '').split(NAMESPACE_SEPARATOR).map(item => item.trim()).filter(Boolean)
}

function compareValues(left: unknown, right: unknown): number {
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber))
    return leftNumber - rightNumber
  return String(left ?? '').localeCompare(String(right ?? ''))
}

function matchesFilter(value: Record<string, any>, filter?: Record<string, any>): boolean {
  if (!filter || Object.keys(filter).length === 0)
    return true
  return Object.entries(filter).every(([key, expected]) => {
    const actual = value[key]
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      const operators = expected as Record<string, unknown>
      return Object.entries(operators).every(([operator, operand]) => {
        const compared = compareValues(actual, operand)
        if (operator === '$eq')
          return compared === 0
        if (operator === '$ne')
          return compared !== 0
        if (operator === '$gt')
          return compared > 0
        if (operator === '$gte')
          return compared >= 0
        if (operator === '$lt')
          return compared < 0
        if (operator === '$lte')
          return compared <= 0
        return false
      })
    }
    return compareValues(actual, expected) === 0
  })
}

function buildThreadConfig(input: {
  threadId: string
  checkpointNs?: string
  checkpointId?: string | null
}): RunnableConfig {
  return {
    configurable: {
      thread_id: input.threadId,
      checkpoint_ns: toText(input.checkpointNs),
      ...(toText(input.checkpointId) ? { checkpoint_id: toText(input.checkpointId) } : {}),
    },
  }
}

function parseThreadConfig(config: RunnableConfig): {
  threadId: string
  checkpointNs: string
  checkpointId: string
} {
  const configurable = normalizeRecord(config.configurable)
  return {
    threadId: toText(configurable.thread_id),
    checkpointNs: toText(configurable.checkpoint_ns),
    checkpointId: toText(configurable.checkpoint_id),
  }
}

class PostgresCheckpointSaver extends BaseCheckpointSaver {
  override async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const { threadId, checkpointNs, checkpointId } = parseThreadConfig(config)
    if (!threadId)
      return undefined

    const pool = await getPool()
    const values: unknown[] = [threadId, checkpointNs]
    const checkpointFilter = checkpointId
      ? `AND checkpoint_id = $3`
      : ''
    if (checkpointId)
      values.push(checkpointId)
    const result = await pool.query<DeepAgentCheckpointRow>(
      `SELECT
        thread_id,
        checkpoint_ns,
        checkpoint_id,
        parent_checkpoint_id,
        checkpoint_json,
        metadata_json,
        pending_writes_json
       FROM ai_deepagent_checkpoints
       WHERE thread_id = $1
         AND checkpoint_ns = $2
         ${checkpointFilter}
       ORDER BY updated_at DESC
       LIMIT 1`,
      values,
    )
    const row = result.rows[0]
    if (!row)
      return undefined

    return {
      config: buildThreadConfig({
        threadId: row.thread_id,
        checkpointNs: row.checkpoint_ns,
        checkpointId: row.checkpoint_id,
      }),
      checkpoint: row.checkpoint_json,
      metadata: normalizeRecord(row.metadata_json) as CheckpointMetadata,
      parentConfig: toText(row.parent_checkpoint_id)
        ? buildThreadConfig({
            threadId: row.thread_id,
            checkpointNs: row.checkpoint_ns,
            checkpointId: row.parent_checkpoint_id,
          })
        : undefined,
      pendingWrites: normalizeCheckpointPendingWrites(row.pending_writes_json),
    }
  }

  override async* list(config: RunnableConfig, options?: CheckpointListOptions): AsyncGenerator<CheckpointTuple> {
    const { threadId, checkpointNs } = parseThreadConfig(config)
    if (!threadId)
      return

    const pool = await getPool()
    const values: unknown[] = [threadId, checkpointNs, Math.max(1, Math.min(200, Number(options?.limit || 50)))]
    const result = await pool.query<DeepAgentCheckpointRow>(
      `SELECT
        thread_id,
        checkpoint_ns,
        checkpoint_id,
        parent_checkpoint_id,
        checkpoint_json,
        metadata_json,
        pending_writes_json
       FROM ai_deepagent_checkpoints
       WHERE thread_id = $1
         AND checkpoint_ns = $2
       ORDER BY updated_at DESC
       LIMIT $3`,
      values,
    )

    for (const row of result.rows) {
      if (options?.before) {
        const before = parseThreadConfig(options.before)
        if (before.checkpointId && row.checkpoint_id >= before.checkpointId)
          continue
      }
      if (options?.filter && !matchesFilter(normalizeRecord(row.metadata_json), options.filter))
        continue
      yield {
        config: buildThreadConfig({
          threadId: row.thread_id,
          checkpointNs: row.checkpoint_ns,
          checkpointId: row.checkpoint_id,
        }),
        checkpoint: row.checkpoint_json,
        metadata: normalizeRecord(row.metadata_json) as CheckpointMetadata,
        parentConfig: toText(row.parent_checkpoint_id)
          ? buildThreadConfig({
              threadId: row.thread_id,
              checkpointNs: row.checkpoint_ns,
              checkpointId: row.parent_checkpoint_id,
            })
          : undefined,
        pendingWrites: normalizeCheckpointPendingWrites(row.pending_writes_json),
      }
    }
  }

  override async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: Record<string, string | number>,
  ): Promise<RunnableConfig> {
    const { threadId, checkpointNs, checkpointId } = parseThreadConfig(config)
    if (!threadId)
      throw new Error('DEEPAGENT_THREAD_ID_REQUIRED')

    const pool = await getPool()
    await pool.query(
      `INSERT INTO ai_deepagent_checkpoints (
        thread_id,
        checkpoint_ns,
        checkpoint_id,
        parent_checkpoint_id,
        checkpoint_json,
        metadata_json,
        pending_writes_json,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5::JSONB, $6::JSONB, '[]'::JSONB, NOW(), NOW()
      )
      ON CONFLICT (thread_id, checkpoint_ns, checkpoint_id) DO UPDATE
        SET parent_checkpoint_id = EXCLUDED.parent_checkpoint_id,
            checkpoint_json = EXCLUDED.checkpoint_json,
            metadata_json = EXCLUDED.metadata_json,
            updated_at = NOW()`,
      [
        threadId,
        checkpointNs,
        checkpoint.id,
        checkpointId,
        JSON.stringify(checkpoint),
        JSON.stringify(metadata || {}),
      ],
    )

    return buildThreadConfig({
      threadId,
      checkpointNs,
      checkpointId: checkpoint.id,
    })
  }

  override async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    const { threadId, checkpointNs, checkpointId } = parseThreadConfig(config)
    if (!threadId || !checkpointId || writes.length === 0)
      return

    const pendingWrites = [...((await this.getTuple(config))?.pendingWrites || [])]
    const nextPendingWrites: CheckpointPendingWrite[] = writes.map(([channel, value]) => [taskId, channel, value])
    pendingWrites.push(...nextPendingWrites)

    const pool = await getPool()
    await pool.query(
      `UPDATE ai_deepagent_checkpoints
       SET pending_writes_json = $4::JSONB,
           updated_at = NOW()
       WHERE thread_id = $1
         AND checkpoint_ns = $2
         AND checkpoint_id = $3`,
      [
        threadId,
        checkpointNs,
        checkpointId,
        JSON.stringify(pendingWrites),
      ],
    )
  }

  override async deleteThread(threadId: string): Promise<void> {
    const normalizedThreadId = toText(threadId)
    if (!normalizedThreadId)
      return
    const pool = await getPool()
    await pool.query(
      `DELETE FROM ai_deepagent_checkpoints
       WHERE thread_id = $1`,
      [normalizedThreadId],
    )
  }
}

class PostgresStore extends BaseStoreClass {
  override async batch<Op extends Operation[]>(operations: Op): Promise<OperationResults<Op>> {
    const results: unknown[] = []
    for (const operation of operations) {
      if ('namespace' in operation && 'key' in operation && 'value' in operation) {
        if (operation.value === null) {
          await this.delete(operation.namespace, operation.key)
          results.push(undefined)
          continue
        }
        await this.put(operation.namespace, operation.key, operation.value, operation.index)
        results.push(undefined)
        continue
      }
      if ('namespace' in operation && 'key' in operation) {
        results.push(await this.get(operation.namespace, operation.key))
        continue
      }
      if ('namespacePrefix' in operation) {
        results.push(await this.search(operation.namespacePrefix, {
          filter: operation.filter,
          limit: operation.limit,
          offset: operation.offset,
          query: operation.query,
        }))
        continue
      }
      results.push(await this.listNamespaces({
        prefix: (operation.matchConditions || []).find(item => item.matchType === 'prefix')?.path?.filter(Boolean) as string[] | undefined,
        suffix: (operation.matchConditions || []).find(item => item.matchType === 'suffix')?.path?.filter(Boolean) as string[] | undefined,
        maxDepth: operation.maxDepth,
        limit: operation.limit,
        offset: operation.offset,
      }))
    }
    return results as OperationResults<Op>
  }

  override async get(namespace: string[], key: string): Promise<Item | null> {
    const pool = await getPool()
    const namespacePath = encodeNamespacePath(namespace)
    const result = await pool.query<DeepAgentStoreItemRow>(
      `SELECT
        namespace_path,
        namespace_json,
        item_key,
        value_json,
        created_at::TEXT,
        updated_at::TEXT
       FROM ai_deepagent_store_items
       WHERE namespace_path = $1
         AND item_key = $2
       LIMIT 1`,
      [namespacePath, toText(key)],
    )
    const row = result.rows[0]
    if (!row)
      return null
    return {
      namespace: Array.isArray(row.namespace_json) ? row.namespace_json : decodeNamespacePath(row.namespace_path),
      key: row.item_key,
      value: normalizeRecord(row.value_json),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }
  }

  override async search(namespacePrefix: string[], options?: {
    filter?: Record<string, any>
    limit?: number
    offset?: number
    query?: string
  }): Promise<SearchItem[]> {
    const pool = await getPool()
    const namespacePath = encodeNamespacePath(namespacePrefix)
    const result = await pool.query<DeepAgentStoreItemRow>(
      `SELECT
        namespace_path,
        namespace_json,
        item_key,
        value_json,
        created_at::TEXT,
        updated_at::TEXT
       FROM ai_deepagent_store_items
       WHERE $1 = ''
          OR namespace_path = $1
          OR namespace_path LIKE $1 || $2
       ORDER BY updated_at DESC`,
      [namespacePath, `${NAMESPACE_SEPARATOR}%`],
    )
    const queryText = toText(options?.query).toLowerCase()
    const filtered = result.rows
      .map((row) => {
        const value = normalizeRecord(row.value_json)
        const haystack = JSON.stringify(value).toLowerCase()
        const score = queryText
          ? (haystack.includes(queryText) ? Number((queryText.length / Math.max(queryText.length, haystack.length)).toFixed(6)) : 0)
          : undefined
        return {
          namespace: Array.isArray(row.namespace_json) ? row.namespace_json : decodeNamespacePath(row.namespace_path),
          key: row.item_key,
          value,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
          score,
        } satisfies SearchItem
      })
      .filter(item => matchesFilter(item.value, options?.filter))
      .filter(item => !queryText || Number(item.score || 0) > 0)
      .sort((left, right) => Number(right.score || 0) - Number(left.score || 0) || right.updatedAt.getTime() - left.updatedAt.getTime())

    const offset = Math.max(0, Number(options?.offset || 0))
    const limit = Math.max(1, Math.min(100, Number(options?.limit || 10)))
    return filtered.slice(offset, offset + limit)
  }

  override async put(namespace: string[], key: string, value: Record<string, any>, index?: false | string[]): Promise<void> {
    const pool = await getPool()
    const normalizedNamespace = namespace.map(item => toText(item)).filter(Boolean)
    await pool.query(
      `INSERT INTO ai_deepagent_store_items (
        namespace_path,
        namespace_json,
        item_key,
        value_json,
        index_fields_json,
        created_at,
        updated_at
      ) VALUES (
        $1, $2::JSONB, $3, $4::JSONB, $5::JSONB, NOW(), NOW()
      )
      ON CONFLICT (namespace_path, item_key) DO UPDATE
        SET namespace_json = EXCLUDED.namespace_json,
            value_json = EXCLUDED.value_json,
            index_fields_json = EXCLUDED.index_fields_json,
            updated_at = NOW()`,
      [
        encodeNamespacePath(normalizedNamespace),
        JSON.stringify(normalizedNamespace),
        toText(key),
        JSON.stringify(normalizeRecord(value)),
        JSON.stringify(index === false ? [] : Array.isArray(index) ? index : []),
      ],
    )
  }

  override async delete(namespace: string[], key: string): Promise<void> {
    const pool = await getPool()
    await pool.query(
      `DELETE FROM ai_deepagent_store_items
       WHERE namespace_path = $1
         AND item_key = $2`,
      [encodeNamespacePath(namespace), toText(key)],
    )
  }

  override async listNamespaces(options?: {
    prefix?: string[]
    suffix?: string[]
    maxDepth?: number
    limit?: number
    offset?: number
  }): Promise<string[][]> {
    const pool = await getPool()
    const result = await pool.query<{ namespace_json: string[] }>(
      `SELECT DISTINCT namespace_json
       FROM ai_deepagent_store_items`,
    )
    const prefix = options?.prefix || []
    const suffix = options?.suffix || []
    const maxDepth = Math.max(0, Number(options?.maxDepth || 0))
    const rows = result.rows
      .map(row => Array.isArray(row.namespace_json) ? row.namespace_json : [])
      .filter((namespace) => {
        if (prefix.length > 0 && prefix.some((item, index) => toText(namespace[index]) !== toText(item)))
          return false
        if (suffix.length > 0 && suffix.some((item, index) => toText(namespace[namespace.length - suffix.length + index]) !== toText(item)))
          return false
        if (maxDepth > 0 && namespace.length > maxDepth)
          return false
        return true
      })
      .sort((left, right) => left.join('/').localeCompare(right.join('/')))
    const offset = Math.max(0, Number(options?.offset || 0))
    const limit = Math.max(1, Math.min(200, Number(options?.limit || 100)))
    return rows.slice(offset, offset + limit)
  }
}

export interface DeepAgentThreadBinding {
  threadId: string
  checkpointNs: string
}

export function buildDeepAgentThreadBinding(input: {
  workspaceId: string
  projectId?: string
  mode: string
  sessionId: string
  scope?: string
}): DeepAgentThreadBinding {
  return {
    threadId: [
      toText(input.workspaceId) || 'workspace',
      toText(input.projectId) || 'global',
      toText(input.mode) || 'dialog_ask',
      toText(input.scope) || 'default',
      toText(input.sessionId),
    ].join(':'),
    checkpointNs: '',
  }
}

export async function resolveLatestDeepAgentCheckpointRef(binding: DeepAgentThreadBinding): Promise<string> {
  const saver = new PostgresCheckpointSaver()
  const tuple = await saver.getTuple(buildThreadConfig({
    threadId: binding.threadId,
    checkpointNs: binding.checkpointNs,
  }))
  return toText(tuple?.checkpoint?.id)
}

export function createPersistedDeepAgent<T extends Record<string, unknown>>(input: {
  runtime: RuntimeSettings
  binding: DeepAgentThreadBinding
  model: unknown
  tools?: unknown[]
  systemPrompt: string
  subagents?: T[]
}) {
  const checkpointer = new PostgresCheckpointSaver()
  const store: BaseStore = new PostgresStore()
  const agent = createDeepAgent({
    model: input.model as any,
    tools: input.tools as any,
    systemPrompt: input.systemPrompt,
    subagents: input.subagents as any,
    checkpointer,
    store,
  })

  return {
    agent,
    checkpointer,
    store,
    config: {
      configurable: {
        thread_id: input.binding.threadId,
        checkpoint_ns: input.binding.checkpointNs,
      },
    } satisfies RunnableConfig,
  }
}

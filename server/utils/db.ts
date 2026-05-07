import type { H3Event } from 'h3'
import type { Pool as PgPoolType, PoolClient, QueryResult, QueryResultRow } from 'pg'
import { Pool as PgPool } from 'pg'
import { assertWorkspaceSchemaCompatible } from '~~/server/database/bootstrap/compatibility'
import { ensureProjectResourceTreeSchemaReady, ensureSchemaReady, normalizeDbError } from '~~/server/database/bootstrap/schema'
import { readRuntimeSettings } from '~~/server/utils/env'

export interface Queryable {
  query: <T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => Promise<QueryResult<T>>
}

let pool: PgPoolType | null = null
let bootstrapReady = false
let bootstrapPromise: Promise<void> | null = null

async function resetPool(poolRef: PgPoolType): Promise<void> {
  if (pool === poolRef)
    pool = null

  bootstrapReady = false

  try {
    await poolRef.end()
  }
  catch {
    // ignore pool disposal errors during bootstrap recovery
  }
}

async function ensureBootstrapReady(poolRef: PgPoolType): Promise<void> {
  if (bootstrapReady)
    return

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      try {
        await assertWorkspaceSchemaCompatible(poolRef)
        await ensureSchemaReady(poolRef)
        await ensureProjectResourceTreeSchemaReady(poolRef)
        bootstrapReady = true
      }
      catch (error) {
        await resetPool(poolRef)
        throw error
      }
      finally {
        bootstrapPromise = null
      }
    })()
  }

  await bootstrapPromise
}

export async function getPool(event?: H3Event): Promise<PgPoolType> {
  if (!pool) {
    const runtime = readRuntimeSettings(event)
    pool = new PgPool({
      connectionString: runtime.pg.url,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  }

  try {
    await ensureBootstrapReady(pool)
  }
  catch (error) {
    throw normalizeDbError(error)
  }

  return pool
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  event: H3Event | undefined,
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  try {
    const poolRef = await getPool(event)
    return await poolRef.query<T>(text, params)
  }
  catch (error) {
    throw normalizeDbError(error)
  }
}

export async function withClient<T>(event: H3Event | undefined, run: (client: PoolClient) => Promise<T>): Promise<T> {
  try {
    const poolRef = await getPool(event)
    const client = await poolRef.connect()

    try {
      return await run(client)
    }
    finally {
      client.release()
    }
  }
  catch (error) {
    throw normalizeDbError(error)
  }
}

export async function withTransaction<T>(event: H3Event | undefined, run: (client: PoolClient) => Promise<T>): Promise<T> {
  return withClient(event, async (client) => {
    await client.query('BEGIN')
    try {
      const result = await run(client)
      await client.query('COMMIT')
      return result
    }
    catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  })
}

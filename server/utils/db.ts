import type { H3Event } from 'h3'
import type { Pool as PgPoolType, PoolClient, QueryResult, QueryResultRow } from 'pg'
import { Pool as PgPool } from 'pg'
import { ensureProjectResourceTreeSchemaReady, ensureSchemaReady, normalizeDbError } from '~~/server/database/bootstrap/schema'
import { readRuntimeSettings } from '~~/server/utils/env'

export interface Queryable {
  query: <T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => Promise<QueryResult<T>>
}

let pool: PgPoolType | null = null

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
    await ensureSchemaReady(pool)
    await ensureProjectResourceTreeSchemaReady(pool)
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

import { newDb } from 'pg-mem';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { env } from '../config/env.js';
import { AppError, ServiceUnavailableError } from '../lib/errors.js';
import { appMetaSchema, tradeTableSchema, userTableSchema } from './schema.js';

export type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

type DatabaseStatus = {
  driver: 'pg' | 'pg-mem';
  status: 'connected';
  database: string;
};

const DATABASE_UNAVAILABLE_MESSAGE = 'Database is unavailable. Please check DATABASE_URL and ensure PostgreSQL is running.';
const SHOULD_USE_SSL = env.databaseUrl?.includes('render.com') || env.isProduction;

function createPool() {
  if (env.databaseMode === 'memory') {
    const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
    const adapter = memoryDb.adapters.createPg();
    return new adapter.Pool() as unknown as Pool;
  }

  return new Pool({
    connectionString: env.databaseUrl!,
    ssl: SHOULD_USE_SSL ? { rejectUnauthorized: false } : false
  });
}

export const pool = createPool();

let initializedPromise: Promise<void> | null = null;

async function runSchemaSetup(client: Queryable) {
  await client.query(appMetaSchema);
  await client.query(userTableSchema);
  await client.query(tradeTableSchema);
  await client.query(
    `INSERT INTO app_meta (key, value)
     VALUES ('initializedAt', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [new Date().toISOString()]
  );
}

type PgLikeError = Error & {
  code?: string;
  errno?: number;
  syscall?: string;
};

function isDatabaseUnavailableError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const pgError = error as PgLikeError;
  const code = pgError.code ?? '';
  return [
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    '57P03'
  ].includes(code);
}

function normalizeDatabaseError(error: unknown) {
  if (error instanceof AppError) {
    return error;
  }

  if (isDatabaseUnavailableError(error)) {
    return new ServiceUnavailableError(DATABASE_UNAVAILABLE_MESSAGE);
  }

  return error;
}

export async function initializeDatabase() {
  if (!initializedPromise) {
    initializedPromise = (async () => {
      const client = await pool.connect();
      try {
        await runSchemaSetup(client);
      } finally {
        client.release();
      }
    })().catch((error) => {
      initializedPromise = null;
      throw normalizeDatabaseError(error);
    });
  }

  return initializedPromise;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client?: Queryable
): Promise<QueryResult<T>> {
  try {
    await initializeDatabase();
    const executor = client ?? pool;
    return await executor.query<T>(text, params);
  } catch (error) {
    throw normalizeDatabaseError(error);
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  let client: PoolClient | null = null;

  try {
    await initializeDatabase();
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => undefined);
    }
    throw normalizeDatabaseError(error);
  } finally {
    client?.release();
  }
}

export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  if (env.databaseMode === 'memory') {
    return {
      driver: 'pg-mem',
      status: 'connected',
      database: 'stock_tracking_memory'
    };
  }

  const result = await query<{ current_database: string }>('SELECT current_database()');
  return {
    driver: 'pg',
    status: 'connected',
    database: result.rows[0]?.current_database ?? 'unknown'
  };
}

export async function closeDatabase() {
  await pool.end();
}

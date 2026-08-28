import { Pool } from 'pg';

/** DI token for the connection pool. */
export const DATABASE_POOL = Symbol('DATABASE_POOL');

export const createPool = (connectionString: string): Pool =>
  new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

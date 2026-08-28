import { Pool } from 'pg';

const CONNECTION =
  process.env['DATABASE_URL'] ??
  'postgresql://postgres:postgres@localhost:5432/sell2rent';

/**
 * Integration tests run against real PostgreSQL, never a substitute dialect.
 *
 * Everything risky in this project is Postgres-specific: the clamped bonus, the
 * integer-division trap, and `ORDER BY` resolving a bare name against an output
 * alias. A different engine would not reproduce any of them.
 */
export default async function globalSetup(): Promise<void> {
  process.env['NODE_ENV'] = 'test';
  process.env['DATABASE_URL'] = CONNECTION;

  const pool = new Pool({ connectionString: CONNECTION, connectionTimeoutMillis: 5_000 });
  try {
    await pool.query('SELECT 1');
  } catch (error) {
    throw new Error(
      `Integration tests need PostgreSQL at ${CONNECTION}.\n` +
        `Start it with: docker compose up -d\n` +
        `Cause: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await pool.end();
  }
}

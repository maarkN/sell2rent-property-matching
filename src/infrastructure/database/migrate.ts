import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

/**
 * Applies pending `.sql` migrations in filename order, recording each so a
 * second run is a no-op rather than an error.
 */
export async function runMigrations(pool: Pool): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query<{ filename: string }>(
    'SELECT filename FROM schema_migrations',
  );
  const applied = new Set(rows.map((row) => row.filename));

  const pending = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .filter((name) => !applied.has(name));

  for (const filename of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
    const client = await pool.connect();
    try {
      // One transaction per migration: a failure leaves no half-applied schema.
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [
        filename,
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return pending;
}

if (require.main === module) {
  const connectionString = process.env['DATABASE_URL'];
  if (connectionString === undefined || connectionString === '') {
    throw new Error('DATABASE_URL is not set');
  }
  const pool = new Pool({ connectionString });
  runMigrations(pool)
    .then((applied) => {
      console.log(
        applied.length === 0
          ? 'No pending migrations.'
          : `Applied: ${applied.join(', ')}`,
      );
      return pool.end();
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
      return pool.end();
    });
}

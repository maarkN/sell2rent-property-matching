import { Pool } from 'pg';
import { runMigrations } from '../../../src/infrastructure/database/migrate';

describe('migration runner', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('is a no-op on a second run rather than an error', async () => {
    // global-setup has already migrated, so this run must find nothing pending.
    await expect(runMigrations(pool)).resolves.toEqual([]);
    await expect(runMigrations(pool)).resolves.toEqual([]);
  });

  it('records what it applied', async () => {
    const { rows } = await pool.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations ORDER BY filename',
    );

    expect(rows.map((r) => r.filename)).toContain('001_properties.sql');
  });
});

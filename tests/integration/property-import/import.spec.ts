import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Pool } from 'pg';

import { AppModule } from '../../../src/app.module';
import { DATABASE_POOL } from '@infrastructure/database/pool';
import { Logger } from '@shared/utils/logger';
import { HttpExceptionFilter } from '@interfaces/filters/http-exception.filter';
import type { ImportResult } from '@application/usecases/import-properties.usecase';

describe('POST /properties/import', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter(app.get(Logger)));
    await app.init();
    pool = app.get<Pool>(DATABASE_POOL);
  });

  // Every test starts from an empty table. Without this, a test asserting on
  // a FIRST import silently observes the state left by the test before it —
  // which is how "imported: 0" masquerades as a broken ON CONFLICT clause.
  beforeEach(async () => {
    await pool.query('TRUNCATE properties RESTART IDENTITY');
  });

  afterAll(async () => {
    await app.close();
  });

  const importFeed = async (): Promise<ImportResult> => {
    const response = await request(app.getHttpServer()).post('/properties/import');
    expect(response.status).toBe(200);
    return response.body as ImportResult;
  };

  it('imports 410 records and skips 10 from the provided feed', async () => {
    const result = await importFeed();

    // The brief's example shows 405/15. The actual feed yields 410/10 —
    // the example is illustrative, and matching it would mean building the
    // wrong validator.
    expect(result.imported).toBe(410);
    expect(result.skipped).toBe(10);
    expect(result.errors).toHaveLength(10);
  });

  it('gives every rejection a reason, and never an empty one', async () => {
    const result = await importFeed();

    for (const rejection of result.errors) {
      expect(typeof rejection.reason).toBe('string');
      expect(rejection.reason.length).toBeGreaterThan(0);
    }
  });

  it('reports the specific defect, not an incidental missing field', async () => {
    const result = await importFeed();
    const byId = new Map(result.errors.map((e) => [e.external_id, e.reason]));

    // The brief itself cites P0416 as "negative price". Every one of these
    // records is ALSO missing several fields, so reporting the interesting
    // defect rather than the first absent column is the requirement.
    expect(byId.get('P0416')).toMatch(/negative/);
    expect(byId.get('P0417')).toMatch(/zero/);
    expect(byId.get('P0412')).toMatch(/not a number/);
    expect(byId.get('P0419')).toMatch(/null/);
    expect(byId.get('P0418')).toMatch(/city is not a string/);
    expect(byId.get('P0411')).toMatch(/price is missing/);
    expect(byId.get('P0415')).toMatch(/city is missing/);
  });

  it('reports a position for the three records with no usable identifier', async () => {
    const result = await importFeed();
    const anonymous = result.errors.filter((e) => e.external_id === null);

    expect(anonymous).toHaveLength(3);
    for (const rejection of anonymous) {
      expect(typeof rejection.index).toBe('number');
      expect(rejection.index).toBeGreaterThanOrEqual(0);
    }
  });

  it('is idempotent: a second import inserts nothing', async () => {
    const first = await importFeed();
    const second = await importFeed();

    expect(first.imported).toBe(410);
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(10);

    const { rows } = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM properties',
    );
    expect(Number(rows[0]?.count)).toBe(410);
  });

  it('admits the valid-but-extreme records rather than treating them as dirty', async () => {
    await importFeed();

    // P0404 is a 5,000,000 property; it is valid inventory and must import.
    // It exists to break unguarded arithmetic in the matching engine later.
    const { rows } = await pool.query<{ external_id: string; price: string }>(
      "SELECT external_id, price FROM properties WHERE external_id IN ('P0401','P0404','P0403')",
    );
    expect(rows).toHaveLength(3);
    expect(Number(rows.find((r) => r.external_id === 'P0404')?.price)).toBe(5_000_000);
  });

  it('refuses a non-positive price written directly to storage', async () => {
    // Defence in depth: the constraint holds even for a write path that
    // bypasses the entity entirely.
    await expect(
      pool.query(
        `INSERT INTO properties
           (external_id, city, state, price, bedrooms, bathrooms, square_feet, lot_size)
         VALUES ('DIRECT-1', 'Houston', 'TX', 0, 3, 2, 1650, 5000)`,
      ),
    ).rejects.toThrow(/properties_price_positive/);
  });
});

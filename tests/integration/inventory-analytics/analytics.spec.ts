import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Pool } from 'pg';

import { AppModule } from '../../../src/app.module';
import { DATABASE_POOL } from '@infrastructure/database/pool';
import { Logger } from '@shared/utils/logger';
import { HttpExceptionFilter } from '@interfaces/filters/http-exception.filter';
import type { ImportResult } from '@application/usecases/import-properties.usecase';
import type { TopCityResponse } from '@interfaces/dtos/top-cities.dto';

describe('GET /analytics/top-cities', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter(app.get(Logger)));
    await app.init();
    pool = app.get<Pool>(DATABASE_POOL);
  });

  // Aggregates describe the WHOLE table, so every test here needs to own it.
  // This is also why the integration project runs serially: two suites
  // truncating `properties` in parallel workers would read each other's
  // half-finished state.
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

  const topCities = async (): Promise<{ body: TopCityResponse[]; text: string }> => {
    const response = await request(app.getHttpServer()).get('/analytics/top-cities');
    expect(response.status).toBe(200);
    return { body: response.body as TopCityResponse[], text: response.text };
  };

  const scalar = async (sql: string): Promise<number | null> => {
    const { rows } = await pool.query<{ value: string | null }>(sql);
    const value = rows[0]?.value;
    return value === null || value === undefined ? null : Number(value);
  };

  it('returns an empty array with 200 before any property has been imported', async () => {
    // An aggregation over nothing is a legitimate answer, not an error: the
    // service has to be queryable before the first import runs.
    const response = await request(app.getHttpServer()).get('/analytics/top-cities');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('returns a bare JSON array, not an object containing one', async () => {
    await importFeed();
    const { body, text } = await topCities();

    expect(Array.isArray(body)).toBe(true);
    // Checked on the wire, not just on the parsed body: an envelope would
    // still parse into an object here and the assertion above would pass.
    expect(text.trimStart().startsWith('[')).toBe(true);

    for (const entry of body) {
      expect(Object.keys(entry).sort()).toEqual([
        'average_price',
        'city',
        'property_count',
        'total_inventory',
      ]);
    }
  });

  it('reports one entry per city, ranked by property count descending', async () => {
    await importFeed();
    const { body } = await topCities();

    expect(body).toHaveLength(8);
    expect(new Set(body.map((entry) => entry.city)).size).toBe(body.length);

    const counts = body.map((entry) => entry.property_count);
    expect(counts).toEqual([54, 54, 53, 52, 51, 50, 50, 46]);

    // Non-increasing is the whole assertion. The counts above contain two
    // TIES — 54/54 and 50/50 — and the query imposes no secondary ordering,
    // so which of a tied pair comes first is not guaranteed. Naming the
    // expected cities here would encode an order the query does not promise
    // and would fail the day the planner chose differently.
    // See design.md Decision 3.
    expect(counts).toEqual([...counts].sort((left, right) => right - left));
  });

  it('reports the average price as a number at two decimals, never as text', async () => {
    await importFeed();
    const { body, text } = await topCities();

    // `pg` hands NUMERIC back as a string, so without the conversion this
    // field would serialise as "390391.44" — valid JSON, wrong type, and
    // silent. The wire check is the one that actually catches it.
    expect(text).not.toMatch(/"average_price":\s*"/);

    for (const entry of body) {
      expect(typeof entry.average_price).toBe('number');
      expect(Number.isFinite(entry.average_price)).toBe(true);
      expect(entry.average_price).toBe(Math.round(entry.average_price * 100) / 100);
    }
  });

  it('reports total_inventory as the property count, per design.md Decision 1', async () => {
    await importFeed();
    const { body } = await topCities();

    expect(body).not.toHaveLength(0);
    for (const entry of body) {
      expect(entry.total_inventory).toBe(entry.property_count);
    }
  });

  it('counts sum to the stored property total, so rejected records contribute nothing', async () => {
    const imported = await importFeed();
    const { body } = await topCities();

    const summed = body.reduce((total, entry) => total + entry.property_count, 0);

    expect(imported.imported).toBe(410);
    expect(imported.skipped).toBe(10);
    expect(summed).toBe(410);

    // Compared against storage as well as against the import report: if the
    // aggregation counted something the table does not hold, agreeing with
    // `imported` alone would not reveal it.
    expect(summed).toBe(await scalar('SELECT COUNT(*)::text AS value FROM properties'));
  });

  it('reports a city holding one property with a count of one and that property price', async () => {
    await pool.query(
      `INSERT INTO properties
         (external_id, city, state, price, bedrooms, bathrooms, square_feet, lot_size)
       VALUES ('SOLO-1', 'Galveston', 'TX', 437250.55, 3, 2, 1650, 5000)`,
    );

    const { body } = await topCities();

    // The average of one row is that row's price exactly — which also means a
    // botched numeric conversion shows up as a wrong VALUE here, not merely a
    // wrong type.
    expect(body).toEqual([
      {
        city: 'Galveston',
        property_count: 1,
        average_price: 437250.55,
        total_inventory: 1,
      },
    ]);
  });

  it('reflects the planted outliers in the average of the city holding them', async () => {
    await importFeed();
    const { body } = await topCities();

    const austin = body.find((entry) => entry.city === 'Austin');
    expect(austin).toBeDefined();

    const outliers = await scalar(
      "SELECT COUNT(*)::text AS value FROM properties WHERE city = 'Austin' AND price >= 2500000",
    );
    expect(outliers).toBeGreaterThan(0);

    // The reported figure is the average over EVERY stored Austin property.
    const withOutliers = await scalar(
      "SELECT ROUND(AVG(price), 2)::text AS value FROM properties WHERE city = 'Austin'",
    );
    expect(austin?.average_price).toBe(withOutliers);

    // And they move it materially: excluding them drops the mean by roughly a
    // quarter. The outliers are valid inventory, so this skew is the correct
    // behaviour rather than a defect to filter away — design.md Decision 2.
    const withoutOutliers = await scalar(
      "SELECT ROUND(AVG(price), 2)::text AS value FROM properties WHERE city = 'Austin' AND price < 2500000",
    );
    expect(withoutOutliers).not.toBeNull();
    expect(austin?.average_price).toBeGreaterThan(withoutOutliers ?? 0);
  });
});

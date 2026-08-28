import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Pool } from 'pg';

import { AppModule } from '../../../src/app.module';
import { DATABASE_POOL } from '@infrastructure/database/pool';
import { Logger } from '@shared/utils/logger';
import { HttpExceptionFilter } from '@interfaces/filters/http-exception.filter';
import type { MatchesResponse, MatchResponse } from '@interfaces/dtos/matches.dto';

interface PropertyFixture {
  readonly external_id: string;
  readonly city: string;
  readonly price: number;
  readonly bedrooms: number;
  readonly square_feet: number;
}

/** The brief's own sample investor, used wherever a test needs the real dataset. */
const SAMPLE = {
  name: 'Jane Doe',
  min_price: 150000,
  max_price: 300000,
  preferred_city: 'Houston',
  min_bedrooms: 3,
  min_square_feet: 1200,
};

describe('GET /investors/:id/matches', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter(app.get(Logger)));
    await app.init();
    pool = app.get<Pool>(DATABASE_POOL);
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE properties, investors RESTART IDENTITY');
  });

  afterAll(async () => {
    await app.close();
  });

  const server = (): ReturnType<INestApplication['getHttpServer']> => app.getHttpServer();

  const createInvestor = async (
    overrides: Partial<typeof SAMPLE> = {},
    omitCity = false,
  ): Promise<number> => {
    const body: Record<string, unknown> = { ...SAMPLE, ...overrides };
    // The schema marks preferred_city optional, so "no preference" is an
    // ABSENT key rather than a null one.
    if (omitCity) delete body['preferred_city'];

    const response = await request(server()).post('/investors').send(body);
    expect(response.status).toBe(201);
    return (response.body as { id: number }).id;
  };

  const insertProperties = async (fixtures: readonly PropertyFixture[]): Promise<void> => {
    for (const f of fixtures) {
      await pool.query(
        `INSERT INTO properties
           (external_id, city, state, price, bedrooms, bathrooms, square_feet, lot_size)
         VALUES ($1, $2, 'TX', $3, $4, 2, $5, 5000)`,
        [f.external_id, f.city, f.price, f.bedrooms, f.square_feet],
      );
    }
  };

  const importFeed = async (): Promise<void> => {
    const response = await request(server()).post('/properties/import');
    expect(response.status).toBe(200);
  };

  const matches = async (
    investorId: number,
    query: Record<string, string | number> = {},
  ): Promise<MatchesResponse> => {
    const response = await request(server())
      .get(`/investors/${investorId}/matches`)
      .query(query);
    expect(response.status).toBe(200);
    return response.body as MatchesResponse;
  };

  /** Pages through the whole result set, so ordering can be asserted end to end. */
  const allMatches = async (investorId: number): Promise<MatchResponse[]> => {
    const first = await matches(investorId, { page: 1, page_size: 100 });
    const collected = [...first.data];

    for (let page = 2; collected.length < first.meta.total; page += 1) {
      const next = await matches(investorId, { page, page_size: 100 });
      if (next.data.length === 0) break;
      collected.push(...next.data);
    }

    return collected;
  };

  const scoreOf = (entries: readonly MatchResponse[], externalId: string): number => {
    const found = entries.find((entry) => entry.external_id === externalId);
    if (found === undefined) throw new Error(`${externalId} missing from the ranking`);
    return found.score;
  };

  /**
   * Records the SQL issued while `fn` runs.
   *
   * The memory and round-trip guarantees are claims about how many statements
   * reach the database, which no assertion on the response body can check.
   */
  const recordSql = async <T>(fn: () => Promise<T>): Promise<{ result: T; sql: string[] }> => {
    const sql: string[] = [];
    const original = pool.query.bind(pool);

    (pool as unknown as { query: unknown }).query = (...args: unknown[]): unknown => {
      if (typeof args[0] === 'string') sql.push(args[0]);
      return (original as (...a: unknown[]) => unknown)(...args);
    };

    try {
      return { result: await fn(), sql };
    } finally {
      (pool as unknown as { query: unknown }).query = original;
    }
  };

  // ── 1.1 weighted scoring terms ──────────────────────────────────────────

  it('scores 95 before the bonus for all four criteria, and 0 for none', async () => {
    await insertProperties([
      // In Houston, in range at the LOW BOUNDARY so the bonus is exactly 0,
      // which is what isolates the weighted terms from it.
      { external_id: 'ALL-4', city: 'Houston', price: 150000, bedrooms: 3, square_feet: 1200 },
      { external_id: 'NONE', city: 'Dallas', price: 1000000, bedrooms: 1, square_feet: 500 },
    ]);
    const investor = await createInvestor();

    const entries = await allMatches(investor);

    expect(scoreOf(entries, 'ALL-4')).toBe(95);
    expect(scoreOf(entries, 'NONE')).toBe(0);
  });

  // ── 1.2 the proximity bonus and its three guards ────────────────────────

  it('awards the bonus across its range and clamps it at both ends', async () => {
    const common = { city: 'Houston', bedrooms: 3, square_feet: 1200 };
    await insertProperties([
      { external_id: 'MID', price: 225000, ...common },
      { external_id: 'LOW', price: 150000, ...common },
      { external_id: 'HIGH', price: 300000, ...common },
      { external_id: 'QUARTER', price: 187500, ...common },
      { external_id: 'OUTLIER', price: 5000000, ...common },
    ]);
    const investor = await createInvestor();

    const entries = await allMatches(investor);

    expect(scoreOf(entries, 'MID')).toBe(100); // 95 + full bonus
    expect(scoreOf(entries, 'LOW')).toBe(95); // 95 + 0 at the boundary
    expect(scoreOf(entries, 'HIGH')).toBe(95);

    // A fractional value. Without the numeric cast the division truncates and
    // this is 95 or 100 — never 97.5.
    expect(scoreOf(entries, 'QUARTER')).toBe(97.5);

    // Unclamped this is -313.3, dragging the total to -288.3.
    expect(scoreOf(entries, 'OUTLIER')).toBe(65); // 40 + 15 + 10, no range, no bonus
  });

  // ── 1.3 ordering at full precision ──────────────────────────────────────

  it('ranks by fit at full precision, not by the rounded score', async () => {
    await importFeed();
    const investor = await createInvestor();

    const entries = await allMatches(investor);
    const rank = (id: string): number =>
      entries.findIndex((entry) => entry.external_id === id);

    // design.md Decision 3: these three sit within 0.005 of each other. Round
    // inside the query and they collapse into a tie, after which the
    // identifier tie-break puts P0029 — the WORST fit — first.
    expect(rank('P0187')).toBeLessThan(rank('P0363'));
    expect(rank('P0363')).toBeLessThan(rank('P0029'));

    // Reported at four decimals, they stay distinct rather than all reading 59.38.
    const scores = ['P0187', 'P0363', 'P0029'].map((id) => scoreOf(entries, id));
    expect(new Set(scores).size).toBe(3);
    expect(scores).toEqual([...scores].sort((left, right) => right - left));
  });

  // ── 1.4 pagination and the total ────────────────────────────────────────

  it('returns the page and the total in a single statement', async () => {
    await importFeed();
    const investor = await createInvestor();

    const { result, sql } = await recordSql(() => matches(investor, { page: 2, page_size: 20 }));

    expect(result.data).toHaveLength(20);
    expect(result.meta).toEqual({ page: 2, page_size: 20, total: 410 });

    // One statement reads properties: the ranking. A separate COUNT would
    // make this two.
    expect(sql.filter((statement) => statement.includes('FROM properties'))).toHaveLength(1);
  });

  // ── 2.1 the investor must exist ─────────────────────────────────────────

  it('reports 404 for an unknown investor without ranking anything', async () => {
    await importFeed();

    const { result, sql } = await recordSql(async () =>
      request(server()).get('/investors/9999/matches'),
    );

    expect(result.status).toBe(404);
    expect((result.body as { message: string }).message).toContain('9999');

    // Ranking scans and sorts the entire inventory; spending that to produce a
    // 404 is the mistake this asserts against.
    expect(sql.filter((statement) => statement.includes('FROM properties'))).toHaveLength(0);
  });

  it('reports 400 for a malformed investor id rather than 404', async () => {
    const response = await request(server()).get('/investors/abc/matches');
    expect(response.status).toBe(400);
  });

  // ── 2.2 the pagination query schema ─────────────────────────────────────

  it('applies the documented defaults when pagination is omitted', async () => {
    await importFeed();
    const investor = await createInvestor();

    const result = await matches(investor);

    expect(result.meta.page).toBe(1);
    expect(result.meta.page_size).toBe(20);
    expect(result.data).toHaveLength(20);
  });

  it.each([
    ['a page below one', { page: 0 }],
    ['a negative page', { page: -3 }],
    ['a page size above the maximum', { page_size: 101 }],
    ['a page size below one', { page_size: 0 }],
    ['a non-numeric page size', { page_size: 'twenty' }],
    ['a fractional page', { page: 1.5 }],
    ['an unknown parameter', { page_siz: 3 }],
  ])('rejects %s with 400', async (_label, query) => {
    const investor = await createInvestor();

    const response = await request(server())
      .get(`/investors/${investor}/matches`)
      .query(query as Record<string, string | number>);

    expect(response.status).toBe(400);
  });

  // ── 2.3 the endpoint ────────────────────────────────────────────────────

  it('ranks every stored property, reporting the score at four decimals', async () => {
    await importFeed();
    const investor = await createInvestor();

    const entries = await allMatches(investor);

    expect(entries).toHaveLength(410);
    for (const entry of entries) {
      expect(typeof entry.score).toBe('number');
      // Rounded for display only — the ordering already used more precision.
      expect(entry.score).toBe(Number(entry.score.toFixed(4)));
    }
  });

  // ── 3.1 / 3.2 scoring cases ─────────────────────────────────────────────

  it('gives a property satisfying every criterion at the midpoint the maximum score', async () => {
    await insertProperties([
      { external_id: 'BEST', city: 'Houston', price: 225000, bedrooms: 4, square_feet: 2000 },
    ]);
    const investor = await createInvestor();

    expect(scoreOf(await allMatches(investor), 'BEST')).toBe(100);
  });

  it('gives a property matching only the city exactly the city weight', async () => {
    await insertProperties([
      { external_id: 'CITY-ONLY', city: 'Houston', price: 900000, bedrooms: 1, square_feet: 400 },
    ]);
    const investor = await createInvestor();

    expect(scoreOf(await allMatches(investor), 'CITY-ONLY')).toBe(40);
  });

  // ── 3.3 the degenerate range ────────────────────────────────────────────

  it('handles a price range of zero width instead of dividing by zero', async () => {
    await insertProperties([
      { external_id: 'ON-IT', city: 'Dallas', price: 200000, bedrooms: 3, square_feet: 1500 },
      { external_id: 'OFF-IT', city: 'Dallas', price: 200001, bedrooms: 3, square_feet: 1500 },
    ]);
    // The other criteria are set out of reach, so only the range and its bonus
    // contribute and the arithmetic is visible on its own.
    const investor = await createInvestor({
      min_price: 200000,
      max_price: 200000,
      preferred_city: 'Nowhere',
      min_bedrooms: 10,
      min_square_feet: 99999,
    });

    const entries = await allMatches(investor);

    expect(scoreOf(entries, 'ON-IT')).toBe(35); // 30 in range + the full bonus
    expect(scoreOf(entries, 'OFF-IT')).toBe(0);
  });

  // ── 3.4 the score stays inside its stated range ─────────────────────────

  it('keeps every score between 0 and 100 across the whole inventory', async () => {
    await importFeed();
    const investor = await createInvestor();

    for (const entry of await allMatches(investor)) {
      expect(entry.score).toBeGreaterThanOrEqual(0);
      expect(entry.score).toBeLessThanOrEqual(100);
    }
  });

  // ── 3.5 the tie-break ───────────────────────────────────────────────────

  it('breaks ties by external identifier ascending', async () => {
    const common = { city: 'Houston', price: 225000, bedrooms: 3, square_feet: 1200 };
    await insertProperties([
      { external_id: 'P-C', ...common },
      { external_id: 'P-A', ...common },
      { external_id: 'P-D', ...common },
      { external_id: 'P-B', ...common },
    ]);
    const investor = await createInvestor();

    const entries = await allMatches(investor);

    expect(new Set(entries.map((entry) => entry.score)).size).toBe(1);
    expect(entries.map((entry) => entry.external_id)).toEqual(['P-A', 'P-B', 'P-C', 'P-D']);
  });

  // ── 3.6 pagination is total ─────────────────────────────────────────────

  it('returns every property exactly once when paginating the full set', async () => {
    await importFeed();
    const investor = await createInvestor();

    const seen: string[] = [];
    let page = 1;
    let total = 0;

    for (;;) {
      const result = await matches(investor, { page, page_size: 33 });
      total = result.meta.total;
      if (result.data.length === 0) break;
      seen.push(...result.data.map((entry) => entry.external_id));
      page += 1;
    }

    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
  });

  // ── 3.7 criteria are weights, never filters ─────────────────────────────

  it('still ranks the inventory when the preferred city holds none of it', async () => {
    await importFeed();
    const investor = await createInvestor({ preferred_city: 'Reykjavik' });

    const result = await matches(investor, { page: 1, page_size: 100 });

    expect(result.meta.total).toBe(410);
    expect(result.data).toHaveLength(100);
    // No property took the city weight, so nothing can exceed 60.
    for (const entry of result.data) expect(entry.score).toBeLessThanOrEqual(60);
  });

  // ── 3.8 a page past the end ─────────────────────────────────────────────

  it('answers a page beyond the last with an empty page and the real total', async () => {
    await importFeed();
    const investor = await createInvestor();

    const result = await matches(investor, { page: 99, page_size: 20 });

    expect(result.data).toEqual([]);
    // The window-function form would report 0 here: no rows, no total.
    expect(result.meta.total).toBe(410);
  });

  // ── 3.9 no preferred city ───────────────────────────────────────────────

  it('ranks for an investor with no preferred city without erasing any score', async () => {
    await importFeed();
    const investor = await createInvestor({}, true);

    const entries = await allMatches(investor);

    expect(entries).toHaveLength(410);
    for (const entry of entries) {
      // `city = NULL` is NULL, not false. Were that NULL to reach the sum it
      // would erase the ENTIRE score rather than cost 40 points.
      expect(entry.score).not.toBeNull();
      expect(Number.isFinite(entry.score)).toBe(true);
      expect(entry.score).toBeLessThanOrEqual(60);
    }
    // The ranking is still meaningful, not uniformly zero.
    expect(Math.max(...entries.map((entry) => entry.score))).toBeGreaterThan(0);
  });

  // ── 3.10 inclusive boundaries ───────────────────────────────────────────

  it('counts a criterion met exactly at its boundary as satisfied', async () => {
    await insertProperties([
      // Bedrooms equal to the minimum, area equal to the minimum, price equal
      // to the maximum: three off-by-one opportunities in one row.
      { external_id: 'EDGE', city: 'Houston', price: 300000, bedrooms: 3, square_feet: 1200 },
    ]);
    const investor = await createInvestor();

    // 40 + 30 + 15 + 10, with a zero bonus because the price sits on the
    // range boundary rather than the midpoint.
    expect(scoreOf(await allMatches(investor), 'EDGE')).toBe(95);
  });
});

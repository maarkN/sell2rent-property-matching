import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Pool } from 'pg';

import { AppModule } from '../../../src/app.module';
import { DATABASE_POOL } from '@infrastructure/database/pool';
import { Logger } from '@shared/utils/logger';
import { HttpExceptionFilter } from '@interfaces/filters/http-exception.filter';

const valid = {
  name: 'Jane Doe',
  min_price: 150000,
  max_price: 300000,
  preferred_city: 'Houston',
  min_bedrooms: 3,
  min_square_feet: 1200,
};

describe('investor profiles', () => {
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
    await pool.query('TRUNCATE investors RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an investor and returns 201 with the assigned identifier', async () => {
    const response = await request(app.getHttpServer()).post('/investors').send(valid);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ ...valid, id: expect.any(Number) });
  });

  it('accepts an investor with only the required criteria', async () => {
    const response = await request(app.getHttpServer())
      .post('/investors')
      .send({ name: 'Minimal', min_price: 0, max_price: 500000 });

    expect(response.status).toBe(201);
    // Defaults, not nulls: `bedrooms >= NULL` would erase a match score.
    expect(response.body).toMatchObject({
      preferred_city: null,
      min_bedrooms: 0,
      min_square_feet: 0,
    });
  });

  it.each([
    ['a blank name', { ...valid, name: '   ' }],
    ['a negative price', { ...valid, min_price: -1 }],
    ['a non-numeric price', { ...valid, min_price: 'lots' }],
    ['an inverted price range', { ...valid, min_price: 300000, max_price: 150000 }],
    ['an unknown field', { ...valid, min_bedroom: 3 }],
  ])('rejects %s with 400', async (_label, body) => {
    const response = await request(app.getHttpServer()).post('/investors').send(body);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      message: expect.any(String),
    });
  });

  it('stores nothing when a submission is rejected', async () => {
    await request(app.getHttpServer()).post('/investors').send({ ...valid, name: '' });

    const { rows } = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM investors',
    );
    expect(Number(rows[0]?.count)).toBe(0);
  });

  it('retrieves a stored investor with every criterion', async () => {
    const created = await request(app.getHttpServer()).post('/investors').send(valid);
    const id = (created.body as { id: number }).id;

    const response = await request(app.getHttpServer()).get(`/investors/${id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...valid, id });
  });

  it('answers 404 naming the identifier that was not found', async () => {
    const response = await request(app.getHttpServer()).get('/investors/99');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Investor with id 99 not found',
    });
  });

  it('answers 400 for a malformed identifier, not 404', async () => {
    // "fix your request" and "this does not exist" are different answers.
    const response = await request(app.getHttpServer()).get('/investors/abc');

    expect(response.status).toBe(400);
  });

  it('refuses an inverted price range written directly to storage', async () => {
    await expect(
      pool.query(
        `INSERT INTO investors (name, min_price, max_price)
         VALUES ('Direct', 300000, 150000)`,
      ),
    ).rejects.toThrow(/investors_price_range_ordered/);
  });
});

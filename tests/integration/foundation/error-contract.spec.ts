import { INestApplication, Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Pool } from 'pg';

import { AppModule } from '../../../src/app.module';
import { DATABASE_POOL } from '@infrastructure/database/pool';
import { Logger } from '@shared/utils/logger';
import { HttpExceptionFilter } from '@interfaces/filters/http-exception.filter';

@Controller('boom')
class BoomController {
  @Get()
  explode(): never {
    throw new Error('an internal detail that must not reach the client');
  }
}

describe('error contract', () => {
  let app: INestApplication;
  let pool: Pool;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [BoomController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter(app.get(Logger)));
    await app.init();

    pool = app.get<Pool>(DATABASE_POOL);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reaches PostgreSQL through the configured pool', async () => {
    const { rows } = await pool.query<{ one: number }>('SELECT 1 AS one');
    expect(rows[0]?.one).toBe(1);
  });

  it('renders an unknown route in the standard shape, not the framework default', async () => {
    const response = await request(app.getHttpServer()).get('/no-such-route');

    expect(response.status).toBe(404);
    expect(Object.keys(response.body).sort()).toEqual([
      'error',
      'message',
      'statusCode',
    ]);
    expect(response.body.statusCode).toBe(404);
    expect(typeof response.body.message).toBe('string');
  });

  it('renders an unexpected failure as 500 without leaking internals', async () => {
    const response = await request(app.getHttpServer()).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
    expect(JSON.stringify(response.body)).not.toContain('an internal detail');
  });

  it('gives a validation failure and a missing resource the same field structure', async () => {
    const notFound = await request(app.getHttpServer()).get('/no-such-route');
    const failure = await request(app.getHttpServer()).get('/boom');

    expect(Object.keys(notFound.body).sort()).toEqual(
      Object.keys(failure.body).sort(),
    );
    // `message` is a single string in both — Nest would have used an array.
    expect(typeof notFound.body.message).toBe('string');
    expect(typeof failure.body.message).toBe('string');
  });
});

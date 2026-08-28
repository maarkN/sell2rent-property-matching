import { ConfigService } from '@shared/config/config.service';

const valid = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/sell2rent',
  PORT: '3000',
  NODE_ENV: 'test',
  LOG_LEVEL: 'error',
  PROPERTIES_FEED_PATH: './data/properties.json',
} satisfies NodeJS.ProcessEnv;

describe('ConfigService', () => {
  it('parses a complete environment into typed values', () => {
    const config = new ConfigService(valid);

    expect(config.env.PORT).toBe(3000);
    expect(typeof config.env.PORT).toBe('number');
    expect(config.env.DATABASE_URL).toBe(valid.DATABASE_URL);
  });

  it('applies documented defaults for optional settings', () => {
    const config = new ConfigService({ DATABASE_URL: valid.DATABASE_URL });

    expect(config.env.PORT).toBe(3000);
    expect(config.env.LOG_LEVEL).toBe('info');
    expect(config.env.PROPERTIES_FEED_PATH).toBe('./data/properties.json');
  });

  it('refuses to start when a required setting is absent', () => {
    expect(() => new ConfigService({})).toThrow(/DATABASE_URL/);
  });

  it('names EVERY invalid setting at once, not only the first', () => {
    // The point of boot-time validation: one restart reveals the whole problem.
    let message = '';
    try {
      new ConfigService({ DATABASE_URL: 'mysql://nope', PORT: '70000' });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/DATABASE_URL/);
    expect(message).toMatch(/PORT/);
  });

  it('rejects a connection string that is not PostgreSQL', () => {
    expect(() => new ConfigService({ DATABASE_URL: 'mysql://host/db' })).toThrow(
      /PostgreSQL/,
    );
  });
});

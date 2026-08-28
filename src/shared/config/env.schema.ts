import { z } from 'zod';

/**
 * The environment contract, validated once at boot.
 *
 * A `process.env.X!` non-null assertion is a lie to the compiler: it type-checks
 * whether or not the variable exists. Parsing the whole environment up front
 * turns a missing setting into a refused startup that names the problem,
 * instead of an `undefined` that surfaces on some later request.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine((v) => v.startsWith('postgres'), {
      message: 'DATABASE_URL must be a PostgreSQL connection string',
    }),

  // Environment values are always text; coerce, then constrain.
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Configurable so integration tests can point at a fixture feed.
  PROPERTIES_FEED_PATH: z.string().min(1).default('./data/properties.json'),
});

/** Derived, never hand-written: the schema is the single source of truth. */
export type Env = z.infer<typeof EnvSchema>;

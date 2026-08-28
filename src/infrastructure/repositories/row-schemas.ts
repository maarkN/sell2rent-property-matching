import { z } from 'zod';

/**
 * Zod on the DATABASE boundary.
 *
 * `pool.query<T>()` is an ASSERTION, not a verification: `pg` checks nothing and
 * the compiler simply believes the declared type. Rename a column or change a
 * migration and `strict: true` catches none of it — you get `undefined` at
 * runtime in code the compiler swore was safe.
 *
 * Zod already guards HTTP input here; a database row is untrusted in the same
 * sense, so it gets the same treatment.
 */

/**
 * `NUMERIC` comes back from `pg` as a STRING, not a number.
 *
 * `pg` refuses to parse it into a JS number because the type is
 * arbitrary-precision and a float would lose data, so `price` arrives as
 * "443814.00". This is exactly the class of bug an unchecked generic hides:
 * you declare `price: number`, the compiler agrees, and at runtime you concatenate.
 */
const numericFromPg = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === 'string' ? Number(value) : value))
  .pipe(z.number().finite());

export const PropertyRowSchema = z.object({
  external_id: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  price: numericFromPg,
  bedrooms: z.number().int(),
  bathrooms: z.number().int(),
  square_feet: z.number().int(),
  lot_size: z.number().int(),
});

export type PropertyRow = z.infer<typeof PropertyRowSchema>;

export const InvestorRowSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
  min_price: numericFromPg,
  max_price: numericFromPg,
  preferred_city: z.string().min(1).nullable(),
  min_bedrooms: z.number().int(),
  min_square_feet: z.number().int(),
});

export type InvestorRow = z.infer<typeof InvestorRowSchema>;

/** `COUNT(*)` returns BIGINT, which `pg` also hands back as a string. */
export const CountRowSchema = z.object({
  count: numericFromPg.pipe(z.number().int()),
});

/**
 * The per-city aggregate. BOTH numeric columns arrive as strings.
 *
 * `COUNT(*)` is BIGINT and `ROUND(AVG(price), 2)` is NUMERIC, so without the
 * conversion here the endpoint would answer `"54"` and `"293296.06"` — valid
 * JSON, wrong types, and a defect no compiler catches because `pool.query<T>()
 * ` believed the annotation.
 */
export const CityInventoryRowSchema = z.object({
  city: z.string().min(1),
  property_count: numericFromPg.pipe(z.number().int()),
  average_price: numericFromPg,
});

export type CityInventoryRow = z.infer<typeof CityInventoryRowSchema>;

/**
 * Parse rows, failing loudly with the offending index.
 *
 * Deliberately not `safeParse` + skip: a malformed database row is a bug in our
 * own SQL, unlike a malformed FEED record, which is expected and gets collected
 * into `errors[]`. Different boundaries, different failure policies.
 */
export const parseRows = <S extends z.ZodTypeAny>(
  schema: S,
  rows: readonly unknown[],
): z.output<S>[] =>
  // Generic over the SCHEMA, not over a bare T. With `z.ZodType<T>` TypeScript
  // infers T from the schema's INPUT type, so a transforming schema leaks its
  // pre-transform union (`string | number`) to every caller.
  rows.map((row, index) => {
    const result = schema.safeParse(row);
    if (!result.success) {
      throw new Error(
        `Database row ${index} failed schema validation: ${result.error.message}`,
      );
    }
    return result.data;
  });

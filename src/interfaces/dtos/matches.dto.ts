import { z } from 'zod';

/** Documented in design.md Decision 6; restated here as the single enforcement point. */
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Bounds on the score's *reported* precision only.
 *
 * Four decimals, not two: measured across the dataset, two collapse distinct
 * scores in every investor profile tried — up to 41 of 190. Ordering never
 * sees this number.
 */
export const SCORE_DECIMALS = 4;

/**
 * Query parameters arrive as strings, so every numeric field is coerced.
 *
 * `z.coerce.number()` turns "abc" into NaN, which `.int()` then rejects — a
 * non-numeric page size is a 400 rather than a silent NaN reaching LIMIT.
 *
 * The maximum matters: `page_size` is caller-controlled, and without a ceiling
 * a single request can name a page large enough to pull the entire inventory
 * into memory, undoing the guarantee the spec states as a requirement.
 */
const pageSizeField = (name: string): z.ZodType<number | undefined> =>
  z.coerce
    .number()
    .int(`${name} must be an integer`)
    .min(1, `${name} must be at least 1`)
    .max(MAX_PAGE_SIZE, `${name} must not exceed ${MAX_PAGE_SIZE}`)
    .optional();

export const MatchesQuerySchema = z
  .object({
    page: z.coerce
      .number()
      .int('page must be an integer')
      .min(1, 'page must be at least 1')
      .default(DEFAULT_PAGE),

    // `limit` is the name the brief documents (`?page=1&limit=20`), so it is
    // the one that has to work. `page_size` is accepted as a synonym because
    // it reads better in the response, where `meta.page_size` reports it.
    // Rejecting `limit` — which an earlier revision did, via strict() — turned
    // the challenge's own example request into a 400.
    limit: pageSizeField('limit'),
    page_size: pageSizeField('page_size'),
  })
  // Unknown keys are still rejected: a typo like `page_siz` would otherwise
  // fall back to the default and be reported as a successful request for a
  // page the caller never asked for.
  .strict()
  .transform((query) => ({
    page: query.page,
    // `limit` wins when both are supplied; the brief's spelling is canonical.
    pageSize: query.limit ?? query.page_size ?? DEFAULT_PAGE_SIZE,
  }));

export type MatchesQueryDto = z.infer<typeof MatchesQuerySchema>;

export interface MatchResponse {
  readonly external_id: string;
  readonly city: string;
  readonly state: string;
  readonly price: number;
  readonly bedrooms: number;
  readonly bathrooms: number;
  readonly square_feet: number;
  readonly lot_size: number;
  readonly score: number;
}

/**
 * The one endpoint in this service with a shape of its own to define.
 *
 * `data` and `meta` are not the shared envelope the error contract forbids —
 * that rule bars wrapping shapes the brief specifies, and the brief specifies
 * none here. Pagination has to report a total somewhere, and this is where.
 * See design.md Decision 7.
 */
export interface MatchesResponse {
  readonly data: readonly MatchResponse[];
  readonly meta: {
    readonly page: number;
    readonly page_size: number;
    readonly total: number;
  };
}

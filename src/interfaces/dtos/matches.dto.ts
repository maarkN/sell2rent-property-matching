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
export const MatchesQuerySchema = z
  .object({
    page: z.coerce
      .number()
      .int('page must be an integer')
      .min(1, 'page must be at least 1')
      .default(DEFAULT_PAGE),
    page_size: z.coerce
      .number()
      .int('page_size must be an integer')
      .min(1, 'page_size must be at least 1')
      .max(MAX_PAGE_SIZE, `page_size must not exceed ${MAX_PAGE_SIZE}`)
      .default(DEFAULT_PAGE_SIZE),
  })
  // Rejects unknown keys for the same reason the investor body does: a typo
  // like `page_siz` would otherwise fall back to the default and be reported
  // as a successful request for a page the caller never asked for.
  .strict();

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

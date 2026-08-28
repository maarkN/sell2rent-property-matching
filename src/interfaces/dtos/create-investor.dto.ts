import { z } from 'zod';

/**
 * The schema is the single source of truth; the type is derived from it.
 *
 * NestJS conventionally validates through decorated classes, because a
 * TypeScript interface is erased at runtime. That makes the class both the
 * validator and the type — two definitions that can silently disagree
 * (`@IsInt() name: string` compiles fine). Deriving the type with `z.infer`
 * makes disagreement impossible.
 */
export const CreateInvestorSchema = z
  .object({
    name: z.string().trim().min(1, 'name must not be blank'),
    min_price: z.number().int('min_price must be an integer').nonnegative(),
    max_price: z.number().int('max_price must be an integer').nonnegative(),
    preferred_city: z.string().trim().min(1).optional(),
    min_bedrooms: z.number().int().nonnegative().default(0),
    min_square_feet: z.number().int().nonnegative().default(0),
  })
  // Rejects unknown keys, so a typo like `min_bedroom` is a 400 rather than a
  // criterion silently defaulting to 0 and skewing every future match.
  .strict()
  .refine((value) => value.max_price >= value.min_price, {
    path: ['max_price'],
    message: 'max_price must be greater than or equal to min_price',
  });

export type CreateInvestorDto = z.infer<typeof CreateInvestorSchema>;

/** The response shape, kept bare — no envelope. */
export interface InvestorResponse {
  readonly id: number;
  readonly name: string;
  readonly min_price: number;
  readonly max_price: number;
  readonly preferred_city: string | null;
  readonly min_bedrooms: number;
  readonly min_square_feet: number;
}

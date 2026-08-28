import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '@interfaces/pipes/zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const BodySchema = z.object({
    name: z.string().min(1),
    min_price: z.number().int().nonnegative(),
  });

  const QuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  });

  it('returns the parsed value for a valid payload', () => {
    const pipe = new ZodValidationPipe<z.infer<typeof BodySchema>>(BodySchema);

    expect(pipe.transform({ name: 'Jane', min_price: 150000 })).toEqual({
      name: 'Jane',
      min_price: 150000,
    });
  });

  it('throws a 400 naming the offending field', () => {
    const pipe = new ZodValidationPipe(BodySchema);

    expect(() => pipe.transform({ name: '', min_price: -1 })).toThrow(
      BadRequestException,
    );
    expect(() => pipe.transform({ min_price: 1 })).toThrow(/name/);
  });

  it('coerces query parameters, which always arrive as text', () => {
    const pipe = new ZodValidationPipe<z.infer<typeof QuerySchema>>(QuerySchema);

    // Copying the body pattern here is a common bug: z.number() would reject
    // "2" outright, because a query string has no numbers in it.
    expect(pipe.transform({ page: '2', limit: '50' })).toEqual({
      page: 2,
      limit: 50,
    });
  });

  it('applies defaults so the handler never sees an absent parameter', () => {
    const pipe = new ZodValidationPipe<z.infer<typeof QuerySchema>>(QuerySchema);

    expect(pipe.transform({})).toEqual({ page: 1, limit: 20 });
  });

  it('rejects a page size above the permitted maximum', () => {
    const pipe = new ZodValidationPipe(QuerySchema);

    // Without the ceiling, ?limit=999999 is a cheap denial of service.
    expect(() => pipe.transform({ limit: '999999' })).toThrow(BadRequestException);
  });
});

import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny } from 'zod';

/**
 * Bridges a Zod schema into Nest's pipe mechanism.
 *
 * Nest conventionally validates through classes carrying decorators, because a
 * TypeScript interface is erased at runtime and cannot be inspected. That makes
 * the class both the validator and the type — two sources that can silently
 * disagree (`@IsInt() name: string` compiles). With Zod the schema is the one
 * source and the type is derived from it, so disagreement is impossible.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const detail = result.error.issues
        .map((issue) => {
          const path = issue.path.join('.');
          return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join('; ');
      throw new BadRequestException(`Validation failed — ${detail}`);
    }

    // Returns the PARSED value, so coercions and defaults reach the handler.
    return result.data as T;
  }
}

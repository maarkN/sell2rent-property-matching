import { Injectable, Optional } from '@nestjs/common';
import { EnvSchema, type Env } from '@shared/config/env.schema';

/**
 * Typed access to a validated environment.
 *
 * There is deliberately no `get(key: string)` accessor, so a misspelled key
 * cannot compile.
 */
@Injectable()
export class ConfigService {
  public readonly env: Env;

  /**
   * `@Optional()` is load-bearing. Nest inspects constructor parameters and
   * would try to resolve this one as a provider — a default value does not
   * stop it. Marked optional, Nest passes `undefined`, which is exactly when
   * a TypeScript default applies. Production reads `process.env`; tests pass
   * an explicit environment.
   */
  constructor(@Optional() source: NodeJS.ProcessEnv = process.env) {
    const parsed = EnvSchema.safeParse(source);

    if (!parsed.success) {
      // Report every invalid setting at once. Surfacing them one restart at a
      // time is how a misconfigured environment takes four deploys to fix.
      const problems = parsed.error.issues
        .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('\n');
      throw new Error(`Invalid environment configuration:\n${problems}`);
    }

    this.env = parsed.data;
  }
}

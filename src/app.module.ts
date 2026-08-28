import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

import { ConfigService } from '@shared/config/config.service';
import { Logger } from '@shared/utils/logger';
import { DATABASE_POOL, createPool } from '@infrastructure/database/pool';

/**
 * THE COMPOSITION ROOT.
 *
 * The only place that binds a domain contract to an implementation, so nothing
 * else in the codebase needs to know what implements what. Swapping a
 * repository for an in-memory fake in a test module is editing a line here.
 *
 * The dependency rule holds throughout: interfaces -> application -> domain,
 * with infrastructure also pointing inward by implementing a contract the
 * domain declared. `src/domain` imports no framework, no driver, no Zod.
 */
@Module({
  controllers: [],
  providers: [
    ConfigService,
    Logger,
    {
      provide: DATABASE_POOL,
      // The pool depends on ConfigService, which has already validated the
      // environment — no `process.env` read survives past that boundary.
      useFactory: (config: ConfigService): Pool =>
        createPool(config.env.DATABASE_URL),
      inject: [ConfigService],
    },
  ],
  exports: [ConfigService, Logger, DATABASE_POOL],
})
export class AppModule implements OnModuleDestroy {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /**
   * Close the pool when the application shuts down.
   *
   * Nest does not know how to dispose a third-party resource, so without this
   * the process keeps open sockets: the service never exits cleanly on SIGTERM,
   * and test workers hang after the suite finishes.
   */
  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

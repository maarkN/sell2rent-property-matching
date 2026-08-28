import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { ConfigService } from '@shared/config/config.service';
import { Logger } from '@shared/utils/logger';
import { HttpExceptionFilter } from '@interfaces/filters/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(Logger);
  const config = app.get(ConfigService);

  // Registered globally so it also catches errors Nest raises before a
  // controller runs — an unknown route included.
  app.useGlobalFilters(new HttpExceptionFilter(logger));

  // Lets onModuleDestroy run on SIGTERM/SIGINT so the pool closes cleanly.
  app.enableShutdownHooks();

  await app.listen(config.env.PORT);
  logger.info('Service started', { port: config.env.PORT });
}

void bootstrap();

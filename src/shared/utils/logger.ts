import { Injectable } from '@nestjs/common';
import winston from 'winston';

/**
 * Structured metadata for a log line.
 *
 * `unknown` rather than `any`: the latter would spread through every call site
 * and silently defeat the strictness the project is graded on.
 */
export type LogMeta = Readonly<Record<string, unknown>>;

@Injectable()
export class Logger {
  private readonly logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env['LOG_LEVEL'] ?? 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      defaultMeta: { service: 'property-lead-matching-engine' },
      transports: [new winston.transports.Console()],
      silent: process.env['NODE_ENV'] === 'test',
    });
  }

  info(message: string, meta?: LogMeta): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: LogMeta): void {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: LogMeta): void {
    this.logger.debug(message, meta);
  }

  /**
   * Errors take a dedicated parameter rather than riding inside `meta`.
   *
   * `JSON.stringify(new Error('boom'))` is `{}` — message and stack are
   * non-enumerable — so an Error passed in a metadata bag logs nothing at all.
   * Unpacking it explicitly is the difference between a diagnostic and a blank.
   */
  error(message: string, error?: unknown, meta?: LogMeta): void {
    this.logger.error(message, {
      ...meta,
      ...(error instanceof Error
        ? { errorMessage: error.message, stack: error.stack }
        : error !== undefined
          ? { errorValue: String(error) }
          : {}),
    });
  }
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Logger } from '@shared/utils/logger';

/** The one error body the whole API returns. */
export interface ErrorResponseBody {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string;
}

/**
 * Renders every error in one shape — including errors Nest raises itself.
 *
 * This exists because per-handler error construction is precisely how response
 * consistency decays: the first handler that forgets diverges silently. It also
 * reconciles a specific mismatch — Nest's own `BadRequestException` serialises
 * `message` as an ARRAY, which is not the shape this API promises.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ErrorResponseBody = {
      statusCode: status,
      error: HttpExceptionFilter.labelFor(status),
      message: HttpExceptionFilter.messageFor(exception, status),
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Log the real cause before replacing it with a generic message.
      this.logger.error('Unhandled error while serving request', exception, {
        method: request.method,
        url: request.url,
      });
    }

    response.status(status).json(body);
  }

  private static labelFor(status: number): string {
    const name = HttpStatus[status];
    if (typeof name !== 'string') return 'Error';
    // INTERNAL_SERVER_ERROR -> Internal Server Error
    return name
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private static messageFor(exception: unknown, status: number): string {
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Never leak an internal message or stack to the client.
      return 'Internal server error';
    }

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();

      if (typeof payload === 'string') return payload;

      if (typeof payload === 'object' && payload !== null) {
        const { message } = payload as { message?: unknown };
        // Nest hands back an array for validation failures; flatten it.
        if (Array.isArray(message)) return message.map(String).join('; ');
        if (typeof message === 'string') return message;
      }

      return exception.message;
    }

    return 'Unexpected error';
  }
}

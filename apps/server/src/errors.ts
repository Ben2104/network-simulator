import type { FastifyError, FastifyInstance } from 'fastify';
import type { ApiError, ApiErrorCode } from '@netsim/shared';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const body = (code: ApiErrorCode, message: string): ApiError => ({ error: { code, message } });

/** Every error leaves the API as `{ error: { code, message } }`. */
export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError>((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send(body(err.code, err.message));
    }
    if (err.validation) {
      return reply.status(400).send(body('VALIDATION_ERROR', err.message));
    }
    const status = err.statusCode ?? 500;
    if (status >= 500) {
      req.log.error(err);
      return reply.status(500).send(body('INTERNAL_ERROR', 'Something went wrong.'));
    }
    return reply.status(status).send(body('VALIDATION_ERROR', err.message));
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send(body('NOT_FOUND', `Route ${req.method} ${req.url} not found`));
  });
}

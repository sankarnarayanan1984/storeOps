import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, InternalError, NotFoundError, ValidationError } from '../errors';

const isBodyParseError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { type?: unknown }).type === 'entity.parse.failed';

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (isBodyParseError(err)) return new ValidationError('Malformed JSON body');
  return new InternalError();
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError('Route', `${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const appError = toAppError(err);
  if (appError.statusCode >= 500) console.error(err);
  res.status(appError.statusCode).json({ error: appError.toJSON() });
};

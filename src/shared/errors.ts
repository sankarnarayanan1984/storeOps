/**
 * Typed error hierarchy. Services and routes throw only AppError subclasses;
 * the HTTP error handler maps them to responses via `code` and `statusCode`.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }

  toJSON(): { code: string; message: string; details?: unknown } {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details?: unknown, code = 'VALIDATION_ERROR') {
    super(code, message, 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super('NOT_FOUND', id ? `${resource} '${id}' not found` : `${resource} not found`, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Not allowed') {
    super('FORBIDDEN', message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT', details?: unknown) {
    super(code, message, 409, details);
  }
}

export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred') {
    super('INTERNAL_ERROR', message, 500);
  }
}

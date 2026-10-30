import { AppError, ConflictError, InternalError, NotFoundError, ValidationError } from '../../src/shared/errors';

describe('AppError hierarchy', () => {
  it.each([
    [new ValidationError(), 'VALIDATION_ERROR', 400],
    [new NotFoundError('Activity', 'act_1'), 'NOT_FOUND', 404],
    [new ConflictError('dup'), 'CONFLICT', 409],
    [new ConflictError('dup', 'ALREADY_ENROLLED'), 'ALREADY_ENROLLED', 409],
    [new InternalError(), 'INTERNAL_ERROR', 500],
  ])('%s has code %s and status %d', (error, code, statusCode) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.statusCode).toBe(statusCode);
    expect(error.name).toBe(error.constructor.name);
  });

  it('serialises details only when present', () => {
    expect(new ValidationError('bad').toJSON()).toEqual({ code: 'VALIDATION_ERROR', message: 'bad' });
    expect(new ValidationError('bad', [{ path: 'x' }]).toJSON()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'bad',
      details: [{ path: 'x' }],
    });
  });
});

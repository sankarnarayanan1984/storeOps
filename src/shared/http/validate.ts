import type { ZodType, ZodTypeDef } from 'zod';
import { ValidationError } from '../errors';

/** Parses untrusted input, converting schema failures into a ValidationError. */
export function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      'Request validation failed',
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

import type { Request, Response } from 'express';
import { UnauthorizedError } from '../../src/shared/errors';
import { bearerToken, currentUser } from '../../src/shared/http/auth';

const req = (authorization?: string) => ({ get: () => authorization }) as unknown as Request;

describe('shared/http/auth', () => {
  it('extracts a bearer token (case-insensitive scheme)', () => {
    expect(bearerToken(req('Bearer abc'))).toBe('abc');
    expect(bearerToken(req('bearer xyz'))).toBe('xyz');
  });

  it.each([undefined, '', 'Basic abc', 'Bearer', 'Bearer a b'])('rejects %p', (header) => {
    expect(() => bearerToken(req(header))).toThrow(UnauthorizedError);
  });

  it('currentUser throws when the route was not protected', () => {
    expect(() => currentUser({ locals: {} } as unknown as Response)).toThrow(UnauthorizedError);
  });
});

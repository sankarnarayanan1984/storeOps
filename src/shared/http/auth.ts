import type { Request, RequestHandler, Response } from 'express';
import { UnauthorizedError } from '../errors';

/** The signed-in caller, as seen by any module. Roles are plain strings so shared never depends on a module. */
export interface AuthUser {
  id: string;
  role: string;
  storeId: string;
  regionId: string;
}

export type Authenticate = (token: string) => Promise<AuthUser>;

export function bearerToken(req: Request): string {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '');
  if (!match?.[1]) throw new UnauthorizedError('Missing bearer token');
  return match[1];
}

/** Resolves the bearer token and stores the caller on `res.locals.user`. */
export function requireAuth(authenticate: Authenticate): RequestHandler {
  return async (req, res, next) => {
    const user = await authenticate(bearerToken(req));
    res.locals.user = { id: user.id, role: user.role, storeId: user.storeId, regionId: user.regionId } satisfies AuthUser;
    next();
  };
}

/** The caller set by `requireAuth`; throws if the route was not protected. */
export function currentUser(res: Response): AuthUser {
  const user = res.locals.user as AuthUser | undefined;
  if (!user) throw new UnauthorizedError();
  return user;
}

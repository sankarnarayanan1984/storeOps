import { Router } from 'express';
import { z } from 'zod';
import { bearerToken } from '../../shared/http/auth';
import { parse } from '../../shared/http/validate';
import type { StaffService } from './staff.service';
import { STAFF_ROLES } from './staff.types';

/** Optional free text: blank input clears the field. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

const email = z.string().trim().toLowerCase().email();
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);

const profile = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: optionalText(30),
  department: optionalText(80),
});

const listQuery = z.object({
  storeId: z.string().min(1).optional(),
  regionId: z.string().min(1).optional(),
  role: z.enum(STAFF_ROLES).optional(),
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

const registerBody = z.object({
  email,
  password,
  role: z.enum(STAFF_ROLES),
  storeId: z.string().trim().min(1),
  regionId: z.string().trim().min(1),
  profile,
});

const updateBody = z.object({
  email: email.optional(),
  role: z.enum(STAFF_ROLES).optional(),
  storeId: z.string().trim().min(1).optional(),
  regionId: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
  profile: profile.partial().optional(),
});

const loginBody = z.object({ email, password: z.string().min(1) });
const changePasswordBody = z.object({ currentPassword: z.string().min(1), newPassword: password });

export function createStaffRouter(service: StaffService): Router {
  const router = Router();

  // Authentication
  router.post('/auth/login', async (req, res) => {
    const { email: address, password: secret } = parse(loginBody, req.body);
    res.json(await service.login(address, secret));
  });

  router.post('/auth/logout', async (req, res) => {
    await service.logout(bearerToken(req));
    res.status(204).end();
  });

  // Own profile (requires a bearer token). Registered before '/:id' so 'me' is not read as an id.
  router.get('/me', async (req, res) => {
    res.json(await service.authenticate(bearerToken(req)));
  });

  router.patch('/me', async (req, res) => {
    const user = await service.authenticate(bearerToken(req));
    res.json(await service.updateProfile(user.id, parse(profile.partial(), req.body)));
  });

  router.post('/me/password', async (req, res) => {
    const token = bearerToken(req);
    const user = await service.authenticate(token);
    const { currentPassword, newPassword } = parse(changePasswordBody, req.body);
    await service.changePassword(user.id, currentPassword, newPassword, token);
    res.status(204).end();
  });

  // Staff management
  router.get('/', async (req, res) => {
    res.json({ data: await service.list(parse(listQuery, req.query)) });
  });

  router.post('/', async (req, res) => {
    res.status(201).json(await service.register(parse(registerBody, req.body)));
  });

  router.get('/:id', async (req, res) => {
    res.json(await service.getById(req.params.id));
  });

  router.patch('/:id', async (req, res) => {
    res.json(await service.update(req.params.id, parse(updateBody, req.body)));
  });

  return router;
}

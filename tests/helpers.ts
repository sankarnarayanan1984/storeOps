import request from 'supertest';
import type { Express } from 'express';

/** Password of every seeded staff account (see src/modules/staff/staff.seed.ts). */
export const SEED_PASSWORD = 'StoreOps@123';

/** Seeded staff, by role and store. */
export const STAFF = {
  priya: { id: 'stf_001', email: 'priya.nair@storeops.example' }, // STORE_MANAGER, store_001
  arun: { id: 'stf_002', email: 'arun.kumar@storeops.example' }, // ASSOCIATE, store_001
  meera: { id: 'stf_003', email: 'meera.iyer@storeops.example' }, // REGIONAL_MANAGER, store_002
  ravi: { id: 'stf_004', email: 'ravi.shah@storeops.example' }, // ASSOCIATE, store_003, inactive
  kavya: { id: 'stf_005', email: 'kavya.reddy@storeops.example' }, // DEPARTMENT_LEAD, store_001
  vikram: { id: 'stf_006', email: 'vikram.singh@storeops.example' }, // STORE_MANAGER, store_003
} as const;

/** Signs in and returns an `Authorization` header value. */
export async function login(app: Express, email: string, password = SEED_PASSWORD): Promise<string> {
  const res = await request(app).post('/api/staff/auth/login').send({ email, password }).expect(200);
  return `Bearer ${res.body.token.token as string}`;
}

export const validActivity = {
  title: 'Weekly cold-chain check',
  storeId: 'store_001',
  regionId: 'region_south',
  assigneeId: 'stf_002',
  category: 'RESTOCKING',
  dueAt: '2026-11-01T09:00:00.000Z',
};

export async function createActivity(
  app: Express,
  auth: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const res = await request(app)
    .post('/api/activities')
    .set('Authorization', auth)
    .send({ ...validActivity, ...overrides })
    .expect(201);
  return res.body as { id: string };
}

export async function setStatus(app: Express, auth: string, id: string, status: string): Promise<void> {
  await request(app).patch(`/api/activities/${id}`).set('Authorization', auth).send({ status }).expect(200);
}

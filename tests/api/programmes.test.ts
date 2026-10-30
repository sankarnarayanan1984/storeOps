import request from 'supertest';
import { createApp } from '../../src/app';
import type { DomainEvents } from '../../src/shared/events/domainEvents';
import { InMemoryEventBus } from '../../src/shared/events/eventBus';
import { programmesSeed } from '../../src/modules/programmes/programmes.seed';
import { login, STAFF } from '../helpers';

const newProgramme = {
  name: 'Back-to-school rollout',
  description: 'Stationery range and end-caps.',
  type: 'SEASONAL_ROLLOUT',
  startsOn: '2026-12-01',
  endsOn: '2027-01-31',
};

describe('Programmes API', () => {
  let app: ReturnType<typeof createApp>;
  let bus: InMemoryEventBus;
  let priya: string; // STORE_MANAGER, store_001
  let arun: string; // ASSOCIATE, store_001

  beforeEach(async () => {
    bus = new InMemoryEventBus();
    app = createApp({ eventBus: bus });
    priya = await login(app, STAFF.priya.email);
    arun = await login(app, STAFF.arun.email);
  });

  const capture = <K extends keyof DomainEvents>(name: K): DomainEvents[K][] => {
    const seen: DomainEvents[K][] = [];
    bus.subscribe(name, (event) => {
      seen.push(event);
    });
    return seen;
  };

  const addMember = (programmeId: string, auth: string, body: Record<string, unknown>) =>
    request(app).post(`/api/programmes/${programmeId}/members`).set('Authorization', auth).send(body);

  describe('GET /api/programmes (signed in)', () => {
    it("lists only the caller's store programmes, with member counts", async () => {
      const res = await request(app).get('/api/programmes').set('Authorization', priya).expect(200);
      expect(res.body.data.map((p: { id: string }) => p.id)).toEqual(['prg_001', 'prg_002']);
      const compliance = res.body.data.find((p: { id: string }) => p.id === 'prg_002');
      // prg_002 has Kavya (store_001) and Meera (store_002).
      expect(compliance).toMatchObject({ memberCount: 2, storeMemberCount: 1 });
      expect(compliance).not.toHaveProperty('members');
    });

    it('cannot be widened with ?storeId=', async () => {
      const res = await request(app).get('/api/programmes').set('Authorization', priya).query({ storeId: 'store_003' });
      expect(res.body.data.map((p: { id: string }) => p.id)).toEqual(['prg_001', 'prg_002']);
    });

    it('filters by type, status and staffId', async () => {
      const get = (query: Record<string, string>) =>
        request(app).get('/api/programmes').set('Authorization', priya).query(query).expect(200);
      expect((await get({ type: 'COMPLIANCE_DRIVE' })).body.data.map((p: { id: string }) => p.id)).toEqual(['prg_002']);
      expect((await get({ status: 'PLANNED' })).body.data).toEqual([]);
      expect((await get({ staffId: STAFF.arun.id })).body.data.map((p: { id: string }) => p.id)).toEqual(['prg_001']);
    });

    it('rejects unknown filter values', async () => {
      await request(app).get('/api/programmes').set('Authorization', priya).query({ type: 'REFIT' }).expect(400);
    });

    it.each([
      ['no token', undefined],
      ['a bad token', 'Bearer not-a-real-token'],
    ])('returns 401 with %s', async (_case, auth) => {
      const req = request(app).get('/api/programmes');
      const res = await (auth ? req.set('Authorization', auth) : req).expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/programmes (signed in)', () => {
    it("creates a PLANNED programme enrolled in the creator's store and publishes programme.created", async () => {
      const created = capture('programme.created');
      const res = await request(app).post('/api/programmes').set('Authorization', priya).send(newProgramme).expect(201);
      expect(res.body).toMatchObject({ ...newProgramme, status: 'PLANNED', enrolledStoreIds: ['store_001'], members: [] });
      expect(res.body.id).toMatch(/^prg_/);
      expect(created).toEqual([expect.objectContaining({ programmeId: res.body.id, type: 'SEASONAL_ROLLOUT', storeId: 'store_001' })]);
    });

    it('allows regional managers', async () => {
      const meera = await login(app, STAFF.meera.email);
      const res = await request(app).post('/api/programmes').set('Authorization', meera).send(newProgramme).expect(201);
      expect(res.body.enrolledStoreIds).toEqual(['store_002']);
    });

    it('forbids associates and department leads', async () => {
      const kavya = await login(app, STAFF.kavya.email);
      for (const auth of [arun, kavya]) {
        const res = await request(app).post('/api/programmes').set('Authorization', auth).send(newProgramme).expect(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
    });

    it('rejects endsOn before startsOn and invalid fields', async () => {
      const early = await request(app)
        .post('/api/programmes')
        .set('Authorization', priya)
        .send({ ...newProgramme, endsOn: '2026-11-01' })
        .expect(400);
      expect(early.body.error.details).toEqual([expect.objectContaining({ path: 'endsOn' })]);
      await request(app).post('/api/programmes').set('Authorization', priya).send({ name: '', type: 'X' }).expect(400);
    });

    it('requires sign-in', async () => {
      await request(app).post('/api/programmes').send(newProgramme).expect(401);
    });
  });

  describe('POST /api/programmes/:id/members (signed in)', () => {
    it("adds a member joined to staff data, defaulting the role to the staff member's role", async () => {
      const added = capture('programme.member_added');
      const res = await addMember('prg_001', priya, { staffId: STAFF.kavya.id }).expect(201);
      expect(res.body).toMatchObject({
        staffId: STAFF.kavya.id,
        role: 'DEPARTMENT_LEAD',
        staff: { id: STAFF.kavya.id, email: STAFF.kavya.email, role: 'DEPARTMENT_LEAD', storeId: 'store_001', active: true },
      });
      expect(res.body.staff).not.toHaveProperty('passwordHash');
      expect(added).toEqual([
        expect.objectContaining({ programmeId: 'prg_001', staffId: STAFF.kavya.id, role: 'DEPARTMENT_LEAD', storeId: 'store_001' }),
      ]);

      const programme = await request(app).get('/api/programmes/prg_001').expect(200);
      expect(programme.body.members.map((m: { staffId: string }) => m.staffId)).toContain(STAFF.kavya.id);
    });

    it('uses an explicit role when given', async () => {
      const res = await addMember('prg_001', priya, { staffId: STAFF.kavya.id, role: 'ASSOCIATE' }).expect(201);
      expect(res.body.role).toBe('ASSOCIATE');
    });

    it('requires an explicit role when the staff role is not a programme role', async () => {
      const meera = await login(app, STAFF.meera.email); // REGIONAL_MANAGER, store_002
      const missing = await addMember('prg_004', meera, { staffId: STAFF.meera.id }).expect(400);
      expect(missing.body.error.details).toEqual([expect.objectContaining({ path: 'role' })]);
      await addMember('prg_004', meera, { staffId: STAFF.meera.id, role: 'STORE_MANAGER' }).expect(201);
    });

    it('forbids associates', async () => {
      const res = await addMember('prg_001', arun, { staffId: STAFF.kavya.id }).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('forbids a store manager adding staff from another store', async () => {
      // prg_002 includes store_002, but Meera is not in Priya's store.
      await request(app).delete(`/api/programmes/prg_002/members/${STAFF.meera.id}`).expect(204);
      const res = await addMember('prg_002', priya, { staffId: STAFF.meera.id, role: 'STORE_MANAGER' }).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it("returns 404 for another store's programme", async () => {
      const vikram = await login(app, STAFF.vikram.email); // store_003
      const res = await addMember('prg_001', vikram, { staffId: STAFF.vikram.id }).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      await addMember('prg_999', priya, { staffId: STAFF.kavya.id }).expect(404);
    });

    it('rejects staff whose store is not enrolled (STORE_NOT_ENROLLED)', async () => {
      const meera = await login(app, STAFF.meera.email); // regional manager: not store-scoped
      const res = await addMember('prg_004', meera, { staffId: STAFF.priya.id }).expect(400);
      expect(res.body.error.code).toBe('STORE_NOT_ENROLLED');
    });

    it('rejects unknown and inactive staff', async () => {
      const vikram = await login(app, STAFF.vikram.email);
      const { body } = await request(app).post('/api/programmes').set('Authorization', vikram).send(newProgramme).expect(201);

      const unknown = await addMember(body.id as string, vikram, { staffId: 'stf_999' }).expect(400);
      expect(unknown.body.error.code).toBe('VALIDATION_ERROR');
      const inactive = await addMember(body.id as string, vikram, { staffId: STAFF.ravi.id }).expect(400);
      expect(inactive.body.error.message).toMatch(/inactive/);
    });

    it('rejects an existing member (MEMBER_EXISTS)', async () => {
      const res = await addMember('prg_001', priya, { staffId: STAFF.arun.id }).expect(409);
      expect(res.body.error.code).toBe('MEMBER_EXISTS');
    });

    it('rejects changes to a completed programme (PROGRAMME_COMPLETED)', async () => {
      const vikram = await login(app, STAFF.vikram.email);
      const res = await addMember('prg_003', vikram, { staffId: STAFF.ravi.id }).expect(409);
      expect(res.body.error.code).toBe('PROGRAMME_COMPLETED');
    });

    it('requires sign-in', async () => {
      await request(app).post('/api/programmes/prg_001/members').send({ staffId: STAFF.kavya.id }).expect(401);
    });
  });

  describe('open endpoints', () => {
    it('GET /:id returns members joined to staff, with staff: null for a missing record', async () => {
      const [first] = programmesSeed;
      const custom = createApp({
        programmeSeed: [{ ...first!, members: [...first!.members, { staffId: 'stf_gone', role: 'ASSOCIATE', addedAt: first!.createdAt }] }],
      });
      const res = await request(custom).get('/api/programmes/prg_001').expect(200);
      expect(res.body.members).toEqual([
        expect.objectContaining({ staffId: STAFF.priya.id, staff: expect.objectContaining({ email: STAFF.priya.email }) }),
        expect.objectContaining({ staffId: STAFF.arun.id }),
        expect.objectContaining({ staffId: 'stf_gone', staff: null }),
      ]);
    });

    it('GET /:id returns 404 for an unknown programme', async () => {
      await request(app).get('/api/programmes/prg_999').expect(404);
    });

    it('GET /:id/members filters by role', async () => {
      const res = await request(app).get('/api/programmes/prg_001/members').query({ role: 'ASSOCIATE' }).expect(200);
      expect(res.body.data.map((m: { staffId: string }) => m.staffId)).toEqual([STAFF.arun.id]);
      await request(app).get('/api/programmes/prg_001/members').query({ role: 'BOSS' }).expect(400);
    });

    it("PATCH /:id/members/:staffId changes a member's role", async () => {
      const res = await request(app).patch(`/api/programmes/prg_001/members/${STAFF.arun.id}`).send({ role: 'DEPARTMENT_LEAD' }).expect(200);
      expect(res.body).toMatchObject({ staffId: STAFF.arun.id, role: 'DEPARTMENT_LEAD', staff: expect.any(Object) });
      await request(app).patch('/api/programmes/prg_001/members/stf_999').send({ role: 'ASSOCIATE' }).expect(404);
    });

    it('DELETE /:id/members/:staffId removes a member and publishes programme.member_removed', async () => {
      const removed = capture('programme.member_removed');
      await request(app).delete(`/api/programmes/prg_001/members/${STAFF.arun.id}`).expect(204);
      const res = await request(app).get('/api/programmes/prg_001/members').expect(200);
      expect(res.body.data.map((m: { staffId: string }) => m.staffId)).toEqual([STAFF.priya.id]);
      expect(removed).toEqual([expect.objectContaining({ staffId: STAFF.arun.id, role: 'ASSOCIATE', storeId: 'store_001' })]);
    });

    it('DELETE rejects completed programmes and unknown members', async () => {
      const done = await request(app).delete(`/api/programmes/prg_003/members/${STAFF.vikram.id}`).expect(409);
      expect(done.body.error.code).toBe('PROGRAMME_COMPLETED');
      await request(app).delete('/api/programmes/prg_001/members/stf_999').expect(404);
    });

    it('POST /:id/enrolments enrols a store and publishes programme.store_enrolled', async () => {
      const enrolled = capture('programme.store_enrolled');
      const res = await request(app).post('/api/programmes/prg_004/enrolments').send({ storeId: 'store_001' }).expect(201);
      expect(res.body.enrolledStoreIds).toEqual(['store_002', 'store_001']);
      expect(enrolled).toEqual([expect.objectContaining({ programmeId: 'prg_004', storeId: 'store_001' })]);
    });

    it('POST /:id/enrolments rejects duplicates, unknown programmes and missing storeId', async () => {
      const dup = await request(app).post('/api/programmes/prg_001/enrolments').send({ storeId: 'store_001' }).expect(409);
      expect(dup.body.error.code).toBe('ALREADY_ENROLLED');
      await request(app).post('/api/programmes/prg_999/enrolments').send({ storeId: 'store_001' }).expect(404);
      await request(app).post('/api/programmes/prg_004/enrolments').send({}).expect(400);
    });
  });

  describe('UI pages', () => {
    it.each(['/programmes', '/programmes/prg_001'])('serves %s as HTML', async (path) => {
      await request(app).get(path).expect(200).expect('Content-Type', /html/);
    });
  });
});

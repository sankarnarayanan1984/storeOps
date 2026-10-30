import request from 'supertest';
import { createApp } from '../../src/app';
import { activitiesSeed } from '../../src/modules/activities/activities.seed';
import { createActivity, login, setStatus, STAFF, validActivity } from '../helpers';

describe('Activities API', () => {
  let app: ReturnType<typeof createApp>;
  let priya: string; // STORE_MANAGER, store_001
  let arun: string; // ASSOCIATE, store_001

  beforeEach(async () => {
    app = createApp({ activitySeed: [] });
    priya = await login(app, STAFF.priya.email);
    arun = await login(app, STAFF.arun.email);
  });

  describe('GET /api/activities', () => {
    it('returns the mock activities covering every category', async () => {
      const seeded = createApp();
      const res = await request(seeded).get('/api/activities').expect(200);
      expect(res.body.data).toHaveLength(activitiesSeed.length);
      expect(new Set((res.body.data as { category: string }[]).map((t) => t.category))).toEqual(
        new Set(['RESTOCKING', 'PLANOGRAM', 'AUDIT', 'COMPLIANCE', 'GENERAL']),
      );
    });

    it('filters by programme and status', async () => {
      const seeded = createApp();
      const res = await request(seeded).get('/api/activities').query({ programmeId: 'prg_001', status: 'IN_PROGRESS' });
      expect(res.body.data.map((t: { id: string }) => t.id)).toEqual(['tsk_002']);
    });

    it('filters by store, priority, category and assignee', async () => {
      await createActivity(app, priya);
      await createActivity(app, priya, { storeId: 'store_002', priority: 'HIGH', category: 'AUDIT', assigneeId: undefined });

      const byStore = await request(app).get('/api/activities').query({ storeId: 'store_002' }).expect(200);
      expect(byStore.body.data).toHaveLength(1);
      const byPriority = await request(app).get('/api/activities').query({ priority: 'HIGH', category: 'AUDIT' });
      expect(byPriority.body.data).toHaveLength(1);
      const byAssignee = await request(app).get('/api/activities').query({ assigneeId: STAFF.arun.id });
      expect(byAssignee.body.data).toHaveLength(1);
    });

    it('rejects an unknown status value', async () => {
      const res = await request(app).get('/api/activities').query({ status: 'planned' }).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('is also served at /api/tasks', async () => {
      await request(createApp()).get('/api/tasks').expect(200);
    });
  });

  describe('GET /api/activities/:id', () => {
    it('returns the activity', async () => {
      const res = await request(createApp()).get('/api/activities/tsk_003').expect(200);
      expect(res.body).toMatchObject({ id: 'tsk_003', status: 'BLOCKED', priority: 'CRITICAL', category: 'RESTOCKING' });
    });

    it('returns 404 NOT_FOUND for an unknown id', async () => {
      const res = await request(app).get('/api/activities/tsk_missing').expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/activities', () => {
    it('creates a TODO activity owned by the caller, with MEDIUM priority by default', async () => {
      const res = await request(app).post('/api/activities').set('Authorization', arun).send(validActivity).expect(201);
      expect(res.body).toMatchObject({ ...validActivity, status: 'TODO', priority: 'MEDIUM', createdBy: STAFF.arun.id });
      expect(res.body.id).toMatch(/^tsk_/);
    });

    it("defaults store and region to the caller's", async () => {
      const { storeId: _s, regionId: _r, ...body } = validActivity;
      const res = await request(app).post('/api/activities').set('Authorization', priya).send(body).expect(201);
      expect(res.body).toMatchObject({ storeId: 'store_001', regionId: 'region_south' });
    });

    it('requires sign-in', async () => {
      const res = await request(app).post('/api/activities').send(validActivity).expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects an invalid body with field details', async () => {
      const res = await request(app)
        .post('/api/activities')
        .set('Authorization', priya)
        .send({ title: '', category: 'CLEANING', dueAt: 'tomorrow' })
        .expect(400);
      const paths = res.body.error.details.map((d: { path: string }) => d.path);
      expect(paths).toEqual(expect.arrayContaining(['title', 'category', 'dueAt']));
    });

    it.each([
      ['unknown', 'stf_999'],
      ['inactive', STAFF.ravi.id],
    ])('rejects an %s assignee', async (_case, assigneeId) => {
      const res = await request(app)
        .post('/api/activities')
        .set('Authorization', priya)
        .send({ ...validActivity, assigneeId })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/activities/:id', () => {
    it('updates priority, category and assignee without changing status', async () => {
      const { id } = await createActivity(app, priya);
      const res = await request(app)
        .patch(`/api/activities/${id}`)
        .set('Authorization', arun)
        .send({ priority: 'CRITICAL', category: 'COMPLIANCE', assigneeId: STAFF.kavya.id })
        .expect(200);
      expect(res.body).toMatchObject({ priority: 'CRITICAL', category: 'COMPLIANCE', assigneeId: STAFF.kavya.id, status: 'TODO' });
    });

    it('unassigns with assigneeId: null', async () => {
      const { id } = await createActivity(app, priya);
      const res = await request(app).patch(`/api/activities/${id}`).set('Authorization', priya).send({ assigneeId: null });
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('assigneeId');
    });

    it('applies a valid status transition', async () => {
      const { id } = await createActivity(app, priya);
      await setStatus(app, priya, id, 'IN_PROGRESS');
      const res = await request(app).get(`/api/activities/${id}`).expect(200);
      expect(res.body.status).toBe('IN_PROGRESS');
    });

    it('returns 409 INVALID_STATUS_TRANSITION when reopening a DONE activity', async () => {
      const { id } = await createActivity(app, priya);
      await setStatus(app, priya, id, 'DONE');
      const res = await request(app).patch(`/api/activities/${id}`).set('Authorization', priya).send({ status: 'TODO' }).expect(409);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
      expect((await request(app).get(`/api/activities/${id}`)).body.status).toBe('DONE');
    });

    it('rejects an empty update', async () => {
      const { id } = await createActivity(app, priya);
      await request(app).patch(`/api/activities/${id}`).set('Authorization', priya).send({}).expect(400);
    });

    it('rejects an inactive assignee', async () => {
      const { id } = await createActivity(app, priya);
      await request(app).patch(`/api/activities/${id}`).set('Authorization', priya).send({ assigneeId: STAFF.ravi.id }).expect(400);
    });

    it('requires sign-in and returns 404 for an unknown id', async () => {
      await request(app).patch('/api/activities/tsk_001').send({ status: 'DONE' }).expect(401);
      await request(app).patch('/api/activities/tsk_missing').set('Authorization', priya).send({ status: 'DONE' }).expect(404);
    });
  });

  describe('DELETE /api/activities/:id', () => {
    it('lets the owner delete their activity', async () => {
      const { id } = await createActivity(app, arun);
      await request(app).delete(`/api/activities/${id}`).set('Authorization', arun).expect(204);
      await request(app).get(`/api/activities/${id}`).expect(404);
    });

    it("lets a store manager of the activity's store delete someone else's activity", async () => {
      const { id } = await createActivity(app, arun);
      await request(app).delete(`/api/activities/${id}`).set('Authorization', priya).expect(204);
    });

    it('forbids other staff, including store managers of another store', async () => {
      const { id } = await createActivity(app, priya);
      const kavya = await login(app, STAFF.kavya.email); // DEPARTMENT_LEAD, same store, not owner
      const vikram = await login(app, STAFF.vikram.email); // STORE_MANAGER, store_003

      for (const auth of [arun, kavya, vikram]) {
        const res = await request(app).delete(`/api/activities/${id}`).set('Authorization', auth).expect(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
      await request(app).get(`/api/activities/${id}`).expect(200);
    });

    it('requires sign-in and returns 404 for an unknown id', async () => {
      await request(app).delete('/api/activities/tsk_001').expect(401);
      await request(app).delete('/api/activities/tsk_missing').set('Authorization', priya).expect(404);
    });
  });

  describe('UI pages', () => {
    it.each(['/activities', '/activities/new', '/activities/tsk_001'])('serves %s as HTML', async (path) => {
      await request(app).get(path).expect(200).expect('Content-Type', /html/);
    });

    it('serves the stylesheet and redirects / to activities', async () => {
      await request(app).get('/styles.css').expect(200).expect('Content-Type', /css/);
      await request(app).get('/').expect(302).expect('Location', '/activities');
    });
  });
});

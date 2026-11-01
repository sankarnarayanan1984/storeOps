import request from 'supertest';
import { createApp } from '../../src/app';
import type { ActivityHandoverCompletedEvent, ActivityStatusChangedEvent } from '../../src/shared/events/domainEvents';
import { InMemoryEventBus } from '../../src/shared/events/eventBus';
import { createActivity, login, setStatus, STAFF } from '../helpers';

const STORE_003 = { storeId: 'store_003', regionId: 'region_north' };

interface ItemResult {
  id: string;
  outcome: string;
  from?: string;
  to?: string;
  error?: { code: string; message: string };
}

describe('Activities bulk status (shift handover)', () => {
  let app: ReturnType<typeof createApp>;
  let bus: InMemoryEventBus;
  let priya: string; // STORE_MANAGER, store_001
  let arun: string; // ASSOCIATE, store_001
  let meera: string; // REGIONAL_MANAGER, store_002, region_south
  let vikram: string; // STORE_MANAGER, store_003, region_north

  beforeEach(async () => {
    bus = new InMemoryEventBus();
    app = createApp({ activitySeed: [], eventBus: bus });
    priya = await login(app, STAFF.priya.email);
    arun = await login(app, STAFF.arun.email);
    meera = await login(app, STAFF.meera.email);
    vikram = await login(app, STAFF.vikram.email);
  });

  const statusOf = async (id: string): Promise<string> =>
    (await request(app).get(`/api/activities/${id}`).expect(200)).body.status as string;

  const auditOf = async (id: string, auth: string) =>
    (await request(app).get(`/api/activities/${id}/audit`).set('Authorization', auth).expect(200)).body.data as Record<
      string,
      unknown
    >[];

  describe('PATCH /api/activities/bulk-status', () => {
    it('S1-AC1 marks several own-store activities DONE in one request', async () => {
      const a1 = await createActivity(app, priya);
      const a2 = await createActivity(app, priya);
      await setStatus(app, priya, a2.id, 'IN_PROGRESS');

      const res = await request(app)
        .patch('/api/activities/bulk-status')
        .set('Authorization', arun)
        .send({ ids: [a1.id, a2.id], status: 'DONE', note: 'End of morning shift' })
        .expect(200);

      expect(res.body.status).toBe('DONE');
      expect(res.body.batchId).toMatch(/^hnd_/);
      expect(res.body.results).toEqual([
        { id: a1.id, outcome: 'UPDATED', from: 'TODO', to: 'DONE' },
        { id: a2.id, outcome: 'UPDATED', from: 'IN_PROGRESS', to: 'DONE' },
      ]);
      expect(res.body.summary).toEqual({ updated: 2, failed: 0 });
      expect(await statusOf(a1.id)).toBe('DONE');
      expect(await statusOf(a2.id)).toBe('DONE');
    });

    it('S1-AC2 processes each id independently so one bad id does not fail the others', async () => {
      const a1 = await createActivity(app, priya);
      const a3 = await createActivity(app, priya);
      const a4 = await createActivity(app, priya);
      await setStatus(app, priya, a3.id, 'DONE');
      await setStatus(app, priya, a4.id, 'BLOCKED');

      const res = await request(app)
        .patch('/api/activities/bulk-status')
        .set('Authorization', priya)
        .send({ ids: [a1.id, 'tsk_999', a3.id, a4.id], status: 'BLOCKED' })
        .expect(200);

      const results = res.body.results as ItemResult[];
      expect(results.map((r) => r.id)).toEqual([a1.id, 'tsk_999', a3.id, a4.id]);
      expect(results[0]).toEqual({ id: a1.id, outcome: 'UPDATED', from: 'TODO', to: 'BLOCKED' });
      expect(results[1]).toMatchObject({ outcome: 'FAILED', error: { code: 'NOT_FOUND' } });
      expect(results[2]).toMatchObject({ outcome: 'FAILED', error: { code: 'INVALID_STATUS_TRANSITION' } });
      expect(results[3]).toMatchObject({ outcome: 'FAILED', error: { code: 'INVALID_STATUS_TRANSITION' } });
      for (const failed of results.slice(1)) {
        expect(typeof failed.error?.message).toBe('string');
        expect(failed.error?.message.length).toBeGreaterThan(0);
      }
      expect(res.body.summary).toEqual({ updated: 1, failed: 3 });
      expect(await statusOf(a1.id)).toBe('BLOCKED');
      expect(await statusOf(a3.id)).toBe('DONE');
      expect(await statusOf(a4.id)).toBe('BLOCKED');
    });

    it("S1-AC3 reports FORBIDDEN per id for another store's activity", async () => {
      const b1 = await createActivity(app, vikram, { ...STORE_003, assigneeId: undefined });
      const a1 = await createActivity(app, priya);

      const res = await request(app)
        .patch('/api/activities/bulk-status')
        .set('Authorization', arun)
        .send({ ids: [b1.id, a1.id], status: 'DONE' })
        .expect(200);

      expect(res.body.results[0]).toMatchObject({ id: b1.id, outcome: 'FAILED', error: { code: 'FORBIDDEN' } });
      expect(res.body.results[1]).toEqual({ id: a1.id, outcome: 'UPDATED', from: 'TODO', to: 'DONE' });
      expect(res.body.summary).toEqual({ updated: 1, failed: 1 });
      expect(await statusOf(b1.id)).toBe('TODO');
      expect(await auditOf(b1.id, arun)).toEqual([]);
    });

    it("S1-AC4 lets a REGIONAL_MANAGER update any store in their region but not another region's", async () => {
      const a1 = await createActivity(app, priya);
      const b1 = await createActivity(app, vikram, { ...STORE_003, assigneeId: undefined });

      const res = await request(app)
        .patch('/api/activities/bulk-status')
        .set('Authorization', meera)
        .send({ ids: [a1.id, b1.id], status: 'DONE' })
        .expect(200);

      expect(res.body.results[0]).toEqual({ id: a1.id, outcome: 'UPDATED', from: 'TODO', to: 'DONE' });
      expect(res.body.results[1]).toMatchObject({ id: b1.id, outcome: 'FAILED', error: { code: 'FORBIDDEN' } });
      expect(res.body.summary).toEqual({ updated: 1, failed: 1 });
      expect(await statusOf(a1.id)).toBe('DONE');
      expect(await statusOf(b1.id)).toBe('TODO');
    });

    it('S1-AC5 rejects an invalid body as a whole with VALIDATION_ERROR', async () => {
      const a1 = await createActivity(app, priya);
      const bodies = [
        { ids: [], status: 'DONE' },
        { ids: [a1.id, a1.id], status: 'DONE' },
        { ids: Array.from({ length: 51 }, (_, i) => `tsk_${i}`), status: 'DONE' },
        { ids: [a1.id], status: 'TODO' },
        { ids: [a1.id], status: 'DONE', note: 'x'.repeat(501) },
      ];

      for (const body of bodies) {
        const res = await request(app).patch('/api/activities/bulk-status').set('Authorization', priya).send(body).expect(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
      expect(await statusOf(a1.id)).toBe('TODO');
      expect(await auditOf(a1.id, priya)).toEqual([]);
    });

    it('requires sign-in and is also served at /api/tasks', async () => {
      const a1 = await createActivity(app, priya);
      const unauth = await request(app).patch('/api/activities/bulk-status').send({ ids: [a1.id], status: 'DONE' }).expect(401);
      expect(unauth.body.error.code).toBe('UNAUTHORIZED');

      const res = await request(app)
        .patch('/api/tasks/bulk-status')
        .set('Authorization', priya)
        .send({ ids: [a1.id], status: 'DONE' })
        .expect(200);
      expect(res.body.summary).toEqual({ updated: 1, failed: 0 });
      expect(await statusOf(a1.id)).toBe('DONE');
    });
  });

  describe('GET /api/activities/:id/audit', () => {
    it('S1-AC6 writes one audit entry per updated task with a shared batch id and the staff-resolved actor name', async () => {
      const a1 = await createActivity(app, priya);
      const a2 = await createActivity(app, priya);
      await setStatus(app, priya, a2.id, 'IN_PROGRESS');

      const bulk = await request(app)
        .patch('/api/activities/bulk-status')
        .set('Authorization', arun)
        .send({ ids: [a1.id, a2.id, 'tsk_999'], status: 'BLOCKED', note: 'Stockroom locked' })
        .expect(200);

      const a1Audit = await auditOf(a1.id, arun);
      const a2Audit = await auditOf(a2.id, arun);
      expect(a1Audit).toHaveLength(1);
      expect(a2Audit).toHaveLength(1);
      expect(a1Audit[0]).toMatchObject({
        activityId: a1.id,
        from: 'TODO',
        to: 'BLOCKED',
        actorId: STAFF.arun.id,
        actorName: 'Arun Kumar',
        note: 'Stockroom locked',
        batchId: bulk.body.batchId,
      });
      expect(a2Audit[0]).toMatchObject({
        activityId: a2.id,
        from: 'IN_PROGRESS',
        to: 'BLOCKED',
        actorId: STAFF.arun.id,
        actorName: 'Arun Kumar',
        note: 'Stockroom locked',
        batchId: bulk.body.batchId,
      });
      for (const entry of [a1Audit[0]!, a2Audit[0]!]) {
        expect(typeof entry.id).toBe('string');
        expect(new Date(entry.createdAt as string).toISOString()).toBe(entry.createdAt);
      }
    });

    it('S1-AC7 returns NOT_FOUND for an unknown activity and 401 without a token', async () => {
      const res = await request(app).get('/api/activities/tsk_999/audit').set('Authorization', priya).expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toBe("Activity 'tsk_999' not found");

      const unauth = await request(app).get('/api/activities/tsk_999/audit').expect(401);
      expect(unauth.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('events', () => {
    it('S1-AC8 publishes status_changed per update and one handover_completed per request with store and programme groups', async () => {
      const a1 = await createActivity(app, priya, { programmeId: 'prg_001' });
      const a2 = await createActivity(app, priya);
      const a3 = await createActivity(app, priya);
      await setStatus(app, priya, a2.id, 'IN_PROGRESS');
      await setStatus(app, priya, a3.id, 'DONE');

      const changed: ActivityStatusChangedEvent[] = [];
      const handovers: ActivityHandoverCompletedEvent[] = [];
      bus.subscribe('activity.status_changed', (e) => {
        changed.push(e);
      });
      bus.subscribe('activity.handover_completed', (e) => {
        handovers.push(e);
      });

      const res = await request(app)
        .patch('/api/activities/bulk-status')
        .set('Authorization', arun)
        .send({ ids: [a1.id, a2.id, a3.id], status: 'DONE', note: 'Close' })
        .expect(200);

      expect(changed).toHaveLength(2);
      expect(changed[0]).toMatchObject({ activityId: a1.id, from: 'TODO', to: 'DONE', changedBy: STAFF.arun.id, storeId: 'store_001' });
      expect(changed[1]).toMatchObject({
        activityId: a2.id,
        from: 'IN_PROGRESS',
        to: 'DONE',
        changedBy: STAFF.arun.id,
        storeId: 'store_001',
      });
      expect(changed.some((e) => e.activityId === a3.id)).toBe(false);

      expect(handovers).toHaveLength(1);
      const [handover] = handovers;
      expect(handover).toMatchObject({
        batchId: res.body.batchId,
        completedBy: STAFF.arun.id,
        completedByName: 'Arun Kumar',
        note: 'Close',
        closedCount: 2,
        blockedCount: 0,
        stores: [{ storeId: 'store_001', regionId: 'region_south', closedCount: 2, blockedCount: 0, activityIds: [a1.id, a2.id] }],
        programmes: [{ programmeId: 'prg_001', storeId: 'store_001', closedCount: 1, blockedCount: 0, activityIds: [a1.id] }],
      });
      expect(new Date(handover!.occurredAt).toISOString()).toBe(handover!.occurredAt);

      const second = await request(app)
        .patch('/api/activities/bulk-status')
        .set('Authorization', arun)
        .send({ ids: [a3.id, 'tsk_999'], status: 'DONE' })
        .expect(200);
      expect(second.body.summary).toEqual({ updated: 0, failed: 2 });
      expect(changed).toHaveLength(2);
      expect(handovers).toHaveLength(1);
    });

    it('counts BLOCKED updates as blocked in store and programme groups', async () => {
      const a1 = await createActivity(app, priya, { programmeId: 'prg_002' });
      const handovers: ActivityHandoverCompletedEvent[] = [];
      bus.subscribe('activity.handover_completed', (e) => {
        handovers.push(e);
      });

      await request(app)
        .patch('/api/activities/bulk-status')
        .set('Authorization', priya)
        .send({ ids: [a1.id], status: 'BLOCKED' })
        .expect(200);

      expect(handovers[0]).toMatchObject({
        closedCount: 0,
        blockedCount: 1,
        stores: [{ storeId: 'store_001', closedCount: 0, blockedCount: 1 }],
        programmes: [{ programmeId: 'prg_002', closedCount: 0, blockedCount: 1 }],
      });
      expect(handovers[0]).not.toHaveProperty('note');
    });
  });
});

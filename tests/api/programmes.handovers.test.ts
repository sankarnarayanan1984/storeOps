import request from 'supertest';
import { createApp } from '../../src/app';
import { InMemoryEventBus } from '../../src/shared/events/eventBus';
import { createActivity, login, setStatus, STAFF } from '../helpers';

interface Handover {
  batchId: string;
  programmeId: string;
  storeId: string;
  closedCount: number;
  blockedCount: number;
  activityIds: string[];
  completedBy: string;
  completedByName: string;
  note?: string;
  occurredAt: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

describe('Programmes: handover history (activity.handover_completed)', () => {
  let app: ReturnType<typeof createApp>;
  let bus: InMemoryEventBus;
  let busErrors: unknown[];
  let priya: string; // STORE_MANAGER, store_001
  let arun: string; // ASSOCIATE, store_001
  let meera: string; // REGIONAL_MANAGER, store_002
  let vikram: string; // STORE_MANAGER, store_003

  beforeEach(async () => {
    busErrors = [];
    bus = new InMemoryEventBus((_name, error) => {
      busErrors.push(error);
    });
    app = createApp({ activitySeed: [], eventBus: bus });
    priya = await login(app, STAFF.priya.email);
    arun = await login(app, STAFF.arun.email);
    meera = await login(app, STAFF.meera.email);
    vikram = await login(app, STAFF.vikram.email);
  });

  const handovers = async (programmeId: string, auth: string): Promise<Handover[]> =>
    (await request(app).get(`/api/programmes/${programmeId}/handovers`).set('Authorization', auth).expect(200)).body
      .data as Handover[];

  const bulk = (auth: string, body: Record<string, unknown>) =>
    request(app).patch('/api/activities/bulk-status').set('Authorization', auth).send(body).expect(200);

  const programmeState = async (id: string) => {
    const { status, members, enrolledStoreIds } = (await request(app).get(`/api/programmes/${id}`).expect(200)).body as {
      status: string;
      members: unknown[];
      enrolledStoreIds: string[];
    };
    return { status, members, enrolledStoreIds };
  };

  describe('subscriber: recording handovers', () => {
    it('S4-AC1 bulk handover records programme history for programme tasks only', async () => {
      const a1 = await createActivity(app, arun, { programmeId: 'prg_001' });
      const a2 = await createActivity(app, arun, { programmeId: 'prg_001' });
      const a3 = await createActivity(app, arun);
      const before = await programmeState('prg_001');

      const res = await bulk(arun, { ids: [a1.id, a2.id, a3.id], status: 'DONE', note: 'Morning close' });
      expect(res.body.summary.updated).toBe(3);

      const list = await handovers('prg_001', arun);
      expect(list).toHaveLength(1);
      expect(list[0]).toEqual({
        batchId: res.body.batchId,
        programmeId: 'prg_001',
        storeId: 'store_001',
        closedCount: 2,
        blockedCount: 0,
        activityIds: [a1.id, a2.id],
        completedBy: 'stf_002',
        completedByName: 'Arun Kumar',
        note: 'Morning close',
        occurredAt: expect.stringMatching(ISO),
      });
      expect(await programmeState('prg_001')).toEqual(before);
    });

    it('S4-AC2 each programme sees only its own tasks from a mixed batch', async () => {
      const a1 = await createActivity(app, priya, { programmeId: 'prg_001' });
      const a4 = await createActivity(app, priya, { programmeId: 'prg_002' });
      await setStatus(app, priya, a4.id, 'IN_PROGRESS');

      const res = await bulk(priya, { ids: [a1.id, a4.id], status: 'BLOCKED' });
      const batchId = res.body.batchId as string;

      const prg1 = await handovers('prg_001', priya);
      expect(prg1).toHaveLength(1);
      expect(prg1[0]).toMatchObject({ batchId, closedCount: 0, blockedCount: 1, activityIds: [a1.id] });
      expect(prg1[0]).not.toHaveProperty('note');

      const prg2 = await handovers('prg_002', priya);
      expect(prg2).toHaveLength(1);
      expect(prg2[0]).toMatchObject({ batchId, closedCount: 0, blockedCount: 1, activityIds: [a4.id] });

      expect(await handovers('prg_004', meera)).toEqual([]);
    });

    it('S4-AC3 is event-bus driven and ignores unknown programme ids', async () => {
      await bus.publish('activity.handover_completed', {
        batchId: 'hnd_prg',
        completedBy: 'stf_003',
        completedByName: 'Meera Iyer',
        closedCount: 2,
        blockedCount: 1,
        stores: [{ storeId: 'store_002', regionId: 'region_south', closedCount: 2, blockedCount: 1, activityIds: ['x1', 'x2', 'x3'] }],
        programmes: [
          { programmeId: 'prg_004', storeId: 'store_002', closedCount: 1, blockedCount: 1, activityIds: ['x1', 'x2'] },
          { programmeId: 'prg_999', storeId: 'store_002', closedCount: 1, blockedCount: 0, activityIds: ['x3'] },
        ],
        occurredAt: new Date().toISOString(),
      });

      const prg4 = await handovers('prg_004', meera);
      expect(prg4).toHaveLength(1);
      expect(prg4[0]).toMatchObject({
        batchId: 'hnd_prg',
        storeId: 'store_002',
        closedCount: 1,
        blockedCount: 1,
        activityIds: ['x1', 'x2'],
        completedByName: 'Meera Iyer',
      });
      expect(await handovers('prg_002', meera)).toEqual([]);

      const missing = await request(app).get('/api/programmes/prg_999').expect(404);
      expect(missing.body.error.code).toBe('NOT_FOUND');
      expect(busErrors).toEqual([]);
    });
  });

  describe('GET /api/programmes/:id/handovers', () => {
    it('S4-AC4 hides other stores\' and unknown programmes, requires sign-in', async () => {
      const hidden = await request(app).get('/api/programmes/prg_001/handovers').set('Authorization', vikram).expect(404);
      expect(hidden.body.error.code).toBe('NOT_FOUND');

      const unknown = await request(app).get('/api/programmes/prg_999/handovers').set('Authorization', priya).expect(404);
      expect(unknown.body.error.code).toBe('NOT_FOUND');

      const anonymous = await request(app).get('/api/programmes/prg_001/handovers').expect(401);
      expect(anonymous.body.error.code).toBeDefined();

      expect(await handovers('prg_001', priya)).toEqual([]);
    });
  });
});

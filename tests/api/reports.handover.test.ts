import request from 'supertest';
import { createApp } from '../../src/app';
import { InMemoryEventBus } from '../../src/shared/events/eventBus';
import { createActivity, login, setStatus, STAFF } from '../helpers';

type Counters = Record<string, number>;

const ACTIVITY_FIELDS = ['activitiesTotal', 'activitiesCompleted', 'activitiesBlocked'] as const;
const ALL_FIELDS = [
  ...ACTIVITY_FIELDS,
  'programmesEnrolled',
  'handoversCompleted',
  'handoverTasksClosed',
  'handoverTasksBlocked',
] as const;

const delta = (before: Counters, after: Counters, fields: readonly string[]): Counters =>
  Object.fromEntries(fields.map((f) => [f, (after[f] ?? 0) - (before[f] ?? 0)]));

describe('Reports handover counters (activity.handover_completed)', () => {
  let app: ReturnType<typeof createApp>;
  let bus: InMemoryEventBus;
  let priya: string; // STORE_MANAGER, store_001
  let arun: string; // ASSOCIATE, store_001

  beforeEach(async () => {
    bus = new InMemoryEventBus();
    app = createApp({ activitySeed: [], eventBus: bus });
    priya = await login(app, STAFF.priya.email);
    arun = await login(app, STAFF.arun.email);
  });

  const metrics = async (scope: string, id: string): Promise<Counters> =>
    (await request(app).get(`/api/reports/metrics/${scope}/${id}`).expect(200)).body as Counters;

  describe('GET /api/reports/metrics/:scope/:id', () => {
    it('S3-AC1 a bulk handover bumps store and region handover counters without double counting', async () => {
      const a1 = await createActivity(app, priya);
      const a2 = await createActivity(app, priya);
      const a3 = await createActivity(app, priya);
      await setStatus(app, priya, a2.id, 'IN_PROGRESS');
      const storeBefore = await metrics('store', 'store_001');
      const regionBefore = await metrics('region', 'region_south');

      const done = await request(app)
        .patch('/api/activities/bulk-status')
        .set('Authorization', arun)
        .send({ ids: [a1.id, a2.id], status: 'DONE' })
        .expect(200);
      const blocked = await request(app)
        .patch('/api/activities/bulk-status')
        .set('Authorization', arun)
        .send({ ids: [a3.id], status: 'BLOCKED' })
        .expect(200);
      expect(done.body.summary).toEqual({ updated: 2, failed: 0 });
      expect(blocked.body.summary).toEqual({ updated: 1, failed: 0 });

      const expected = {
        handoversCompleted: 2,
        handoverTasksClosed: 2,
        handoverTasksBlocked: 1,
        activitiesCompleted: 2,
        activitiesBlocked: 1,
        activitiesTotal: 0,
      };
      const fields = Object.keys(expected);
      expect(delta(storeBefore, await metrics('store', 'store_001'), fields)).toEqual(expected);
      expect(delta(regionBefore, await metrics('region', 'region_south'), fields)).toEqual(expected);
    });

    it('S3-AC2 a multi-store handover event counts once per store and once per distinct region', async () => {
      const scopes = [
        ['store', 'store_001'],
        ['store', 'store_002'],
        ['store', 'store_003'],
        ['region', 'region_south'],
        ['region', 'region_north'],
      ] as const;
      const before = await Promise.all(scopes.map(([scope, id]) => metrics(scope, id)));

      await bus.publish('activity.handover_completed', {
        batchId: 'hnd_rpt',
        completedBy: 'stf_003',
        completedByName: 'Meera Iyer',
        closedCount: 4,
        blockedCount: 2,
        stores: [
          { storeId: 'store_001', regionId: 'region_south', closedCount: 2, blockedCount: 0, activityIds: ['x1', 'x2'] },
          { storeId: 'store_002', regionId: 'region_south', closedCount: 1, blockedCount: 1, activityIds: ['x3', 'x4'] },
          { storeId: 'store_003', regionId: 'region_north', closedCount: 1, blockedCount: 1, activityIds: ['x5', 'x6'] },
        ],
        programmes: [],
        occurredAt: new Date().toISOString(),
      });

      const after = await Promise.all(scopes.map(([scope, id]) => metrics(scope, id)));
      const deltas = scopes.map((_, i) => delta(before[i]!, after[i]!, ALL_FIELDS));
      const handover = (completed: number, closed: number, blocked: number) => ({
        handoversCompleted: completed,
        handoverTasksClosed: closed,
        handoverTasksBlocked: blocked,
        activitiesTotal: 0,
        activitiesCompleted: 0,
        activitiesBlocked: 0,
        programmesEnrolled: 0,
      });
      expect(deltas).toEqual([
        handover(1, 2, 0), // store_001
        handover(1, 1, 1), // store_002
        handover(1, 1, 1), // store_003
        handover(1, 3, 1), // region_south: one batch, summed counts
        handover(1, 1, 1), // region_north
      ]);
    });

    it('S3-AC3 an all-failed request changes nothing and unseen scopes report zero handover counters', async () => {
      const a3 = await createActivity(app, priya);
      await setStatus(app, priya, a3.id, 'DONE');
      const before = await metrics('store', 'store_001');

      const res = await request(app)
        .patch('/api/activities/bulk-status')
        .set('Authorization', arun)
        .send({ ids: [a3.id, 'tsk_999'], status: 'DONE' })
        .expect(200);
      expect(res.body.summary.updated).toBe(0);

      const after = await metrics('store', 'store_001');
      expect(delta(before, after, ALL_FIELDS)).toEqual(Object.fromEntries(ALL_FIELDS.map((f) => [f, 0])));

      expect(await metrics('store', 'store_999')).toEqual({
        scope: 'store',
        id: 'store_999',
        activitiesTotal: 0,
        activitiesCompleted: 0,
        activitiesBlocked: 0,
        programmesEnrolled: 0,
        handoversCompleted: 0,
        handoverTasksClosed: 0,
        handoverTasksBlocked: 0,
        completionRate: 0,
      });
    });
  });
});

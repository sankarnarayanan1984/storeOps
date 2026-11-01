import request from 'supertest';
import { createApp } from '../../src/app';
import { InMemoryEventBus } from '../../src/shared/events/eventBus';
import { createActivity, login, setStatus, STAFF } from '../helpers';

interface Alert {
  type: string;
  channel: string;
  status: string;
  storeId: string;
  sourceEvent: string;
  entityId: string;
  title: string;
  message: string;
  recipientId: string;
}

describe('Alerts: shift handover notifications (activity.handover_completed)', () => {
  let app: ReturnType<typeof createApp>;
  let bus: InMemoryEventBus;
  let priya: string; // STORE_MANAGER, store_001
  let arun: string; // ASSOCIATE, store_001
  let kavya: string; // DEPARTMENT_LEAD, store_001
  let vikram: string; // STORE_MANAGER, store_003

  beforeEach(async () => {
    bus = new InMemoryEventBus();
    app = createApp({ activitySeed: [], eventBus: bus });
    priya = await login(app, STAFF.priya.email);
    arun = await login(app, STAFF.arun.email);
    kavya = await login(app, STAFF.kavya.email);
    vikram = await login(app, STAFF.vikram.email);
  });

  const handoverAlerts = async (auth: string): Promise<Alert[]> =>
    (await request(app).get('/api/alerts?type=SHIFT_HANDOVER').set('Authorization', auth).expect(200)).body
      .data as Alert[];

  const bulk = (auth: string, body: Record<string, unknown>) =>
    request(app).patch('/api/activities/bulk-status').set('Authorization', auth).send(body).expect(200);

  it('S2-AC1 sends the store manager one SHIFT_HANDOVER summary naming the actor', async () => {
    const a1 = await createActivity(app, priya);
    const a2 = await createActivity(app, priya);
    await setStatus(app, priya, a2.id, 'IN_PROGRESS');

    const res = await bulk(arun, { ids: [a1.id, a2.id], status: 'BLOCKED' });
    expect(res.body.summary.updated).toBe(2);

    const alerts = await handoverAlerts(priya);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      type: 'SHIFT_HANDOVER',
      channel: 'IN_APP',
      status: 'UNREAD',
      storeId: 'store_001',
      sourceEvent: 'activity.handover_completed',
      entityId: res.body.batchId as string,
      title: 'Shift handover',
      message: 'Shift handover by Arun Kumar: 0 closed, 2 blocked',
      recipientId: STAFF.priya.id,
    });
    expect(await handoverAlerts(arun)).toEqual([]);
    expect(await handoverAlerts(kavya)).toEqual([]);
  });

  it('S2-AC2 reports closed and blocked counts for a DONE batch', async () => {
    const a1 = await createActivity(app, priya);
    const a2 = await createActivity(app, priya);
    const a3 = await createActivity(app, priya);
    await setStatus(app, priya, a2.id, 'IN_PROGRESS');
    await setStatus(app, priya, a3.id, 'BLOCKED');

    const res = await bulk(kavya, { ids: [a1.id, a2.id, a3.id], status: 'DONE', note: 'Evening close' });
    expect(res.body.summary.updated).toBe(3);

    const alerts = (await handoverAlerts(priya)).filter((a) => a.entityId === res.body.batchId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.message).toBe('Shift handover by Kavya Reddy: 3 closed, 0 blocked');
  });

  it("S2-AC3 notifies each store's manager with that store's counts, driven by the event bus", async () => {
    await bus.publish('activity.handover_completed', {
      batchId: 'hnd_test',
      completedBy: STAFF.meera.id,
      completedByName: 'Meera Iyer',
      closedCount: 3,
      blockedCount: 1,
      stores: [
        { storeId: 'store_001', regionId: 'region_south', closedCount: 2, blockedCount: 0, activityIds: ['x1', 'x2'] },
        { storeId: 'store_003', regionId: 'region_north', closedCount: 1, blockedCount: 1, activityIds: ['x3', 'x4'] },
      ],
      programmes: [],
      occurredAt: new Date().toISOString(),
    });

    const priyaAlerts = await handoverAlerts(priya);
    expect(priyaAlerts).toHaveLength(1);
    expect(priyaAlerts[0]).toMatchObject({
      entityId: 'hnd_test',
      storeId: 'store_001',
      message: 'Shift handover by Meera Iyer: 2 closed, 0 blocked',
    });

    const vikramAlerts = await handoverAlerts(vikram);
    expect(vikramAlerts).toHaveLength(1);
    expect(vikramAlerts[0]).toMatchObject({
      entityId: 'hnd_test',
      storeId: 'store_003',
      message: 'Shift handover by Meera Iyer: 1 closed, 1 blocked',
    });
  });

  it('S2-AC4 sends no handover notification when every id fails', async () => {
    const a3 = await createActivity(app, priya);
    await setStatus(app, priya, a3.id, 'DONE');
    const published: unknown[] = [];
    bus.subscribe('activity.handover_completed', (e) => {
      published.push(e);
    });

    const res = await bulk(arun, { ids: [a3.id, 'tsk_999'], status: 'DONE' });
    expect(res.body.summary).toEqual({ updated: 0, failed: 2 });

    expect(await handoverAlerts(priya)).toEqual([]);
    expect(published).toHaveLength(0);
  });

  it('S2-AC5 existing status_changed consumers react to bulk updates as to a single PATCH', async () => {
    const overrides = { category: 'RESTOCKING', priority: 'CRITICAL' };
    const a1 = await createActivity(app, priya, overrides);
    const a2 = await createActivity(app, priya, overrides);
    const metrics = async () =>
      (await request(app).get('/api/reports/metrics/store/store_001').expect(200)).body as Record<string, number>;

    const m0 = await metrics();
    await setStatus(app, priya, a1.id, 'BLOCKED');
    const m1 = await metrics();
    const res = await bulk(priya, { ids: [a2.id], status: 'BLOCKED' });
    const m2 = await metrics();

    expect(res.body.results).toEqual([expect.objectContaining({ id: a2.id, outcome: 'UPDATED' })]);

    const alerts = (await request(app).get('/api/alerts').set('Authorization', priya).expect(200)).body
      .data as Alert[];
    const single = alerts.find((a) => a.entityId === a1.id);
    const viaBulk = alerts.find((a) => a.entityId === a2.id);
    expect(single).toMatchObject({ type: 'INVENTORY', sourceEvent: 'activity.status_changed' });
    expect(viaBulk).toMatchObject({ type: 'INVENTORY', sourceEvent: 'activity.status_changed', entityId: a2.id });
    expect({ title: viaBulk?.title, storeId: viaBulk?.storeId }).toEqual({
      title: single?.title,
      storeId: single?.storeId,
    });
    expect(viaBulk?.message).toBe(single?.message.replace(a1.id, a2.id));

    for (const key of ['activitiesTotal', 'activitiesCompleted', 'activitiesBlocked']) {
      expect((m2[key] ?? 0) - (m1[key] ?? 0)).toBe((m1[key] ?? 0) - (m0[key] ?? 0));
    }
    expect((m2.activitiesBlocked ?? 0) - (m1.activitiesBlocked ?? 0)).toBe(1);
  });
});

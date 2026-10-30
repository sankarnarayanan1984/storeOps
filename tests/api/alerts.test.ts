import request from 'supertest';
import { createApp } from '../../src/app';
import { createActivity, login, setStatus, STAFF } from '../helpers';

interface NotificationBody {
  id: string;
  type: string;
  channel: string;
  status: string;
  recipientId: string;
  entityId: string;
}

describe('Alerts API', () => {
  let app: ReturnType<typeof createApp>;
  let priya: string; // STORE_MANAGER, store_001
  let arun: string; // ASSOCIATE, store_001

  beforeEach(async () => {
    app = createApp({ activitySeed: [] });
    priya = await login(app, STAFF.priya.email);
    arun = await login(app, STAFF.arun.email);
  });

  const alertsFor = async (auth: string, query: Record<string, string> = {}): Promise<NotificationBody[]> =>
    (await request(app).get('/api/alerts').set('Authorization', auth).query(query).expect(200)).body.data as NotificationBody[];

  it('requires sign-in', async () => {
    await request(app).get('/api/alerts').expect(401);
  });

  it('starts empty', async () => {
    expect(await alertsFor(priya)).toEqual([]);
  });

  it("raises an ESCALATION for the store's managers when an activity is blocked (via event bus)", async () => {
    const { id } = await createActivity(app, arun, { category: 'COMPLIANCE' });
    await setStatus(app, arun, id, 'BLOCKED');

    expect(await alertsFor(priya)).toEqual([
      expect.objectContaining({ type: 'ESCALATION', channel: 'IN_APP', status: 'UNREAD', recipientId: STAFF.priya.id, entityId: id }),
    ]);
    // Only the recipient sees it: the associate and a manager of another store get nothing.
    expect(await alertsFor(arun)).toEqual([]);
    expect(await alertsFor(await login(app, STAFF.vikram.email))).toEqual([]);
  });

  it('raises an INVENTORY alert when a restocking activity is blocked', async () => {
    const { id } = await createActivity(app, arun, { category: 'RESTOCKING' });
    await setStatus(app, arun, id, 'BLOCKED');
    expect(await alertsFor(priya, { type: 'INVENTORY' })).toHaveLength(1);
    expect(await alertsFor(priya, { type: 'ESCALATION' })).toHaveLength(0);
  });

  it('raises nothing for status changes other than BLOCKED', async () => {
    const { id } = await createActivity(app, arun);
    await setStatus(app, arun, id, 'IN_PROGRESS');
    await setStatus(app, arun, id, 'DONE');
    expect(await alertsFor(priya)).toEqual([]);
  });

  describe('POST /api/alerts/:id/read', () => {
    const raiseAlert = async (): Promise<string> => {
      const { id } = await createActivity(app, arun);
      await setStatus(app, arun, id, 'BLOCKED');
      const [alert] = await alertsFor(priya);
      return alert!.id;
    };

    it('marks the caller’s notification as read (idempotent)', async () => {
      const alertId = await raiseAlert();
      const res = await request(app).post(`/api/alerts/${alertId}/read`).set('Authorization', priya).expect(200);
      expect(res.body).toMatchObject({ status: 'READ', readAt: expect.any(String) });
      await request(app).post(`/api/alerts/${alertId}/read`).set('Authorization', priya).expect(200);
      expect(await alertsFor(priya, { status: 'UNREAD' })).toHaveLength(0);
    });

    it("returns 404 for someone else's notification", async () => {
      const alertId = await raiseAlert();
      await request(app).post(`/api/alerts/${alertId}/read`).set('Authorization', arun).expect(404);
    });

    it('returns 404 for an unknown notification', async () => {
      await request(app).post('/api/alerts/ntf_missing/read').set('Authorization', priya).expect(404);
    });
  });
});

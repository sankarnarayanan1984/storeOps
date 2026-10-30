import request from 'supertest';
import { createApp } from '../../src/app';
import { createActivity, login, setStatus, STAFF } from '../helpers';

describe('Reports API', () => {
  let app: ReturnType<typeof createApp>;
  let priya: string;

  beforeEach(async () => {
    app = createApp({ activitySeed: [] });
    priya = await login(app, STAFF.priya.email);
  });

  const metrics = async (scope: string, id: string) =>
    (await request(app).get(`/api/reports/metrics/${scope}/${id}`).expect(200)).body as Record<string, number>;

  it('returns zeroed metrics for a scope with no activity', async () => {
    expect(await metrics('store', 'store_042')).toEqual({
      scope: 'store',
      id: 'store_042',
      activitiesTotal: 0,
      activitiesCompleted: 0,
      activitiesBlocked: 0,
      programmesEnrolled: 0,
      completionRate: 0,
    });
  });

  it('builds store and region metrics from domain events', async () => {
    const a = await createActivity(app, priya);
    const b = await createActivity(app, priya);
    await createActivity(app, priya, { storeId: 'store_002' });
    await setStatus(app, priya, a.id, 'DONE');
    await setStatus(app, priya, b.id, 'BLOCKED');
    await request(app).post('/api/programmes/prg_004/enrolments').send({ storeId: 'store_001' }).expect(201);

    expect(await metrics('store', 'store_001')).toMatchObject({
      activitiesTotal: 2,
      activitiesCompleted: 1,
      activitiesBlocked: 1,
      programmesEnrolled: 1,
      completionRate: 0.5,
    });
    expect(await metrics('region', 'region_south')).toMatchObject({ activitiesTotal: 3, activitiesCompleted: 1, completionRate: 0.333 });
  });

  it('decrements blocked count when an activity is unblocked', async () => {
    const { id } = await createActivity(app, priya);
    await setStatus(app, priya, id, 'BLOCKED');
    await setStatus(app, priya, id, 'IN_PROGRESS');
    expect((await metrics('store', 'store_001')).activitiesBlocked).toBe(0);
  });

  it('removes deleted activities from the counts', async () => {
    const done = await createActivity(app, priya);
    const blocked = await createActivity(app, priya);
    await setStatus(app, priya, done.id, 'DONE');
    await setStatus(app, priya, blocked.id, 'BLOCKED');
    await request(app).delete(`/api/activities/${done.id}`).set('Authorization', priya).expect(204);
    await request(app).delete(`/api/activities/${blocked.id}`).set('Authorization', priya).expect(204);

    expect(await metrics('store', 'store_001')).toMatchObject({ activitiesTotal: 0, activitiesCompleted: 0, activitiesBlocked: 0 });
  });

  it("counts a new programme as an enrolment for the creator's store", async () => {
    await request(app)
      .post('/api/programmes')
      .set('Authorization', priya)
      .send({ name: 'Audit blitz', type: 'COMPLIANCE_DRIVE', startsOn: '2026-11-01', endsOn: '2026-11-30' })
      .expect(201);
    expect((await metrics('store', 'store_001')).programmesEnrolled).toBe(1);
  });

  it('rejects an unknown scope', async () => {
    const res = await request(app).get('/api/reports/metrics/country/in').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

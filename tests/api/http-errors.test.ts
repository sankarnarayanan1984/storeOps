import request from 'supertest';
import { createApp } from '../../src/app';

describe('HTTP error handling', () => {
  const app = createApp();

  it('returns a typed 404 for unknown routes', async () => {
    const res = await request(app).get('/api/unknown').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('maps malformed JSON to VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/activities')
      .set('Content-Type', 'application/json')
      .send('{"title":')
      .expect(400);
    expect(res.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'Malformed JSON body' });
  });
});

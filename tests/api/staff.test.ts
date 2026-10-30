import request from 'supertest';
import { createApp } from '../../src/app';
import { staffSeed } from '../../src/modules/staff/staff.seed';

const SEED_PASSWORD = 'StoreOps@123';

const newStaff = {
  email: 'Asha.Menon@StoreOps.example',
  password: 'correct-horse-1',
  role: 'DEPARTMENT_LEAD',
  storeId: 'store_002',
  regionId: 'region_south',
  profile: { firstName: 'Asha', lastName: 'Menon', department: 'Bakery' },
};

describe('Staff API', () => {
  let app: ReturnType<typeof createApp>;
  beforeEach(() => {
    app = createApp();
  });

  const login = async (email: string, password = SEED_PASSWORD): Promise<string> => {
    const res = await request(app).post('/api/staff/auth/login').send({ email, password }).expect(200);
    return res.body.token.token as string;
  };

  describe('GET /api/staff', () => {
    it('lists the mock staff without credentials', async () => {
      const res = await request(app).get('/api/staff').expect(200);
      expect(res.body.data).toHaveLength(staffSeed.length);
      for (const user of res.body.data) expect(user).not.toHaveProperty('passwordHash');
    });

    it('filters by role, store and active flag', async () => {
      const managers = await request(app).get('/api/staff').query({ role: 'STORE_MANAGER' }).expect(200);
      expect(managers.body.data.map((u: { id: string }) => u.id)).toEqual(['stf_001', 'stf_006']);

      const inactive = await request(app).get('/api/staff').query({ active: 'false' }).expect(200);
      expect(inactive.body.data.map((u: { id: string }) => u.id)).toEqual(['stf_004']);
    });

    it('rejects an unknown role', async () => {
      await request(app).get('/api/staff').query({ role: 'store_manager' }).expect(400);
    });
  });

  describe('GET /api/staff/:id', () => {
    it('returns a staff member with their profile', async () => {
      const res = await request(app).get('/api/staff/stf_001').expect(200);
      expect(res.body).toMatchObject({ id: 'stf_001', role: 'STORE_MANAGER', profile: { firstName: 'Priya' } });
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('returns 404 for an unknown staff member', async () => {
      const res = await request(app).get('/api/staff/stf_999').expect(404);
      expect(res.body.error).toEqual({ code: 'NOT_FOUND', message: "Staff 'stf_999' not found" });
    });
  });

  describe('POST /api/staff', () => {
    it('registers an active staff member and adds them to the list', async () => {
      const res = await request(app).post('/api/staff').send(newStaff).expect(201);
      expect(res.body).toMatchObject({ email: 'asha.menon@storeops.example', role: 'DEPARTMENT_LEAD', active: true });
      expect(res.body.id).toMatch(/^stf_/);
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('passwordHash');

      const list = await request(app).get('/api/staff').expect(200);
      expect(list.body.data).toHaveLength(staffSeed.length + 1);
    });

    it('lets the new staff member log in', async () => {
      await request(app).post('/api/staff').send(newStaff).expect(201);
      await login(newStaff.email, newStaff.password);
    });

    it('rejects a duplicate email (case-insensitive)', async () => {
      const res = await request(app)
        .post('/api/staff')
        .send({ ...newStaff, email: 'PRIYA.NAIR@storeops.example' })
        .expect(409);
      expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });

    it('validates role, password length and profile', async () => {
      const res = await request(app)
        .post('/api/staff')
        .send({ ...newStaff, role: 'CEO', password: 'short', profile: { firstName: '' } })
        .expect(400);
      const paths = res.body.error.details.map((d: { path: string }) => d.path);
      expect(paths).toEqual(expect.arrayContaining(['role', 'password', 'profile.firstName', 'profile.lastName']));
    });
  });

  describe('PATCH /api/staff/:id', () => {
    it('updates role and merges profile fields', async () => {
      const res = await request(app)
        .patch('/api/staff/stf_002')
        .send({ role: 'DEPARTMENT_LEAD', profile: { phone: '+91 90000 00002' } })
        .expect(200);
      expect(res.body).toMatchObject({
        role: 'DEPARTMENT_LEAD',
        profile: { firstName: 'Arun', department: 'Dairy & Chilled', phone: '+91 90000 00002' },
      });
    });

    it('clears an optional profile field when sent blank', async () => {
      const res = await request(app).patch('/api/staff/stf_001').send({ profile: { phone: '' } }).expect(200);
      expect(res.body.profile).not.toHaveProperty('phone');
    });

    it('deactivating a user revokes their sessions', async () => {
      const token = await login('arun.kumar@storeops.example');
      await request(app).patch('/api/staff/stf_002').send({ active: false }).expect(200);
      await request(app).get('/api/staff/me').set('Authorization', `Bearer ${token}`).expect(401);
    });

    it('returns 404 for an unknown staff member', async () => {
      await request(app).patch('/api/staff/stf_999').send({ role: 'ASSOCIATE' }).expect(404);
    });
  });

  describe('authentication', () => {
    it('logs in with valid credentials and returns a bearer token', async () => {
      const res = await request(app)
        .post('/api/staff/auth/login')
        .send({ email: 'priya.nair@storeops.example', password: SEED_PASSWORD })
        .expect(200);
      expect(res.body.token).toMatchObject({ tokenType: 'Bearer', userId: 'stf_001' });
      expect(res.body.user).toMatchObject({ id: 'stf_001', lastLoginAt: res.body.token.issuedAt });
    });

    it.each([
      ['wrong password', 'priya.nair@storeops.example', 'nope-nope'],
      ['unknown email', 'nobody@storeops.example', SEED_PASSWORD],
    ])('rejects %s with the same 401', async (_case, email, password) => {
      const res = await request(app).post('/api/staff/auth/login').send({ email, password }).expect(401);
      expect(res.body.error).toEqual({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
    });

    it('refuses inactive accounts', async () => {
      const res = await request(app)
        .post('/api/staff/auth/login')
        .send({ email: 'ravi.shah@storeops.example', password: SEED_PASSWORD })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('requires a token for /me', async () => {
      await request(app).get('/api/staff/me').expect(401);
      await request(app).get('/api/staff/me').set('Authorization', 'Bearer not-a-token').expect(401);
    });

    it('logout invalidates the token', async () => {
      const token = await login('priya.nair@storeops.example');
      await request(app).post('/api/staff/auth/logout').set('Authorization', `Bearer ${token}`).expect(204);
      await request(app).get('/api/staff/me').set('Authorization', `Bearer ${token}`).expect(401);
    });
  });

  describe('profile management (/me)', () => {
    it('returns and updates the signed-in user profile', async () => {
      const token = await login('kavya.reddy@storeops.example');
      const me = await request(app).get('/api/staff/me').set('Authorization', `Bearer ${token}`).expect(200);
      expect(me.body).toMatchObject({ id: 'stf_005', role: 'DEPARTMENT_LEAD' });

      const res = await request(app)
        .patch('/api/staff/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ department: 'Fruit & Veg', role: 'REGIONAL_MANAGER' })
        .expect(200);
      expect(res.body.profile.department).toBe('Fruit & Veg');
      expect(res.body.role).toBe('DEPARTMENT_LEAD'); // role is not self-editable
    });

    it('changes password and signs out other sessions', async () => {
      const current = await login('meera.iyer@storeops.example');
      const other = await login('meera.iyer@storeops.example');
      const auth = `Bearer ${current}`;

      await request(app)
        .post('/api/staff/me/password')
        .set('Authorization', auth)
        .send({ currentPassword: 'wrong', newPassword: 'new-secret-123' })
        .expect(401);
      await request(app)
        .post('/api/staff/me/password')
        .set('Authorization', auth)
        .send({ currentPassword: SEED_PASSWORD, newPassword: 'new-secret-123' })
        .expect(204);

      await request(app).get('/api/staff/me').set('Authorization', auth).expect(200);
      await request(app).get('/api/staff/me').set('Authorization', `Bearer ${other}`).expect(401);
      await login('meera.iyer@storeops.example', 'new-secret-123');
    });
  });

  describe('UI pages', () => {
    it.each(['/staff', '/staff/new', '/staff/stf_001/edit'])('serves %s as HTML', async (path) => {
      await request(app).get(path).expect(200).expect('Content-Type', /html/);
    });
  });
});

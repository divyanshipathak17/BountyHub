const request = require('supertest');
const { buildServer } = require('../../src/bootstrap');
const { createMemoryRepositories } = require('../../src/repositories/memory');

const config = { jwtSecret: 'test', jwtExpiresIn: '1h', starterTokens: 100, bcryptRounds: 4, corsOrigin: '*' };

describe('REST API', () => {
  let app;
  let student;
  let mentor;

  const register = async (body) => {
    const res = await request(app).post('/api/auth/register').send({ password: 'secret123', ...body });
    expect(res.status).toBe(201);
    return res.body;
  };

  beforeEach(async () => {
    ({ app } = buildServer({ repos: createMemoryRepositories(), config }));
    student = await register({ name: 'Asha', email: 'asha@x.com', role: 'student' });
    mentor = await register({ name: 'Ravi', email: 'ravi@x.com', role: 'mentor', skills: ['docker'] });
  });

  const auth = (who) => ({ Authorization: `Bearer ${who.token}` });
  const bountyBody = {
    title: 'Debug my Docker container', description: 'Exits with 137', tags: ['docker'],
    reward: 15, acceptWindowMinutes: 30, sessionMinutes: 120,
  };

  test('GET /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('login + /me', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'asha@x.com', password: 'secret123' });
    expect(login.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(me.body.user).toMatchObject({ email: 'asha@x.com', tokens: 100 });
  });

  test('protected routes require a token', async () => {
    expect((await request(app).get('/api/bounties')).status).toBe(401);
    expect((await request(app).get('/api/bounties').set('Authorization', 'Bearer junk')).status).toBe(401);
  });

  test('validation errors come back as 400 JSON', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  test('full lifecycle: post → feed → accept → room → message → complete', async () => {
    const created = await request(app).post('/api/bounties').set(auth(student)).send(bountyBody);
    expect(created.status).toBe(201);
    const id = created.body.bounty.id;

    const feed = await request(app).get('/api/bounties').set(auth(mentor));
    expect(feed.body.bounties).toHaveLength(1);
    expect(feed.body.bounties[0]).toMatchObject({ id, eligible: true });

    const accepted = await request(app).post(`/api/bounties/${id}/accept`).set(auth(mentor));
    expect(accepted.status).toBe(200);
    const roomId = accepted.body.room.id;

    const again = await request(app).post(`/api/bounties/${id}/accept`).set(auth(mentor));
    expect(again.status).toBe(409);

    const room = await request(app).get(`/api/rooms/${roomId}`).set(auth(student));
    expect(room.body.room).toMatchObject({ id: roomId, locked: false });

    const msg = await request(app).post(`/api/rooms/${roomId}/messages`).set(auth(student)).send({ text: 'hi' });
    expect(msg.status).toBe(201);

    const notes = await request(app).put(`/api/rooms/${roomId}/notes`).set(auth(mentor)).send({ notes: 'docker logs' });
    expect(notes.body.room.notes).toBe('docker logs');

    const done = await request(app).post(`/api/bounties/${id}/complete`).set(auth(student));
    expect(done.body.bounty.status).toBe('completed');

    const me = await request(app).get('/api/auth/me').set(auth(mentor));
    expect(me.body.user.tokens).toBe(15);

    const mine = await request(app).get('/api/bounties/mine').set(auth(student));
    expect(mine.body.bounties[0].status).toBe('completed');

    const single = await request(app).get(`/api/bounties/${id}`).set(auth(student));
    expect(single.body.bounty.id).toBe(id);
  });

  test('cancel refunds the student', async () => {
    const created = await request(app).post('/api/bounties').set(auth(student)).send(bountyBody);
    const res = await request(app).post(`/api/bounties/${created.body.bounty.id}/cancel`).set(auth(student));
    expect(res.body.bounty.status).toBe('cancelled');
    const me = await request(app).get('/api/auth/me').set(auth(student));
    expect(me.body.user.tokens).toBe(100);
  });

  test('unknown routes are 404 JSON', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
  });
});

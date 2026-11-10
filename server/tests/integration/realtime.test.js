/**
 * End-to-end WebSocket tests against a real HTTP + Socket.IO server
 * (in-memory repositories, ephemeral port).
 */
const request = require('supertest');
const { io: ioClient } = require('socket.io-client');
const { buildServer } = require('../../src/bootstrap');
const { createMemoryRepositories } = require('../../src/repositories/memory');

const config = { jwtSecret: 'test', jwtExpiresIn: '1h', starterTokens: 100, bcryptRounds: 4, corsOrigin: '*' };

function waitFor(socket, event, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    socket.once(event, (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

function expectNoEvent(socket, event, ms = 300) {
  return new Promise((resolve, reject) => {
    const handler = () => reject(new Error(`unexpected ${event}`));
    socket.once(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, ms);
  });
}

describe('Realtime (Socket.IO)', () => {
  let server;
  let url;
  let users;
  const sockets = [];

  const connect = (token) =>
    new Promise((resolve, reject) => {
      const s = ioClient(url, { auth: { token }, transports: ['websocket'], forceNew: true });
      sockets.push(s);
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });

  beforeEach(async () => {
    server = buildServer({ repos: createMemoryRepositories(), config });
    await new Promise((r) => server.httpServer.listen(0, r));
    url = `http://127.0.0.1:${server.httpServer.address().port}`;
    const reg = (b) => request(server.app).post('/api/auth/register').send({ password: 'secret123', ...b }).then((r) => r.body);
    users = {
      student: await reg({ name: 'Asha', email: 'a@x.com', role: 'student' }),
      docker1: await reg({ name: 'Ravi', email: 'r@x.com', role: 'mentor', skills: ['docker'] }),
      docker2: await reg({ name: 'Meera', email: 'm@x.com', role: 'mentor', skills: ['docker'] }),
      python: await reg({ name: 'Kabir', email: 'k@x.com', role: 'mentor', skills: ['python'] }),
    };
  });

  afterEach(async () => {
    sockets.splice(0).forEach((s) => s.close());
    await server.close();
  });

  const post = (who, path, body) =>
    request(server.app).post(path).set('Authorization', `Bearer ${who.token}`).send(body || {});

  test('connection without a valid token is rejected', async () => {
    await expect(connect('bad-token')).rejects.toThrow(/unauthorized/i);
  });

  test('eligible mentors receive a push when a bounty is posted; others do not', async () => {
    const m1 = await connect(users.docker1.token);
    const m2 = await connect(users.docker2.token);
    const py = await connect(users.python.token);

    const got1 = waitFor(m1, 'bounty:new');
    const got2 = waitFor(m2, 'bounty:new');
    const notPy = expectNoEvent(py, 'bounty:new');

    await post(users.student, '/api/bounties', {
      title: 'Docker help', description: 'd', tags: ['docker'], reward: 15, acceptWindowMinutes: 10, sessionMinutes: 60,
    });

    expect((await got1).title).toBe('Docker help');
    expect((await got2).reward).toBe(15);
    await notPy;
  });

  test('first mentor to accept wins; student is notified; others see bounty:taken', async () => {
    const st = await connect(users.student.token);
    const m1 = await connect(users.docker1.token);
    const m2 = await connect(users.docker2.token);

    const created = await post(users.student, '/api/bounties', {
      title: 'Docker help', description: 'd', tags: ['docker'], reward: 15, acceptWindowMinutes: 10, sessionMinutes: 60,
    });
    const id = created.body.bounty.id;

    const studentNotified = waitFor(st, 'bounty:accepted');
    const takenSeen = waitFor(m2, 'bounty:taken');

    const [a, b] = await Promise.all([post(users.docker1, `/api/bounties/${id}/accept`), post(users.docker2, `/api/bounties/${id}/accept`)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);

    const evt = await studentNotified;
    expect(evt.bountyId).toBe(id);
    expect(evt.roomId).toBeTruthy();
    expect((await takenSeen).bountyId).toBe(id);
  });

  test('participants chat in the room in real time; outsiders cannot join', async () => {
    const created = await post(users.student, '/api/bounties', {
      title: 'Docker help', description: 'd', tags: ['docker'], reward: 15, acceptWindowMinutes: 10, sessionMinutes: 60,
    });
    const acc = await post(users.docker1, `/api/bounties/${created.body.bounty.id}/accept`);
    const roomId = acc.body.room.id;

    const st = await connect(users.student.token);
    const m1 = await connect(users.docker1.token);
    const outsider = await connect(users.docker2.token);

    const joinSt = await st.emitWithAck('room:join', { roomId });
    const joinM = await m1.emitWithAck('room:join', { roomId });
    expect(joinSt.ok).toBe(true);
    expect(joinM.room.remainingSeconds).toBeGreaterThan(0);

    const denied = await outsider.emitWithAck('room:join', { roomId });
    expect(denied).toMatchObject({ ok: false, status: 403 });

    const incoming = waitFor(st, 'room:message');
    const ack = await m1.emitWithAck('room:message', { roomId, text: 'try docker logs' });
    expect(ack.ok).toBe(true);
    expect((await incoming).text).toBe('try docker logs');

    const notes = waitFor(m1, 'room:notes');
    await st.emitWithAck('room:notes', { roomId, notes: 'FROM node:20' });
    expect((await notes).notes).toBe('FROM node:20');
  });
});

/**
 * Repository contract tests.
 *
 * The same behavioural spec is executed against every repository
 * implementation (in-memory and MongoDB). If both pass, the services can
 * treat them as interchangeable.
 *
 * @param {string} label           name shown in the test report
 * @param {() => Promise<object>} setup  returns { users, bounties, rooms }
 * @param {() => Promise<void>} reset    clears all data between tests
 * @param {() => Promise<void>} [teardown]
 */
function runRepositoryContract(label, { setup, reset, teardown }) {
  describe(`Repository contract: ${label}`, () => {
    let repos;

    beforeAll(async () => {
      repos = await setup();
    });
    beforeEach(async () => {
      await reset();
    });
    afterAll(async () => {
      if (teardown) await teardown();
    });

    const student = () => ({
      name: 'Asha',
      email: 'asha@example.com',
      passwordHash: 'hash',
      role: 'student',
      skills: [],
      tokens: 100,
    });
    const mentor = (over = {}) => ({
      name: 'Ravi',
      email: 'ravi@example.com',
      passwordHash: 'hash',
      role: 'mentor',
      skills: ['docker', 'node'],
      tokens: 0,
      ...over,
    });

    describe('users', () => {
      test('create returns a user with a string id and normalised email', async () => {
        const u = await repos.users.create({ ...student(), email: 'ASHA@Example.com' });
        expect(typeof u.id).toBe('string');
        expect(u.email).toBe('asha@example.com');
        expect(u.tokens).toBe(100);
      });

      test('create rejects a duplicate email with code DUPLICATE', async () => {
        await repos.users.create(student());
        await expect(repos.users.create(student())).rejects.toMatchObject({ code: 'DUPLICATE' });
      });

      test('findByEmail / findById', async () => {
        const u = await repos.users.create(student());
        expect((await repos.users.findByEmail('ASHA@example.com')).id).toBe(u.id);
        expect((await repos.users.findById(u.id)).email).toBe('asha@example.com');
        expect(await repos.users.findById('000000000000000000000000')).toBeNull();
      });

      test('adjustTokens credits and debits, refusing to go negative', async () => {
        const u = await repos.users.create(student());
        expect((await repos.users.adjustTokens(u.id, -40)).tokens).toBe(60);
        expect(await repos.users.adjustTokens(u.id, -61)).toBeNull();
        expect((await repos.users.findById(u.id)).tokens).toBe(60);
        expect((await repos.users.adjustTokens(u.id, 15)).tokens).toBe(75);
      });

      test('findMentorsBySkills matches any overlapping skill (case-insensitive)', async () => {
        await repos.users.create(student());
        const m1 = await repos.users.create(mentor());
        await repos.users.create(mentor({ email: 'py@example.com', skills: ['python'] }));
        const found = await repos.users.findMentorsBySkills(['Docker']);
        expect(found.map((m) => m.id)).toEqual([m1.id]);
      });

      test('findMentorsBySkills with no tags returns every mentor', async () => {
        await repos.users.create(student());
        await repos.users.create(mentor());
        await repos.users.create(mentor({ email: 'py@example.com', skills: ['python'] }));
        expect(await repos.users.findMentorsBySkills([])).toHaveLength(2);
      });
    });

    describe('bounties', () => {
      const base = (postedBy, over = {}) => ({
        title: 'Debug my Docker container',
        description: 'Container exits with code 137',
        tags: ['docker'],
        reward: 15,
        sessionMinutes: 120,
        postedBy,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ...over,
      });

      test('create sets status open and returns string id', async () => {
        const s = await repos.users.create(student());
        const b = await repos.bounties.create(base(s.id));
        expect(b).toMatchObject({ status: 'open', reward: 15, postedBy: s.id, acceptedBy: null });
        expect(typeof b.id).toBe('string');
        expect(b.createdAt).toBeInstanceOf(Date);
      });

      test('claim succeeds once; second claim returns null (first mentor wins)', async () => {
        const s = await repos.users.create(student());
        const m1 = await repos.users.create(mentor());
        const m2 = await repos.users.create(mentor({ email: 'm2@example.com' }));
        const b = await repos.bounties.create(base(s.id));
        const now = new Date();
        const [r1, r2] = await Promise.all([
          repos.bounties.claim(b.id, m1.id, now),
          repos.bounties.claim(b.id, m2.id, now),
        ]);
        const winners = [r1, r2].filter(Boolean);
        expect(winners).toHaveLength(1);
        expect(winners[0].status).toBe('accepted');
        expect([m1.id, m2.id]).toContain(winners[0].acceptedBy);
      });

      test('claim fails on an expired bounty', async () => {
        const s = await repos.users.create(student());
        const m = await repos.users.create(mentor());
        const b = await repos.bounties.create(base(s.id, { expiresAt: new Date(Date.now() - 1000) }));
        expect(await repos.bounties.claim(b.id, m.id, new Date())).toBeNull();
      });

      test('transition only applies when current status matches', async () => {
        const s = await repos.users.create(student());
        const b = await repos.bounties.create(base(s.id));
        expect(await repos.bounties.transition(b.id, 'accepted', { status: 'completed' })).toBeNull();
        const c = await repos.bounties.transition(b.id, 'open', { status: 'cancelled' });
        expect(c.status).toBe('cancelled');
      });

      test('setRoom stores the room id', async () => {
        const s = await repos.users.create(student());
        const b = await repos.bounties.create(base(s.id));
        const roomId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
        const updated = await repos.bounties.setRoom(b.id, roomId);
        expect(updated.roomId).toBe(roomId);
      });

      test('list filters by status / postedBy / acceptedBy, newest first', async () => {
        const s = await repos.users.create(student());
        const m = await repos.users.create(mentor());
        const b1 = await repos.bounties.create(base(s.id, { title: 'first' }));
        await new Promise((r) => setTimeout(r, 5));
        const b2 = await repos.bounties.create(base(s.id, { title: 'second' }));
        await repos.bounties.claim(b1.id, m.id, new Date());

        expect((await repos.bounties.list({ postedBy: s.id })).map((b) => b.title)).toEqual(['second', 'first']);
        expect((await repos.bounties.list({ status: 'open' })).map((b) => b.id)).toEqual([b2.id]);
        expect((await repos.bounties.list({ acceptedBy: m.id })).map((b) => b.id)).toEqual([b1.id]);
      });

      test('findExpiredOpen returns open bounties past their deadline', async () => {
        const s = await repos.users.create(student());
        const old = await repos.bounties.create(base(s.id, { expiresAt: new Date(Date.now() - 1000) }));
        await repos.bounties.create(base(s.id));
        const expired = await repos.bounties.findExpiredOpen(new Date());
        expect(expired.map((b) => b.id)).toEqual([old.id]);
      });
    });

    describe('rooms', () => {
      const makeRoom = async () => {
        const s = await repos.users.create(student());
        const m = await repos.users.create(mentor());
        const b = await repos.bounties.create({
          title: 't', description: 'd', tags: [], reward: 5, sessionMinutes: 30,
          postedBy: s.id, expiresAt: new Date(Date.now() + 60000),
        });
        const room = await repos.rooms.create({
          bountyId: b.id,
          participants: [s.id, m.id],
          expiresAt: new Date(Date.now() + 30 * 60000),
        });
        return { s, m, b, room };
      };

      test('create returns an active room with no messages', async () => {
        const { room, s, m } = await makeRoom();
        expect(room).toMatchObject({ status: 'active', messages: [], notes: '' });
        expect(room.participants).toEqual([s.id, m.id]);
      });

      test('findById and findByBountyId', async () => {
        const { room, b } = await makeRoom();
        expect((await repos.rooms.findById(room.id)).id).toBe(room.id);
        expect((await repos.rooms.findByBountyId(b.id)).id).toBe(room.id);
      });

      test('addMessage appends and returns the stored message', async () => {
        const { room, s } = await makeRoom();
        const msg = await repos.rooms.addMessage(room.id, { sender: s.id, text: 'hi', sentAt: new Date() });
        expect(msg).toMatchObject({ sender: s.id, text: 'hi' });
        expect(typeof msg.id).toBe('string');
        expect((await repos.rooms.findById(room.id)).messages).toHaveLength(1);
      });

      test('updateNotes and close', async () => {
        const { room } = await makeRoom();
        expect((await repos.rooms.updateNotes(room.id, 'docker logs -f')).notes).toBe('docker logs -f');
        expect((await repos.rooms.close(room.id)).status).toBe('closed');
      });
    });
  });
}

module.exports = { runRepositoryContract };

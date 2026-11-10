const { createTestContext } = require('../helpers/context');

async function seed(ctx) {
  const reg = (input) => ctx.services.auth.register({ password: 'secret123', ...input }).then((r) => r.user);
  const student = await reg({ name: 'Asha', email: 'asha@x.com', role: 'student' });
  const dockerMentor = await reg({ name: 'Ravi', email: 'ravi@x.com', role: 'mentor', skills: ['docker'] });
  const dockerMentor2 = await reg({ name: 'Meera', email: 'meera@x.com', role: 'mentor', skills: ['docker', 'k8s'] });
  const pyMentor = await reg({ name: 'Kabir', email: 'kabir@x.com', role: 'mentor', skills: ['python'] });
  return { student, dockerMentor, dockerMentor2, pyMentor };
}

const dockerBounty = {
  title: 'Debug my Docker container',
  description: 'Need someone to help me debug my Docker container in the next 2 hours.',
  tags: ['Docker'],
  reward: 15,
  acceptWindowMinutes: 30,
  sessionMinutes: 120,
};

describe('BountyService', () => {
  let ctx;
  let u;
  beforeEach(async () => {
    ctx = createTestContext();
    u = await seed(ctx);
    ctx.notifier.clear();
  });

  describe('createBounty', () => {
    test('creates an open bounty and escrows the reward from the student', async () => {
      const b = await ctx.services.bounties.createBounty(u.student.id, dockerBounty);
      expect(b).toMatchObject({ status: 'open', reward: 15, tags: ['docker'], postedBy: u.student.id });
      expect(b.expiresAt).toEqual(new Date(ctx.clock.now().getTime() + 30 * 60000));
      expect((await ctx.repos.users.findById(u.student.id)).tokens).toBe(85);
    });

    test('pushes bounty:new only to mentors whose skills match', async () => {
      const b = await ctx.services.bounties.createBounty(u.student.id, dockerBounty);
      const [evt] = ctx.notifier.find('bounty:new');
      expect(evt.userIds.sort()).toEqual([u.dockerMentor.id, u.dockerMentor2.id].sort());
      expect(evt.payload.id).toBe(b.id);
    });

    test('rejects when the student cannot afford the reward', async () => {
      await expect(
        ctx.services.bounties.createBounty(u.student.id, { ...dockerBounty, reward: 101 }),
      ).rejects.toMatchObject({ status: 402 });
      expect((await ctx.repos.users.findById(u.student.id)).tokens).toBe(100);
    });

    test('only students can post bounties', async () => {
      await expect(ctx.services.bounties.createBounty(u.dockerMentor.id, dockerBounty)).rejects.toMatchObject({ status: 403 });
    });

    test.each([
      [{ title: '' }, /title/i],
      [{ reward: 0 }, /reward/i],
      [{ reward: 2.5 }, /reward/i],
      [{ sessionMinutes: 2 }, /session/i],
      [{ sessionMinutes: 600 }, /session/i],
      [{ acceptWindowMinutes: 0 }, /accept/i],
    ])('validates input %#', async (patch, msg) => {
      await expect(
        ctx.services.bounties.createBounty(u.student.id, { ...dockerBounty, ...patch }),
      ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(msg) });
    });
  });

  describe('acceptBounty', () => {
    let bounty;
    beforeEach(async () => {
      bounty = await ctx.services.bounties.createBounty(u.student.id, dockerBounty);
      ctx.notifier.clear();
    });

    test('first eligible mentor gets the bounty and a time-locked room', async () => {
      const { bounty: accepted, room } = await ctx.services.bounties.acceptBounty(u.dockerMentor.id, bounty.id);
      expect(accepted).toMatchObject({ status: 'accepted', acceptedBy: u.dockerMentor.id, roomId: room.id });
      expect(room.participants).toEqual([u.student.id, u.dockerMentor.id]);
      expect(room.expiresAt).toEqual(new Date(ctx.clock.now().getTime() + 120 * 60000));
    });

    test('notifies the student and tells all mentors the bounty is taken', async () => {
      const { room } = await ctx.services.bounties.acceptBounty(u.dockerMentor.id, bounty.id);
      const [accepted] = ctx.notifier.find('bounty:accepted');
      expect(accepted.userIds).toEqual([u.student.id]);
      expect(accepted.payload.roomId).toBe(room.id);
      const [taken] = ctx.notifier.find('bounty:taken');
      expect(taken).toMatchObject({ kind: 'role', role: 'mentor', payload: { bountyId: bounty.id } });
    });

    test('second mentor gets 409 Conflict', async () => {
      await ctx.services.bounties.acceptBounty(u.dockerMentor.id, bounty.id);
      await expect(ctx.services.bounties.acceptBounty(u.dockerMentor2.id, bounty.id)).rejects.toMatchObject({ status: 409 });
    });

    test('concurrent accepts: exactly one wins', async () => {
      const results = await Promise.allSettled([
        ctx.services.bounties.acceptBounty(u.dockerMentor.id, bounty.id),
        ctx.services.bounties.acceptBounty(u.dockerMentor2.id, bounty.id),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')[0].reason.status).toBe(409);
    });

    test('ineligible mentor (no matching skill) is refused with 403', async () => {
      await expect(ctx.services.bounties.acceptBounty(u.pyMentor.id, bounty.id)).rejects.toMatchObject({ status: 403 });
    });

    test('students cannot accept bounties', async () => {
      await expect(ctx.services.bounties.acceptBounty(u.student.id, bounty.id)).rejects.toMatchObject({ status: 403 });
    });

    test('cannot accept after the accept window closes', async () => {
      ctx.clock.advanceMinutes(31);
      await expect(ctx.services.bounties.acceptBounty(u.dockerMentor.id, bounty.id)).rejects.toMatchObject({ status: 409 });
    });

    test('unknown bounty is 404', async () => {
      await expect(ctx.services.bounties.acceptBounty(u.dockerMentor.id, 'nope')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('completeBounty', () => {
    test('student completes: mentor is paid and room closes', async () => {
      const b = await ctx.services.bounties.createBounty(u.student.id, dockerBounty);
      const { room } = await ctx.services.bounties.acceptBounty(u.dockerMentor.id, b.id);
      const done = await ctx.services.bounties.completeBounty(u.student.id, b.id);
      expect(done.status).toBe('completed');
      expect((await ctx.repos.users.findById(u.dockerMentor.id)).tokens).toBe(15);
      expect((await ctx.repos.rooms.findById(room.id)).status).toBe('closed');
      expect(ctx.notifier.find('bounty:completed')[0].userIds).toEqual([u.dockerMentor.id]);
    });

    test('only the poster can complete, and only an accepted bounty', async () => {
      const b = await ctx.services.bounties.createBounty(u.student.id, dockerBounty);
      await expect(ctx.services.bounties.completeBounty(u.student.id, b.id)).rejects.toMatchObject({ status: 409 });
      await ctx.services.bounties.acceptBounty(u.dockerMentor.id, b.id);
      await expect(ctx.services.bounties.completeBounty(u.dockerMentor.id, b.id)).rejects.toMatchObject({ status: 403 });
    });

    test('completing twice pays only once', async () => {
      const b = await ctx.services.bounties.createBounty(u.student.id, dockerBounty);
      await ctx.services.bounties.acceptBounty(u.dockerMentor.id, b.id);
      await ctx.services.bounties.completeBounty(u.student.id, b.id);
      await expect(ctx.services.bounties.completeBounty(u.student.id, b.id)).rejects.toMatchObject({ status: 409 });
      expect((await ctx.repos.users.findById(u.dockerMentor.id)).tokens).toBe(15);
    });
  });

  describe('cancelBounty', () => {
    test('poster cancels an open bounty and is refunded', async () => {
      const b = await ctx.services.bounties.createBounty(u.student.id, dockerBounty);
      const c = await ctx.services.bounties.cancelBounty(u.student.id, b.id);
      expect(c.status).toBe('cancelled');
      expect((await ctx.repos.users.findById(u.student.id)).tokens).toBe(100);
      expect(ctx.notifier.find('bounty:taken')[0].payload).toMatchObject({ bountyId: b.id, reason: 'cancelled' });
    });

    test('cannot cancel once accepted', async () => {
      const b = await ctx.services.bounties.createBounty(u.student.id, dockerBounty);
      await ctx.services.bounties.acceptBounty(u.dockerMentor.id, b.id);
      await expect(ctx.services.bounties.cancelBounty(u.student.id, b.id)).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('expireStale', () => {
    test('expires open bounties past the window and refunds the student', async () => {
      const b = await ctx.services.bounties.createBounty(u.student.id, dockerBounty);
      ctx.clock.advanceMinutes(31);
      const n = await ctx.services.bounties.expireStale();
      expect(n).toBe(1);
      expect((await ctx.repos.bounties.findById(b.id)).status).toBe('expired');
      expect((await ctx.repos.users.findById(u.student.id)).tokens).toBe(100);
      expect(ctx.notifier.find('bounty:expired')[0].userIds).toEqual([u.student.id]);
    });

    test('does nothing before the window closes', async () => {
      await ctx.services.bounties.createBounty(u.student.id, dockerBounty);
      expect(await ctx.services.bounties.expireStale()).toBe(0);
    });
  });

  describe('listing', () => {
    test('open feed for a mentor flags eligibility', async () => {
      await ctx.services.bounties.createBounty(u.student.id, dockerBounty);
      const feed = await ctx.services.bounties.listOpen(u.pyMentor.id);
      expect(feed).toHaveLength(1);
      expect(feed[0].eligible).toBe(false);
      const feed2 = await ctx.services.bounties.listOpen(u.dockerMentor.id);
      expect(feed2[0].eligible).toBe(true);
    });

    test('open feed hides bounties whose window has passed', async () => {
      await ctx.services.bounties.createBounty(u.student.id, dockerBounty);
      ctx.clock.advanceMinutes(31);
      expect(await ctx.services.bounties.listOpen(u.dockerMentor.id)).toHaveLength(0);
    });

    test('listMine returns posted bounties for students and accepted ones for mentors', async () => {
      const b = await ctx.services.bounties.createBounty(u.student.id, dockerBounty);
      await ctx.services.bounties.acceptBounty(u.dockerMentor.id, b.id);
      expect((await ctx.services.bounties.listMine(u.student.id)).map((x) => x.id)).toEqual([b.id]);
      expect((await ctx.services.bounties.listMine(u.dockerMentor.id)).map((x) => x.id)).toEqual([b.id]);
      expect(await ctx.services.bounties.listMine(u.dockerMentor2.id)).toEqual([]);
    });
  });
});

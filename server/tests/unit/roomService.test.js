const { createTestContext } = require('../helpers/context');

describe('RoomService (time-locked workspace)', () => {
  let ctx;
  let student;
  let mentor;
  let outsider;
  let room;

  beforeEach(async () => {
    ctx = createTestContext();
    const reg = (i) => ctx.services.auth.register({ password: 'secret123', ...i }).then((r) => r.user);
    student = await reg({ name: 'Asha', email: 'a@x.com', role: 'student' });
    mentor = await reg({ name: 'Ravi', email: 'r@x.com', role: 'mentor', skills: ['docker'] });
    outsider = await reg({ name: 'Eve', email: 'e@x.com', role: 'mentor', skills: ['docker'] });
    const b = await ctx.services.bounties.createBounty(student.id, {
      title: 'Docker help', description: 'd', tags: ['docker'], reward: 10, acceptWindowMinutes: 10, sessionMinutes: 60,
    });
    ({ room } = await ctx.services.bounties.acceptBounty(mentor.id, b.id));
    ctx.notifier.clear();
  });

  test('participants can open the room and see time remaining', async () => {
    const r = await ctx.services.rooms.getRoom(student.id, room.id);
    expect(r.locked).toBe(false);
    expect(r.remainingSeconds).toBe(3600);
    expect(r.bounty.title).toBe('Docker help');
    expect(r.participantsInfo.map((p) => p.name).sort()).toEqual(['Asha', 'Ravi']);
  });

  test('non-participants are refused with 403', async () => {
    await expect(ctx.services.rooms.getRoom(outsider.id, room.id)).rejects.toMatchObject({ status: 403 });
    await expect(ctx.services.rooms.postMessage(outsider.id, room.id, 'hi')).rejects.toMatchObject({ status: 403 });
  });

  test('postMessage stores and broadcasts to the room', async () => {
    const msg = await ctx.services.rooms.postMessage(mentor.id, room.id, '  run docker logs  ');
    expect(msg).toMatchObject({ sender: mentor.id, text: 'run docker logs' });
    expect(ctx.notifier.find('room:message')[0]).toMatchObject({ kind: 'room', roomId: room.id });
  });

  test('empty or very long messages are rejected', async () => {
    await expect(ctx.services.rooms.postMessage(mentor.id, room.id, '   ')).rejects.toMatchObject({ status: 400 });
    await expect(ctx.services.rooms.postMessage(mentor.id, room.id, 'x'.repeat(2001))).rejects.toMatchObject({ status: 400 });
  });

  test('shared notes can be updated and are broadcast', async () => {
    const r = await ctx.services.rooms.updateNotes(student.id, room.id, 'FROM node:20');
    expect(r.notes).toBe('FROM node:20');
    expect(ctx.notifier.find('room:notes')[0].payload).toMatchObject({ notes: 'FROM node:20', by: student.id });
  });

  test('after the time lock expires the room is read-only', async () => {
    ctx.clock.advanceMinutes(61);
    const r = await ctx.services.rooms.getRoom(student.id, room.id);
    expect(r.locked).toBe(true);
    expect(r.remainingSeconds).toBe(0);
    await expect(ctx.services.rooms.postMessage(student.id, room.id, 'hello?')).rejects.toMatchObject({ status: 423 });
    await expect(ctx.services.rooms.updateNotes(student.id, room.id, 'x')).rejects.toMatchObject({ status: 423 });
  });

  test('a closed room (bounty completed) is read-only', async () => {
    await ctx.services.bounties.completeBounty(student.id, room.bountyId);
    const r = await ctx.services.rooms.getRoom(mentor.id, room.id);
    expect(r.locked).toBe(true);
    await expect(ctx.services.rooms.postMessage(mentor.id, room.id, 'bye')).rejects.toMatchObject({ status: 423 });
  });

  test('unknown room is 404', async () => {
    await expect(ctx.services.rooms.getRoom(student.id, 'missing')).rejects.toMatchObject({ status: 404 });
  });
});

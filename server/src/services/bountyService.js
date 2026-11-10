const { badRequest, forbidden, notFound, conflict, insufficientFunds } = require('../domain/errors');
const { ROLES, BOUNTY_STATUS, LIMITS } = require('../domain/constants');
const { normalizeTags, isEligible } = require('../domain/skills');

const isInt = (n) => Number.isInteger(n);
const inRange = (n, min, max) => isInt(n) && n >= min && n <= max;

function validateBountyInput(input = {}) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const tags = normalizeTags(input.tags);
  const reward = Number(input.reward);
  const sessionMinutes = Number(input.sessionMinutes);
  const acceptWindowMinutes = Number(input.acceptWindowMinutes ?? 30);

  if (!title || title.length > LIMITS.TITLE_MAX) throw badRequest(`Title is required (max ${LIMITS.TITLE_MAX} chars)`);
  if (description.length > LIMITS.DESCRIPTION_MAX) throw badRequest('Description is too long');
  if (tags.length > LIMITS.TAGS_MAX) throw badRequest(`At most ${LIMITS.TAGS_MAX} tags`);
  if (!inRange(reward, LIMITS.REWARD_MIN, LIMITS.REWARD_MAX)) {
    throw badRequest(`Reward must be a whole number of tokens between ${LIMITS.REWARD_MIN} and ${LIMITS.REWARD_MAX}`);
  }
  if (!inRange(sessionMinutes, LIMITS.SESSION_MIN, LIMITS.SESSION_MAX)) {
    throw badRequest(`Session length must be ${LIMITS.SESSION_MIN}-${LIMITS.SESSION_MAX} minutes`);
  }
  if (!inRange(acceptWindowMinutes, LIMITS.ACCEPT_WINDOW_MIN, LIMITS.ACCEPT_WINDOW_MAX)) {
    throw badRequest(`Accept window must be ${LIMITS.ACCEPT_WINDOW_MIN}-${LIMITS.ACCEPT_WINDOW_MAX} minutes`);
  }
  return { title, description, tags, reward, sessionMinutes, acceptWindowMinutes };
}

function createBountyService({ repos, clock, notifier }) {
  const requireUser = async (id) => {
    const u = await repos.users.findById(id);
    if (!u) throw forbidden('Unknown user');
    return u;
  };
  const requireBounty = async (id) => {
    const b = await repos.bounties.findById(id);
    if (!b) throw notFound('Bounty not found');
    return b;
  };

  return {
    /** Student posts a bounty; reward is escrowed immediately; eligible mentors are pushed. */
    async createBounty(studentId, input) {
      const student = await requireUser(studentId);
      if (student.role !== ROLES.STUDENT) throw forbidden('Only students can post bounties');
      const data = validateBountyInput(input);

      const debited = await repos.users.adjustTokens(student.id, -data.reward);
      if (!debited) throw insufficientFunds(`You need ${data.reward} tokens but have ${student.tokens}`);

      let bounty;
      try {
        bounty = await repos.bounties.create({
          title: data.title,
          description: data.description,
          tags: data.tags,
          reward: data.reward,
          sessionMinutes: data.sessionMinutes,
          postedBy: student.id,
          expiresAt: new Date(clock.now().getTime() + data.acceptWindowMinutes * 60000),
        });
      } catch (err) {
        await repos.users.adjustTokens(student.id, data.reward); // undo escrow
        throw err;
      }

      const mentors = await repos.users.findMentorsBySkills(bounty.tags);
      const ids = mentors.map((m) => m.id).filter((id) => id !== student.id);
      if (ids.length) notifier.toUsers(ids, 'bounty:new', { ...bounty, postedByName: student.name });
      return bounty;
    },

    /** First eligible mentor to call this wins; a time-locked room is opened. */
    async acceptBounty(mentorId, bountyId) {
      const mentor = await requireUser(mentorId);
      if (mentor.role !== ROLES.MENTOR) throw forbidden('Only mentors can accept bounties');
      const existing = await requireBounty(bountyId);
      if (!isEligible(mentor.skills, existing.tags)) throw forbidden('Your skills do not match this bounty');

      const now = clock.now();
      const claimed = await repos.bounties.claim(bountyId, mentor.id, now);
      if (!claimed) throw conflict('This bounty has already been taken or has expired');

      const room = await repos.rooms.create({
        bountyId: claimed.id,
        participants: [claimed.postedBy, mentor.id],
        expiresAt: new Date(now.getTime() + claimed.sessionMinutes * 60000),
      });
      const bounty = await repos.bounties.setRoom(claimed.id, room.id);

      notifier.toUsers([bounty.postedBy], 'bounty:accepted', {
        bountyId: bounty.id,
        roomId: room.id,
        mentorId: mentor.id,
        mentorName: mentor.name,
        title: bounty.title,
      });
      notifier.toRole(ROLES.MENTOR, 'bounty:taken', { bountyId: bounty.id, by: mentor.id, reason: 'accepted' });
      return { bounty, room };
    },

    /** Poster marks the session done; escrow is released to the mentor. */
    async completeBounty(studentId, bountyId) {
      const b = await requireBounty(bountyId);
      if (b.postedBy !== studentId) throw forbidden('Only the poster can complete this bounty');
      const done = await repos.bounties.transition(bountyId, BOUNTY_STATUS.ACCEPTED, {
        status: BOUNTY_STATUS.COMPLETED,
        completedAt: clock.now(),
      });
      if (!done) throw conflict(`Bounty is ${b.status}, it can only be completed once accepted`);
      await repos.users.adjustTokens(done.acceptedBy, done.reward);
      if (done.roomId) {
        await repos.rooms.close(done.roomId);
        notifier.toRoom(done.roomId, 'room:closed', { roomId: done.roomId, reason: 'completed' });
      }
      notifier.toUsers([done.acceptedBy], 'bounty:completed', { bountyId: done.id, reward: done.reward, title: done.title });
      return done;
    },

    /** Poster withdraws an un-accepted bounty; escrow is refunded. */
    async cancelBounty(studentId, bountyId) {
      const b = await requireBounty(bountyId);
      if (b.postedBy !== studentId) throw forbidden('Only the poster can cancel this bounty');
      const c = await repos.bounties.transition(bountyId, BOUNTY_STATUS.OPEN, { status: BOUNTY_STATUS.CANCELLED });
      if (!c) throw conflict(`Bounty is ${b.status} and can no longer be cancelled`);
      await repos.users.adjustTokens(c.postedBy, c.reward);
      notifier.toRole(ROLES.MENTOR, 'bounty:taken', { bountyId: c.id, reason: 'cancelled' });
      return c;
    },

    /** Background sweep: open bounties nobody accepted in time are expired and refunded. */
    async expireStale() {
      const now = clock.now();
      const stale = await repos.bounties.findExpiredOpen(now);
      let count = 0;
      for (const b of stale) {
        const e = await repos.bounties.transition(b.id, BOUNTY_STATUS.OPEN, { status: BOUNTY_STATUS.EXPIRED });
        if (!e) continue; // accepted/cancelled in the meantime
        await repos.users.adjustTokens(e.postedBy, e.reward);
        notifier.toUsers([e.postedBy], 'bounty:expired', { bountyId: e.id, title: e.title, refunded: e.reward });
        notifier.toRole(ROLES.MENTOR, 'bounty:taken', { bountyId: e.id, reason: 'expired' });
        count += 1;
      }
      return count;
    },

    async getBounty(userId, bountyId) {
      await requireUser(userId);
      return requireBounty(bountyId);
    },

    /** Open, still-acceptable bounties, each flagged with whether this user may accept it. */
    async listOpen(userId) {
      const user = await requireUser(userId);
      const list = await repos.bounties.list({ status: BOUNTY_STATUS.OPEN, expiresAfter: clock.now() });
      const posters = await repos.users.findManyByIds([...new Set(list.map((b) => b.postedBy))]);
      const names = Object.fromEntries(posters.map((p) => [p.id, p.name]));
      return list.map((b) => ({
        ...b,
        postedByName: names[b.postedBy] || 'Unknown',
        eligible: user.role === ROLES.MENTOR && isEligible(user.skills, b.tags),
      }));
    },

    async listMine(userId) {
      const user = await requireUser(userId);
      const filter = user.role === ROLES.STUDENT ? { postedBy: user.id } : { acceptedBy: user.id };
      return repos.bounties.list(filter);
    },
  };
}

module.exports = { createBountyService, validateBountyInput };

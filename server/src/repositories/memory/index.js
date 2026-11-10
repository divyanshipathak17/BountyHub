/**
 * In-memory repository implementation.
 *
 * Used by the unit/integration test-suite and handy for demos without a DB.
 * Every method mirrors the MongoDB adapter's contract (see
 * tests/contract/repositories.contract.js). Node runs JS on a single thread
 * and none of the critical sections below await between "check" and "write",
 * so claim/transition/adjustTokens are atomic just like the conditional
 * findOneAndUpdate calls in the Mongo adapter.
 */
const crypto = require('crypto');
const { DuplicateKeyError } = require('../../domain/errors');
const { normalizeTags } = require('../../domain/skills');

const newId = () => crypto.randomBytes(12).toString('hex');
/** Deep copy so callers can never mutate stored state (keeps Dates as Dates). */
function clone(value) {
  if (value == null) return value === undefined ? null : value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = clone(v);
    return out;
  }
  return value;
}

function createMemoryRepositories() {
  const users = new Map();
  const bounties = new Map();
  const rooms = new Map();

  const userRepo = {
    async create(data) {
      const email = data.email.trim().toLowerCase();
      for (const u of users.values()) if (u.email === email) throw new DuplicateKeyError('email');
      const now = new Date();
      const user = {
        id: newId(),
        name: data.name,
        email,
        passwordHash: data.passwordHash,
        role: data.role,
        skills: normalizeTags(data.skills),
        tokens: data.tokens ?? 0,
        createdAt: now,
        updatedAt: now,
      };
      users.set(user.id, user);
      return clone(user);
    },
    async findById(id) {
      return clone(users.get(id));
    },
    async findByEmail(email) {
      const e = String(email).trim().toLowerCase();
      for (const u of users.values()) if (u.email === e) return clone(u);
      return null;
    },
    async findManyByIds(ids) {
      return ids.map((id) => users.get(id)).filter(Boolean).map(clone);
    },
    async adjustTokens(id, delta) {
      const u = users.get(id);
      if (!u) return null;
      if (u.tokens + delta < 0) return null;
      u.tokens += delta;
      u.updatedAt = new Date();
      return clone(u);
    },
    async findMentorsBySkills(tags) {
      const wanted = normalizeTags(tags);
      return [...users.values()]
        .filter((u) => u.role === 'mentor')
        .filter((u) => wanted.length === 0 || u.skills.some((s) => wanted.includes(s)))
        .map(clone);
    },
  };

  const bountyRepo = {
    async create(data) {
      const now = new Date();
      const b = {
        id: newId(),
        title: data.title,
        description: data.description ?? '',
        tags: normalizeTags(data.tags),
        reward: data.reward,
        sessionMinutes: data.sessionMinutes,
        postedBy: data.postedBy,
        acceptedBy: null,
        roomId: null,
        status: 'open',
        expiresAt: new Date(data.expiresAt),
        acceptedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      bounties.set(b.id, b);
      return clone(b);
    },
    async findById(id) {
      return clone(bounties.get(id));
    },
    async list(filter = {}) {
      return [...bounties.values()]
        .filter((b) => !filter.status || b.status === filter.status)
        .filter((b) => !filter.postedBy || b.postedBy === filter.postedBy)
        .filter((b) => !filter.acceptedBy || b.acceptedBy === filter.acceptedBy)
        .filter((b) => !filter.expiresAfter || b.expiresAt > filter.expiresAfter)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(clone);
    },
    async claim(id, mentorId, now) {
      const b = bounties.get(id);
      if (!b || b.status !== 'open' || b.expiresAt <= now) return null;
      b.status = 'accepted';
      b.acceptedBy = mentorId;
      b.acceptedAt = new Date(now);
      b.updatedAt = new Date();
      return clone(b);
    },
    async transition(id, fromStatus, patch) {
      const b = bounties.get(id);
      if (!b || b.status !== fromStatus) return null;
      Object.assign(b, patch, { updatedAt: new Date() });
      return clone(b);
    },
    async setRoom(id, roomId) {
      const b = bounties.get(id);
      if (!b) return null;
      b.roomId = roomId;
      b.updatedAt = new Date();
      return clone(b);
    },
    async findExpiredOpen(now) {
      return [...bounties.values()].filter((b) => b.status === 'open' && b.expiresAt <= now).map(clone);
    },
  };

  const roomRepo = {
    async create(data) {
      const now = new Date();
      const r = {
        id: newId(),
        bountyId: data.bountyId,
        participants: [...data.participants],
        status: 'active',
        notes: '',
        messages: [],
        expiresAt: new Date(data.expiresAt),
        createdAt: now,
        updatedAt: now,
      };
      rooms.set(r.id, r);
      return clone(r);
    },
    async findById(id) {
      return clone(rooms.get(id));
    },
    async findByBountyId(bountyId) {
      for (const r of rooms.values()) if (r.bountyId === bountyId) return clone(r);
      return null;
    },
    async addMessage(roomId, msg) {
      const r = rooms.get(roomId);
      if (!r) return null;
      const m = { id: newId(), sender: msg.sender, text: msg.text, sentAt: new Date(msg.sentAt) };
      r.messages.push(m);
      r.updatedAt = new Date();
      return clone(m);
    },
    async updateNotes(roomId, notes) {
      const r = rooms.get(roomId);
      if (!r) return null;
      r.notes = notes;
      r.updatedAt = new Date();
      return clone(r);
    },
    async close(roomId) {
      const r = rooms.get(roomId);
      if (!r) return null;
      r.status = 'closed';
      r.updatedAt = new Date();
      return clone(r);
    },
  };

  return {
    users: userRepo,
    bounties: bountyRepo,
    rooms: roomRepo,
    async reset() {
      users.clear();
      bounties.clear();
      rooms.clear();
    },
  };
}

module.exports = { createMemoryRepositories };

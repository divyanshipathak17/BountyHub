/**
 * MongoDB (Mongoose) repository implementation.
 *
 * All race-sensitive operations are single conditional `findOneAndUpdate`
 * calls, which MongoDB executes atomically per document:
 *   - claim():        { status: 'open', expiresAt > now }  -> first mentor wins
 *   - transition():   { status: fromStatus }               -> no double completion
 *   - adjustTokens(): { tokens >= -delta }                 -> balance never negative
 */
const mongoose = require('mongoose');
const { User, Bounty, Room } = require('./models');
const { DuplicateKeyError } = require('../../domain/errors');
const { normalizeTags } = require('../../domain/skills');

const AFTER = { returnDocument: 'after' };
const valid = (id) => typeof id === 'string' && mongoose.isValidObjectId(id) && /^[a-f0-9]{24}$/i.test(id);
const str = (v) => (v == null ? null : String(v));

function toUser(doc) {
  if (!doc) return null;
  return {
    id: str(doc._id),
    name: doc.name,
    email: doc.email,
    passwordHash: doc.passwordHash,
    role: doc.role,
    skills: [...(doc.skills || [])],
    tokens: doc.tokens,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toBounty(doc) {
  if (!doc) return null;
  return {
    id: str(doc._id),
    title: doc.title,
    description: doc.description,
    tags: [...(doc.tags || [])],
    reward: doc.reward,
    sessionMinutes: doc.sessionMinutes,
    postedBy: str(doc.postedBy),
    acceptedBy: str(doc.acceptedBy),
    roomId: str(doc.roomId),
    status: doc.status,
    expiresAt: doc.expiresAt,
    acceptedAt: doc.acceptedAt ?? null,
    completedAt: doc.completedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const toMessage = (m) => ({ id: str(m._id), sender: str(m.sender), text: m.text, sentAt: m.sentAt });

function toRoom(doc) {
  if (!doc) return null;
  return {
    id: str(doc._id),
    bountyId: str(doc.bountyId),
    participants: (doc.participants || []).map(str),
    status: doc.status,
    notes: doc.notes,
    messages: (doc.messages || []).map(toMessage),
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function createMongoRepositories() {
  const users = {
    async create(data) {
      try {
        const doc = await User.create({ ...data, skills: normalizeTags(data.skills) });
        return toUser(doc.toObject());
      } catch (err) {
        if (err && err.code === 11000) throw new DuplicateKeyError('email');
        throw err;
      }
    },
    async findById(id) {
      if (!valid(id)) return null;
      return toUser(await User.findById(id).lean());
    },
    async findByEmail(email) {
      return toUser(await User.findOne({ email: String(email).trim().toLowerCase() }).lean());
    },
    async findManyByIds(ids) {
      const ok = ids.filter(valid);
      return (await User.find({ _id: { $in: ok } }).lean()).map(toUser);
    },
    async adjustTokens(id, delta) {
      if (!valid(id)) return null;
      const filter = { _id: id };
      if (delta < 0) filter.tokens = { $gte: -delta };
      return toUser(await User.findOneAndUpdate(filter, { $inc: { tokens: delta } }, { ...AFTER, lean: true }));
    },
    async findMentorsBySkills(tags) {
      const wanted = normalizeTags(tags);
      const filter = { role: 'mentor' };
      if (wanted.length) filter.skills = { $in: wanted };
      return (await User.find(filter).sort({ createdAt: 1 }).lean()).map(toUser);
    },
  };

  const bounties = {
    async create(data) {
      const doc = await Bounty.create({ ...data, tags: normalizeTags(data.tags) });
      return toBounty(doc.toObject());
    },
    async findById(id) {
      if (!valid(id)) return null;
      return toBounty(await Bounty.findById(id).lean());
    },
    async list(filter = {}) {
      const q = {};
      if (filter.status) q.status = filter.status;
      if (filter.postedBy) {
        if (!valid(filter.postedBy)) return [];
        q.postedBy = filter.postedBy;
      }
      if (filter.acceptedBy) {
        if (!valid(filter.acceptedBy)) return [];
        q.acceptedBy = filter.acceptedBy;
      }
      if (filter.expiresAfter) q.expiresAt = { $gt: filter.expiresAfter };
      return (await Bounty.find(q).sort({ createdAt: -1, _id: -1 }).lean()).map(toBounty);
    },
    async claim(id, mentorId, now) {
      if (!valid(id)) return null;
      const doc = await Bounty.findOneAndUpdate(
        { _id: id, status: 'open', expiresAt: { $gt: now } },
        { $set: { status: 'accepted', acceptedBy: mentorId, acceptedAt: now } },
        { ...AFTER, lean: true },
      );
      return toBounty(doc);
    },
    async transition(id, fromStatus, patch) {
      if (!valid(id)) return null;
      const doc = await Bounty.findOneAndUpdate({ _id: id, status: fromStatus }, { $set: patch }, { ...AFTER, lean: true });
      return toBounty(doc);
    },
    async setRoom(id, roomId) {
      if (!valid(id)) return null;
      return toBounty(await Bounty.findByIdAndUpdate(id, { $set: { roomId } }, { ...AFTER, lean: true }));
    },
    async findExpiredOpen(now) {
      return (await Bounty.find({ status: 'open', expiresAt: { $lte: now } }).lean()).map(toBounty);
    },
  };

  const rooms = {
    async create(data) {
      const doc = await Room.create(data);
      return toRoom(doc.toObject());
    },
    async findById(id) {
      if (!valid(id)) return null;
      return toRoom(await Room.findById(id).lean());
    },
    async findByBountyId(bountyId) {
      if (!valid(bountyId)) return null;
      return toRoom(await Room.findOne({ bountyId }).lean());
    },
    async addMessage(roomId, msg) {
      if (!valid(roomId)) return null;
      const _id = new mongoose.Types.ObjectId();
      const res = await Room.updateOne(
        { _id: roomId },
        { $push: { messages: { _id, sender: msg.sender, text: msg.text, sentAt: msg.sentAt } } },
      );
      if (!res.matchedCount) return null;
      return { id: String(_id), sender: String(msg.sender), text: msg.text, sentAt: new Date(msg.sentAt) };
    },
    async updateNotes(roomId, notes) {
      if (!valid(roomId)) return null;
      return toRoom(await Room.findByIdAndUpdate(roomId, { $set: { notes } }, { ...AFTER, lean: true }));
    },
    async close(roomId) {
      if (!valid(roomId)) return null;
      return toRoom(await Room.findByIdAndUpdate(roomId, { $set: { status: 'closed' } }, { ...AFTER, lean: true }));
    },
  };

  return {
    users,
    bounties,
    rooms,
    async syncIndexes() {
      await Promise.all([User.syncIndexes(), Bounty.syncIndexes(), Room.syncIndexes()]);
    },
    async reset() {
      await Promise.all([User.deleteMany({}), Bounty.deleteMany({}), Room.deleteMany({})]);
    },
  };
}

module.exports = { createMongoRepositories };

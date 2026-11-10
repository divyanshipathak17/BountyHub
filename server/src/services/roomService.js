const { badRequest, forbidden, notFound, locked } = require('../domain/errors');
const { ROOM_STATUS, LIMITS } = require('../domain/constants');

function createRoomService({ repos, clock, notifier }) {
  const isLocked = (room, now) => room.status !== ROOM_STATUS.ACTIVE || room.expiresAt <= now;

  async function loadForParticipant(userId, roomId) {
    const room = await repos.rooms.findById(roomId);
    if (!room) throw notFound('Room not found');
    if (!room.participants.includes(userId)) throw forbidden('You are not a participant of this room');
    return room;
  }

  async function loadWritable(userId, roomId) {
    const room = await loadForParticipant(userId, roomId);
    if (isLocked(room, clock.now())) throw locked('This workspace is locked (time is up or the bounty is closed)');
    return room;
  }

  return {
    isLocked,

    /** Room view with derived time-lock state and display info. */
    async getRoom(userId, roomId) {
      const room = await loadForParticipant(userId, roomId);
      const now = clock.now();
      const [bounty, people] = await Promise.all([
        repos.bounties.findById(room.bountyId),
        repos.users.findManyByIds(room.participants),
      ]);
      const roomLocked = isLocked(room, now);
      return {
        ...room,
        locked: roomLocked,
        remainingSeconds: roomLocked ? 0 : Math.max(0, Math.floor((room.expiresAt - now) / 1000)),
        bounty: bounty && {
          id: bounty.id, title: bounty.title, description: bounty.description, reward: bounty.reward,
          status: bounty.status, postedBy: bounty.postedBy, acceptedBy: bounty.acceptedBy, tags: bounty.tags,
        },
        participantsInfo: people.map((p) => ({ id: p.id, name: p.name, role: p.role })),
      };
    },

    async postMessage(userId, roomId, rawText) {
      const text = typeof rawText === 'string' ? rawText.trim() : '';
      if (!text) throw badRequest('Message cannot be empty');
      if (text.length > LIMITS.MESSAGE_MAX) throw badRequest(`Message is longer than ${LIMITS.MESSAGE_MAX} characters`);
      await loadWritable(userId, roomId);
      const msg = await repos.rooms.addMessage(roomId, { sender: userId, text, sentAt: clock.now() });
      notifier.toRoom(roomId, 'room:message', { ...msg, roomId });
      return msg;
    },

    async updateNotes(userId, roomId, notes) {
      if (typeof notes !== 'string') throw badRequest('Notes must be text');
      if (notes.length > LIMITS.NOTES_MAX) throw badRequest('Notes are too long');
      await loadWritable(userId, roomId);
      const room = await repos.rooms.updateNotes(roomId, notes);
      notifier.toRoom(roomId, 'room:notes', { roomId, notes, by: userId });
      return room;
    },
  };
}

module.exports = { createRoomService };

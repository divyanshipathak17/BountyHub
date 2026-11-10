/**
 * Notifier port implemented on top of Socket.IO.
 *
 * Socket.IO "rooms" used:
 *   user:<id>    one per user (all their tabs/devices)
 *   role:mentor  every connected mentor
 *   room:<id>    participants currently inside a workspace room
 *
 * Services only know the three methods below, so they can be tested with a
 * recording double and the transport can be swapped (e.g. Redis adapter / Ably).
 */
function createSocketNotifier() {
  let io = null;
  return {
    attach(server) {
      io = server;
    },
    toUsers(userIds, event, payload) {
      if (!io || !userIds.length) return;
      io.to(userIds.map((id) => `user:${id}`)).emit(event, payload);
    },
    toRole(role, event, payload) {
      if (io) io.to(`role:${role}`).emit(event, payload);
    },
    toRoom(roomId, event, payload) {
      if (io) io.to(`room:${roomId}`).emit(event, payload);
    },
  };
}

module.exports = { createSocketNotifier };

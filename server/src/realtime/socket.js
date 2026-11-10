const { Server } = require('socket.io');

/** Turn a thrown error into a socket acknowledgement payload. */
const errorAck = (err) => ({ ok: false, status: err.status || 500, error: err.status ? err.message : 'Internal error' });

/**
 * Attach Socket.IO to the HTTP server.
 *
 * Handshake: client sends { auth: { token } }; invalid tokens are refused with
 * "unauthorized". On connect the socket joins user:<id> and role:<role>.
 *
 * Client -> server events (all acknowledged with { ok, ... }):
 *   room:join    { roomId }            -> { ok, room }
 *   room:leave   { roomId }            -> { ok }
 *   room:message { roomId, text }      -> { ok, message }  (broadcast room:message)
 *   room:notes   { roomId, notes }     -> { ok }           (broadcast room:notes)
 */
function attachRealtime(httpServer, { services, notifier, corsOrigin }) {
  const io = new Server(httpServer, { cors: { origin: corsOrigin, credentials: true } });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      socket.data.user = services.auth.verifyToken(token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role } = socket.data.user;
    socket.join(`user:${id}`);
    socket.join(`role:${role}`);

    const handle = (event, fn) => {
      socket.on(event, async (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          reply({ ok: true, ...(await fn(payload || {})) });
        } catch (err) {
          reply(errorAck(err));
        }
      });
    };

    handle('room:join', async ({ roomId }) => {
      const room = await services.rooms.getRoom(id, roomId);
      socket.join(`room:${roomId}`);
      return { room };
    });
    handle('room:leave', async ({ roomId }) => {
      socket.leave(`room:${roomId}`);
      return {};
    });
    handle('room:message', async ({ roomId, text }) => ({
      message: await services.rooms.postMessage(id, roomId, text),
    }));
    handle('room:notes', async ({ roomId, notes }) => {
      await services.rooms.updateNotes(id, roomId, notes);
      return {};
    });
  });

  notifier.attach(io);
  return io;
}

module.exports = { attachRealtime };

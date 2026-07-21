// =============================================================================
//  socketHandlers.js — bridges Socket.IO connections to Room/RoomManager.
// =============================================================================
//  Each viewer gets an individualized state (hole cards differ per viewer), so
//  we broadcast by iterating the room's humans and emitting stateFor(playerId)
//  to each one's socket rather than a single room-wide emit.
// =============================================================================

import { RoomManager } from './game/RoomManager.js';
import { C, S } from './types/protocol.js';

export function attachSocketHandlers(io) {
  const manager = new RoomManager();

  /** Send every member of a room their own tailored state. */
  function broadcast(room) {
    for (const human of room.humans.values()) {
      if (human.socketId && human.connected) {
        io.to(human.socketId).emit(S.STATE, room.stateFor(human.id));
      }
    }
  }

  io.on('connection', (socket) => {
    // Per-connection binding to a room + player.
    let bound = null; // { code, playerId }

    const fail = (message) => socket.emit(S.ERROR, { message });

    // Wrap a handler so any thrown error becomes a clean s:error to this socket.
    const guard = (fn) => (payload, ack) => {
      try {
        const result = fn(payload || {}) || {};
        if (typeof ack === 'function') ack({ ok: true, ...result });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
        fail(err.message);
      }
    };

    function bindRoom(room, human) {
      bound = { code: room.code, playerId: human.id };
      socket.join(room.code);
      // Ensure the room broadcasts through this io instance.
      room.onChange = () => broadcast(room);
    }

    socket.on(C.CREATE_ROOM, guard(({ name, settings }) => {
      const room = manager.createRoom(settings ? { settings } : {});
      const human = room.join({ name, socketId: socket.id });
      bindRoom(room, human);
      broadcast(room);
      return { code: room.code, playerId: human.id };
    }));

    socket.on(C.JOIN_ROOM, guard(({ code, name, playerId }) => {
      const room = manager.getRoom(code);
      if (!room) throw new Error('No room with that code');
      const human = room.join({ name, playerId, socketId: socket.id });
      bindRoom(room, human);
      broadcast(room);
      return { code: room.code, playerId: human.id };
    }));

    // --- Actions that require an already-bound room --------------------------
    const withRoom = (fn) => (payload) => {
      if (!bound) throw new Error('Join a room first');
      const room = manager.getRoom(bound.code);
      if (!room) throw new Error('Room no longer exists');
      return fn(room, bound.playerId, payload);
    };

    socket.on(C.UPDATE_SETTINGS, guard(withRoom((room, pid, { settings }) => room.updateSettings(pid, settings))));
    socket.on(C.TAKE_SEAT, guard(withRoom((room, pid, { seatIndex }) => room.takeSeat(pid, seatIndex))));
    socket.on(C.LEAVE_SEAT, guard(withRoom((room, pid) => room.leaveSeat(pid))));
    socket.on(C.ADD_BOT, guard(withRoom((room, pid, { seatIndex, difficulty }) => room.addBot(pid, seatIndex, difficulty))));
    socket.on(C.REMOVE_BOT, guard(withRoom((room, pid, { seatIndex }) => room.removeBot(pid, seatIndex))));
    socket.on(C.START_GAME, guard(withRoom((room, pid) => room.startGame(pid))));
    socket.on(C.ACTION, guard(withRoom((room, pid, action) => room.act(pid, action))));
    socket.on(C.FOLLOW_SEAT, guard(withRoom((room, pid, { seatIndex }) => room.followSeat(pid, seatIndex))));

    socket.on(C.LEAVE_ROOM, guard(withRoom((room, pid) => {
      room.leaveRoom(pid);
      socket.leave(room.code);
      manager.scheduleCleanup(room.code);
      bound = null;
    })));

    socket.on('disconnect', () => {
      if (!bound) return;
      const room = manager.getRoom(bound.code);
      if (!room) return;
      room.disconnect(bound.playerId);
      manager.scheduleCleanup(room.code);
    });
  });

  return manager;
}

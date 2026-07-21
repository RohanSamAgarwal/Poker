// =============================================================================
//  protocol.js — Socket.IO event names shared in spirit by client and server.
// =============================================================================
//  Client → Server events are prefixed `c:`; Server → Client are `s:`.
//  Kept as a flat map of constants so both ends refer to the same strings and
//  typos surface as undefined rather than silent no-ops.
// =============================================================================

export const C = {
  CREATE_ROOM: 'c:createRoom',   // { name }                         → ack { code, playerId, you }
  JOIN_ROOM: 'c:joinRoom',       // { code, name, playerId? }        → ack { code, playerId, you } | { error }
  UPDATE_SETTINGS: 'c:updateSettings', // { settings }               (host only)
  TAKE_SEAT: 'c:takeSeat',       // { seatIndex }                    (move spectator → open seat, in lobby)
  LEAVE_SEAT: 'c:leaveSeat',     // {}                               (seat → spectator, in lobby)
  ADD_BOT: 'c:addBot',           // { seatIndex, difficulty }        (host only)
  REMOVE_BOT: 'c:removeBot',     // { seatIndex }                    (host only)
  START_GAME: 'c:startGame',     // {}                               (host only)
  ACTION: 'c:action',            // { type, amount? }                (current actor)
  FOLLOW_SEAT: 'c:followSeat',   // { seatIndex | null }             (spectator, follow-one mode, between hands)
  LEAVE_ROOM: 'c:leaveRoom',     // {}
};

export const S = {
  STATE: 's:state',              // full per-viewer room/game state
  ERROR: 's:error',              // { message }
  HAND_RESULT: 's:handResult',   // { results }  (emitted at showdown for animations)
  GAME_OVER: 's:gameOver',       // { standings }
};

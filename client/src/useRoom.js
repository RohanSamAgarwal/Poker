import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from './socket.js';

const LS_KEY = 'poker:session';

function loadSession() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch { return null; }
}
function saveSession(s) {
  if (s) localStorage.setItem(LS_KEY, JSON.stringify(s));
  else localStorage.removeItem(LS_KEY);
}

// Promise wrapper around an ack'd emit.
function request(event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

/**
 * Central client state: connection, the current room view (server-authoritative),
 * transient errors, and the action senders. Handles reconnect via a stored
 * playerId + room code.
 */
export function useRoom() {
  const [connected, setConnected] = useState(socket.connected);
  const [state, setState] = useState(null); // latest s:state for this viewer
  const [error, setError] = useState(null);
  const sessionRef = useRef(loadSession());

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      // Attempt to rejoin a room we were in before a reload/disconnect.
      const s = sessionRef.current;
      if (s?.code && s?.playerId) {
        request('c:joinRoom', { code: s.code, name: s.name, playerId: s.playerId })
          .then((res) => { if (!res?.ok) { sessionRef.current = null; saveSession(null); setState(null); } });
      }
    };
    const onDisconnect = () => setConnected(false);
    const onState = (s) => setState(s);
    const onError = (e) => {
      setError(e?.message || 'Something went wrong');
      setTimeout(() => setError(null), 4000);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('s:state', onState);
    socket.on('s:error', onError);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('s:state', onState);
      socket.off('s:error', onError);
    };
  }, []);

  const remember = useCallback((res, name) => {
    if (res?.ok && res.code) {
      sessionRef.current = { code: res.code, playerId: res.playerId, name };
      saveSession(sessionRef.current);
    }
    return res;
  }, []);

  const createRoom = useCallback(async (name, settings) => {
    const res = await request('c:createRoom', { name, settings });
    if (!res?.ok) setError(res?.error || 'Could not create room');
    return remember(res, name);
  }, [remember]);

  const joinRoom = useCallback(async (code, name) => {
    const res = await request('c:joinRoom', { code: code.toUpperCase(), name });
    if (!res?.ok) setError(res?.error || 'Could not join room');
    return remember(res, name);
  }, [remember]);

  const leaveRoom = useCallback(async () => {
    await request('c:leaveRoom', {});
    sessionRef.current = null; saveSession(null); setState(null);
  }, []);

  // Thin senders for the rest of the protocol.
  const send = useCallback((event, payload = {}) => request(event, payload), []);
  const updateSettings = useCallback((settings) => send('c:updateSettings', { settings }), [send]);
  const takeSeat = useCallback((seatIndex) => send('c:takeSeat', { seatIndex }), [send]);
  const leaveSeat = useCallback(() => send('c:leaveSeat', {}), [send]);
  const addBot = useCallback((seatIndex, difficulty) => send('c:addBot', { seatIndex, difficulty }), [send]);
  const removeBot = useCallback((seatIndex) => send('c:removeBot', { seatIndex }), [send]);
  const startGame = useCallback(() => send('c:startGame', {}), [send]);
  const act = useCallback((type, amount) => send('c:action', { type, amount }), [send]);
  const followSeat = useCallback((seatIndex) => send('c:followSeat', { seatIndex }), [send]);

  return {
    connected, state, error,
    createRoom, joinRoom, leaveRoom,
    updateSettings, takeSeat, leaveSeat, addBot, removeBot, startGame, act, followSeat,
  };
}

import { useEffect, useRef } from 'react';
import { sfx } from './sound.js';

// Reduce the room state to just the fields that drive sound cues.
function snap(s) {
  const seats = s?.seats || [];
  const mySeat = s?.you && s.you.seatIndex != null ? seats[s.you.seatIndex] : null;
  return {
    phase: s?.phase,
    handCount: s?.handCount || 0,
    board: s?.hand?.board?.length || 0,
    pot: s?.hand?.pot || 0,
    folded: seats.filter((x) => x && x.folded).length,
    myTurn: !!(mySeat && mySeat.isCurrentActor),
    hasResult: !!s?.result,
    iWon: !!(mySeat && s?.result && mySeat.won > 0),
  };
}

// Play sound effects in response to game-state transitions. Diffing the server
// state means one place drives all cues, regardless of who acted.
export function useSounds(state) {
  const prevRef = useRef(null);

  useEffect(() => {
    if (!state) { prevRef.current = null; return; }
    const cur = snap(state);
    const prev = prevRef.current;
    prevRef.current = cur;
    if (!prev) return; // first snapshot — nothing to compare yet

    if (cur.handCount > prev.handCount) {
      sfx.deal(); // fresh hand dealt
    } else if (cur.phase === 'playing') {
      if (cur.board > prev.board) sfx.flip();  // a community card landed
      if (cur.pot > prev.pot) sfx.chip();      // chips went in
      if (cur.folded > prev.folded) sfx.fold(); // someone folded
    }

    if (cur.myTurn && !prev.myTurn) sfx.yourTurn();
    if (cur.hasResult && !prev.hasResult && cur.iWon) sfx.win();
  }, [state]);
}

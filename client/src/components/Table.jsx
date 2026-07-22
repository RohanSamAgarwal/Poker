import { useEffect, useRef, useState } from 'react';
import Seat from './Seat.jsx';
import Card from './Card.jsx';
import ActionBar from './ActionBar.jsx';
import ActionFeed from './ActionFeed.jsx';
import RSACube from './RSACube.jsx';
import { ChipStack, ChipPile } from './Chips.jsx';
import { SPEC_LABELS } from '../labels.js';

// Locally tick down a server-provided remaining time so clocks move smoothly
// between state broadcasts. Re-syncs each time the server value changes.
function useCountdown(remainingMs) {
  const [, force] = useState(0);
  const deadlineRef = useRef(null);
  useEffect(() => {
    deadlineRef.current = remainingMs == null ? null : Date.now() + remainingMs;
    force((x) => x + 1);
  }, [remainingMs]);
  useEffect(() => {
    if (remainingMs == null) return undefined;
    const id = setInterval(() => force((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [remainingMs == null]);
  return deadlineRef.current == null ? null : Math.max(0, deadlineRef.current - Date.now());
}

// Position a visual slot around an ellipse. v=0 is bottom-center ("you"),
// increasing clockwise. Returns CSS top/left percentages.
function slotStyle(v, n) {
  const angle = (90 + (v * 360) / n) * (Math.PI / 180);
  // Slightly tighter vertical radius (and a small upward shift) so the larger
  // bottom "you" seat cards don't spill past the felt's bottom edge.
  const left = 50 + 43 * Math.cos(angle);
  const top = 44 + 33 * Math.sin(angle);
  return { left: `${left}%`, top: `${top}%`, transform: 'translate(-50%, -50%)' };
}

function fmtTime(ms) {
  if (ms == null) return null;
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function Table({ state, actions }) {
  const { seats, you, hand, settings, result, legal } = state;
  const n = settings.maxSeats;

  // Anchor: your seat at the bottom; spectators anchor on whom they follow (or 0).
  const anchor = you?.seatIndex ?? you?.followSeat ?? 0;
  const isMyTurn = legal && hand && you && seats[you.seatIndex]?.isCurrentActor;

  const board = hand?.board || [];
  const boardSlots = [0, 1, 2, 3, 4];

  // Pot split into "collected" (settled from prior streets, shown above the
  // cards) and the current street's live bets (shown below the cards). At
  // showdown the whole pot is collected.
  const streetTotal = result ? 0 : seats.reduce((s, x) => s + (x.streetCommitted || 0), 0);
  const collectedPot = Math.max(0, (hand?.pot || 0) - streetTotal);

  // Live-ticking clocks driven off the server's remaining-time values.
  const timeLeftMs = useCountdown(state.timeRemainingMs);
  const actionLeftMs = useCountdown(state.actionRemainingMs);
  const timeLeft = fmtTime(timeLeftMs);
  const blinds = state.blinds;

  return (
    <div className="table-screen">
      <div className="table-topbar">
        <span className="room-tag">Room {state.code}</span>
        <span className="hand-tag">Hand #{state.handCount}</span>
        {blinds && <span className="blind-tag">Blinds {blinds.sb}/{blinds.bb}</span>}
        {timeLeft && <span className={`time-tag ${timeLeftMs < 60000 ? 'urgent' : ''}`}>⏱ {timeLeft}</span>}
        {state.spectatorCount > 0 && <span className="spec-count">👁 {state.spectatorCount}</span>}
        {you?.isSpectator && (
          <span className="tag spectate">
            Spectating · {SPEC_LABELS[settings.spectatorVisibility]}
          </span>
        )}
      </div>

      <div className="felt">
        <div className="felt-watermark" aria-hidden="true"><RSACube size={200} color="#ffffff" strokeWidth={6} /></div>
        <div className="felt-center">
          <PotCounter collected={collectedPot} />
          <div className="board">
            {boardSlots.map((i) => (
              board[i]
                ? <Card key={`${state.handCount}-${i}-${board[i]}`} card={board[i]} size="md" />
                : <div key={i} className="card card-md card-slot" />
            ))}
          </div>
          <StreetBets total={streetTotal} street={hand?.street} />
          {result && (
            <div className="result-banner">
              {result.showdown
                ? result.hands.map((h) => (
                    <span key={h.id} className={result.winnings?.[h.id] ? 'won' : ''}>
                      {seatName(seats, h.id, result)} — {h.category}
                    </span>
                  ))
                : <span className="won">{winnerNames(seats, result.winnings, result)} wins the pot</span>}
            </div>
          )}
        </div>

        {seats.map((seat) => {
          const v = ((seat.index - anchor) + n) % n;
          return (
            <Seat
              key={seat.index}
              seat={seat}
              isYou={seat.id === you?.playerId}
              showdownWin={result ? seat.won : 0}
              dealKey={state.handCount}
              style={slotStyle(v, n)}
            />
          );
        })}
      </div>

      <ActionFeed feed={state.feed} />

      {you?.isSpectator && settings.spectatorVisibility === 'followOne' && (
        <FollowPicker state={state} actions={actions} />
      )}

      <div className="table-foot">
        {isMyTurn
          ? <ActionBar
              legal={{ ...legal, pot: hand.pot }}
              onAct={actions.act}
              timeLeftMs={actionLeftMs}
              timeoutSec={state.actionTimeoutSec}
            />
          : <div className="turn-hint">{turnHint(state, actionLeftMs)}</div>}
      </div>
    </div>
  );
}

// Settled pot (from completed streets), shown above the community cards. Keyed
// by amount so it re-mounts and pulses whenever it grows.
function PotCounter({ collected }) {
  if (collected <= 0) return null;
  return (
    <div className="pot-counter" key={collected}>
      <ChipPile amount={collected} seed={3} size={24} />
      <span className="pot-amt">POT <b>{collected.toLocaleString()}</b></span>
    </div>
  );
}

// The current street's live bets, shown below the cards. When the street
// changes, the prior street's chips "fly" up into the pot counter.
function StreetBets({ total, street }) {
  const [morphAmt, setMorphAmt] = useState(0);
  const prevStreet = useRef(street);
  const prevTotal = useRef(total);
  const morphKey = useRef(0);

  useEffect(() => {
    if (street !== prevStreet.current) {
      if (prevTotal.current > 0) {
        morphKey.current += 1;
        setMorphAmt(prevTotal.current);
        setTimeout(() => setMorphAmt(0), 700);
      }
      prevStreet.current = street;
    }
    prevTotal.current = total;
  }, [street, total]);

  return (
    <div className="street-bets-wrap">
      {total > 0 && (
        <div className="street-bets">
          <ChipStack amount={total} size={32} />
          <span className="street-bets-amt">{total.toLocaleString()}</span>
        </div>
      )}
      {morphAmt > 0 && (
        <div className="pot-morph" key={morphKey.current}>
          <ChipStack amount={morphAmt} size={32} animate={false} />
        </div>
      )}
    </div>
  );
}

function turnHint(state, actionLeftMs) {
  const { hand, seats, you } = state;
  if (state.phase === 'ended') return null;
  if (!hand) return 'Waiting for the next hand…';
  const actor = seats.find((s) => s.id === hand.currentActor);
  if (!actor) return 'Dealing…';
  if (you && seats[you.seatIndex]?.isCurrentActor) return null;
  const clock = actionLeftMs != null ? ` (${Math.ceil(actionLeftMs / 1000)}s)` : '';
  return `Waiting on ${actor.name}…${clock}`;
}

function seatName(seats, id, result) {
  return result?.names?.[id] || seats.find((s) => s.id === id)?.name || 'Player';
}
function winnerNames(seats, winnings, result) {
  return Object.keys(winnings || {}).map((id) => seatName(seats, id, result)).join(' & ') || 'Nobody';
}

// Between-hands control for follow-one spectators to choose whom to watch.
function FollowPicker({ state, actions }) {
  const seated = state.seats.filter((s) => !s.empty);
  const locked = state.hand && state.hand.street !== 'complete';
  return (
    <div className="follow-picker">
      <span>Watching:</span>
      {seated.map((s) => (
        <button
          key={s.index}
          className={`chip-btn ${state.you.followSeat === s.index ? 'on' : ''}`}
          disabled={locked}
          onClick={() => actions.followSeat(s.index)}
        >
          {s.name}
        </button>
      ))}
      {locked && <span className="muted small">locked until the hand ends</span>}
    </div>
  );
}

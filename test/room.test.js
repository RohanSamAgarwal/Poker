import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../server/game/RoomManager.js';
import { Room } from '../server/game/Room.js';
import { Deck, freshDeck } from '../server/game/Deck.js';

// A deck whose first cards are exactly `top` (deal order), padded to a full 52.
function riggedDeck(top) {
  const used = new Set(top);
  const rest = freshDeck().filter((c) => !used.has(c));
  return new Deck([...top, ...rest]);
}

// Synchronous timing so a whole game can play out inside one test tick.
const SYNC = { botDelayMs: 0, betweenHandsMs: 0 };

function makeRoom(settings = {}) {
  return new Room('TEST', { ...SYNC, settings });
}

test('RoomManager issues unique, unambiguous codes and tracks rooms', () => {
  const mgr = new RoomManager({ roomOpts: SYNC });
  const a = mgr.createRoom();
  const b = mgr.createRoom();
  assert.notEqual(a.code, b.code);
  assert.match(a.code, /^[A-Z2-9]{4}$/); // no O/0/I/1
  assert.equal(mgr.count(), 2);
  assert.equal(mgr.getRoom(a.code.toLowerCase()), a); // case-insensitive lookup
});

test('first human is host and is auto-seated; second joins seat 1', () => {
  const room = makeRoom();
  const host = room.join({ name: 'Rohan', socketId: 's1' });
  const p2 = room.join({ name: 'Ada', socketId: 's2' });
  assert.equal(host.isHost, true);
  assert.equal(room.hostId, host.id);
  assert.equal(host.seatIndex, 0);
  assert.equal(p2.seatIndex, 1);
  assert.equal(room.seats[0].name, 'Rohan');
});

test('seat views carry ids so the client can identify you / host / winners', () => {
  const room = makeRoom();
  const host = room.join({ name: 'Rohan', socketId: 's1' });
  const view = room.stateFor(host.id);
  const mySeat = view.seats[host.seatIndex];
  assert.equal(mySeat.id, host.id);          // "you" match works
  assert.equal(view.you.playerId, host.id);
  assert.equal(view.hostId, host.id);        // "host" tag match works
});

test('only the host may change settings, and restacking follows startingChips', () => {
  const room = makeRoom();
  const host = room.join({ name: 'Host', socketId: 's1' });
  const p2 = room.join({ name: 'Guest', socketId: 's2' });
  assert.throws(() => room.updateSettings(p2.id, { startingChips: 5000 }), /host/i);
  room.updateSettings(host.id, { startingChips: 5000, blinds: { sb: 25, bb: 50 } });
  assert.equal(room.settings.startingChips, 5000);
  assert.equal(room.seats[0].stack, 5000);
  assert.equal(room.seats[1].stack, 5000);
  assert.equal(room.settings.blinds.bb, 50);
});

test('host can add and remove bots; bots occupy seats', () => {
  const room = makeRoom({ maxSeats: 4 });
  const host = room.join({ name: 'Host', socketId: 's1' });
  room.addBot(host.id, 2, 'super');
  assert.equal(room.seats[2].kind, 'bot');
  assert.equal(room.seats[2].botDifficulty, 'super');
  room.removeBot(host.id, 2);
  assert.equal(room.seats[2], null);
});

test('cannot start with fewer than two players', () => {
  const room = makeRoom();
  const host = room.join({ name: 'Solo', socketId: 's1' });
  assert.throws(() => room.startGame(host.id), /at least 2/i);
});

test('blinds escalate on schedule', () => {
  const room = makeRoom({ blinds: { sb: 10, bb: 20 }, blindEscalation: { everyHands: 2, factor: 2 } });
  room.handCount = 1; assert.deepEqual(room._effectiveBlinds(), { sb: 10, bb: 20 });
  room.handCount = 2; assert.deepEqual(room._effectiveBlinds(), { sb: 10, bb: 20 }); // still level 0
  room.handCount = 3; assert.deepEqual(room._effectiveBlinds(), { sb: 20, bb: 40 }); // level 1
  room.handCount = 5; assert.deepEqual(room._effectiveBlinds(), { sb: 40, bb: 80 }); // level 2
});

test('no escalation leaves blinds flat', () => {
  const room = makeRoom({ blinds: { sb: 5, bb: 10 } });
  room.handCount = 50;
  assert.deepEqual(room._effectiveBlinds(), { sb: 5, bb: 10 });
});

// --- Spectator card visibility (server-enforced) ----------------------------

function seatedVisibilityFixture(mode) {
  const room = makeRoom({ maxSeats: 2, spectatorVisibility: mode });
  const host = room.join({ name: 'Host', socketId: 's1' });
  room.addBot(host.id, 1, 'beginner');
  const spec = room.join({ name: 'Rail', socketId: 's3' }); // both seats full → spectator
  assert.equal(spec.seatIndex, null);
  return { room, host, spec };
}

test('publicOnly: spectators see no hole cards', () => {
  const { room, host, spec } = seatedVisibilityFixture('publicOnly');
  room.startGame(host.id); // heads-up: host (button/SB) is first to act → hand pauses
  const view = room.stateFor(spec.id);
  assert.ok(view.hand, 'a hand should be in progress');
  assert.equal(view.seats[0].hole, undefined);
  assert.equal(view.seats[1].hole, undefined);
});

test('open: spectators see every non-folded hole', () => {
  const { room, host, spec } = seatedVisibilityFixture('open');
  room.startGame(host.id);
  const view = room.stateFor(spec.id);
  assert.equal(view.seats[0].hole?.length, 2);
  assert.equal(view.seats[1].hole?.length, 2);
});

test('followOne: spectator sees only the followed seat, and cannot switch mid-hand', () => {
  const { room, host, spec } = seatedVisibilityFixture('followOne');
  room.followSeat(spec.id, 1); // allowed in lobby (no hand yet)
  room.startGame(host.id);
  const view = room.stateFor(spec.id);
  assert.equal(view.seats[1].hole?.length, 2); // followed
  assert.equal(view.seats[0].hole, undefined); // not followed
  // Switching mid-hand is rejected.
  assert.throws(() => room.followSeat(spec.id, 0), /between hands/i);
});

test('seated player sees own hole cards but not opponents', () => {
  const { room, host } = seatedVisibilityFixture('open');
  room.startGame(host.id);
  const view = room.stateFor(host.id);
  assert.equal(view.seats[0].hole?.length, 2); // own
  assert.equal(view.seats[1].hole, undefined); // opponent hidden despite 'open'
});

test('the current actor receives their legal actions', () => {
  const { room, host } = seatedVisibilityFixture('publicOnly');
  room.startGame(host.id);
  const view = room.stateFor(host.id);
  assert.equal(view.hand.currentActor, room.seats[0].id);
  assert.ok(view.legal, 'actor should get a legal-action descriptor');
  assert.equal(typeof view.legal.canCall, 'boolean');
});

// --- Full automatic game (all bots) -----------------------------------------

test('an all-bot game plays to an end condition and conserves chips', () => {
  const room = makeRoom({
    maxSeats: 2,
    startingChips: 500,
    endCondition: { type: 'numHands', numHands: 8 },
  });
  const host = room.join({ name: 'Organizer', socketId: 's1' });
  room.leaveSeat(host.id);          // host railbirds
  room.addBot(host.id, 0, 'beginner');
  room.addBot(host.id, 1, 'beginner');
  room.startGame(host.id);          // runs synchronously to completion

  assert.equal(room.phase, 'ended');
  assert.ok(room.standings.length >= 1);
  const totalChips = room.standings.reduce((s, x) => s + x.stack, 0);
  assert.equal(totalChips, 1000); // 2 × 500, nothing created or destroyed
  assert.ok(room.handCount <= 8);
});

test('lastStanding ends when one player busts out', () => {
  // Deterministic: seat 0 holds aces, seat 1 is all-in for the big blind and
  // loses, busting in a single hand. Heads-up deal order (button = seat 0):
  //   deck[0]→seat1, [1]→seat0, [2]→seat1, [3]→seat0, then the board.
  const room = new Room('TEST', {
    ...SYNC,
    settings: { maxSeats: 2, startingChips: 1000, endCondition: { type: 'lastStanding' }, blinds: { sb: 10, bb: 20 } },
    deckFactory: () => riggedDeck([
      '2d', 'As', '7h', 'Ac', // seat1: 2d 7h · seat0: As Ac
      '5s', '9c', 'Kd', '3h', 'Jd', // board — seat 0 keeps a winning pair of aces
    ]),
  });
  const host = room.join({ name: 'Org', socketId: 's1' });
  room.leaveSeat(host.id);
  room.addBot(host.id, 0, 'beginner');
  room.addBot(host.id, 1, 'beginner');
  room.seats[1].stack = 20; // short stack: only the big blind
  room.startGame(host.id);

  assert.equal(room.phase, 'ended');
  const survivors = room.standings.filter((s) => s.stack > 0);
  assert.equal(survivors.length, 1);
  assert.equal(survivors[0].stack, 1020); // 1000 + 20 from the busted short stack
  // Standings include the busted player, ranked last.
  assert.equal(room.standings.length, 2);
  assert.equal(room.standings[1].stack, 0);
});

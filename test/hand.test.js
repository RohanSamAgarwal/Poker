import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hand } from '../server/game/Hand.js';
import { Deck, freshDeck } from '../server/game/Deck.js';

// Build a deck whose first cards are exactly `top` (in deal order), padded with
// the rest of a fresh deck so the 52-card supply stays valid and unique.
function riggedDeck(top) {
  const used = new Set(top);
  const rest = freshDeck().filter((c) => !used.has(c));
  return new Deck([...top, ...rest]);
}

const stacksOf = (hand) =>
  Object.fromEntries(hand.seats.map((s) => [s.id, s.stack]));
const totalChips = (hand) =>
  hand.seats.reduce((sum, s) => sum + s.stack, 0);

test('blinds are posted and preflop action starts at UTG (3-handed)', () => {
  const hand = new Hand({
    players: [
      { id: 'p0', stack: 1000 },
      { id: 'p1', stack: 1000 },
      { id: 'p2', stack: 1000 },
    ],
    buttonIndex: 0,
    blinds: { sb: 10, bb: 20 },
  });
  // n=3: SB = button+1 = p1, BB = button+2 = p2.
  assert.equal(hand.seat('p1').totalCommitted, 10);
  assert.equal(hand.seat('p2').totalCommitted, 20);
  // First to act preflop = left of BB = p0.
  assert.equal(hand.currentActorId(), 'p0');
  assert.equal(hand.currentBet, 20);
});

test('a full checked-down hand pays the best hand and conserves chips', () => {
  // Deal order (button=0, n=3): idx 0→p1,1→p2,2→p0,3→p1,4→p2,5→p0, board 6..10.
  const hand = new Hand({
    players: [
      { id: 'p0', stack: 1000 },
      { id: 'p1', stack: 1000 },
      { id: 'p2', stack: 1000 },
    ],
    buttonIndex: 0,
    blinds: { sb: 10, bb: 20 },
    deck: riggedDeck([
      '2d', '2c', 'As', // round 1: p1, p2, p0
      '7h', '7d', 'Ac', // round 2: p1, p2, p0  → p0 holds AsAc
      'Ah', 'Kd', 'Qs', // flop
      '9c',              // turn
      '3s',              // river  → p0 makes trip aces
    ]),
  });

  // Preflop: p0 calls, p1 (SB) calls, p2 (BB) checks option.
  hand.act('p0', { type: 'call' });
  hand.act('p1', { type: 'call' });
  hand.act('p2', { type: 'check' });
  assert.equal(hand.street, 'flop');

  // Check down flop, turn, river. Postflop first actor is SB (p1).
  for (const street of ['flop', 'turn', 'river']) {
    assert.equal(hand.street, street);
    hand.act('p1', { type: 'check' });
    hand.act('p2', { type: 'check' });
    hand.act('p0', { type: 'check' });
  }

  assert.ok(hand.isComplete());
  assert.equal(hand.results.showdown, true);
  assert.equal(hand.results.winnings.p0, 60); // 20 from each of three players
  const stacks = stacksOf(hand);
  assert.equal(stacks.p0, 1040);
  assert.equal(stacks.p1, 980);
  assert.equal(stacks.p2, 980);
  assert.equal(totalChips(hand), 3000);
});

test('everyone folds to one player — wins pot with no showdown', () => {
  const hand = new Hand({
    players: [
      { id: 'p0', stack: 1000 },
      { id: 'p1', stack: 1000 },
      { id: 'p2', stack: 1000 },
    ],
    buttonIndex: 0,
    blinds: { sb: 10, bb: 20 },
  });
  hand.act('p0', { type: 'fold' });
  hand.act('p1', { type: 'fold' });
  assert.ok(hand.isComplete());
  assert.equal(hand.results.showdown, false);
  assert.equal(hand.results.winnings.p2, 30); // SB 10 + BB 20
  assert.equal(stacksOf(hand).p2, 1010);
  assert.equal(totalChips(hand), 3000);
});

test('legal actions reflect facing a bet vs an open', () => {
  const hand = new Hand({
    players: [
      { id: 'p0', stack: 1000 },
      { id: 'p1', stack: 1000 },
      { id: 'p2', stack: 1000 },
    ],
    buttonIndex: 0,
    blinds: { sb: 10, bb: 20 },
  });
  // p0 faces the big blind: must call 20, can raise to at least 40, cannot check.
  const a = hand.legalActions('p0');
  assert.equal(a.canCheck, false);
  assert.equal(a.canCall, true);
  assert.equal(a.callAmount, 20);
  assert.equal(a.canRaise, true);
  assert.equal(a.minRaiseTo, 40);
  assert.equal(a.maxRaiseTo, 1000);
});

test('all-in short stack: chips are conserved and hand runs out', () => {
  const hand = new Hand({
    players: [
      { id: 'p0', stack: 100 },   // short
      { id: 'p1', stack: 1000 },
      { id: 'p2', stack: 1000 },
    ],
    buttonIndex: 0,
    blinds: { sb: 10, bb: 20 },
  });
  // p0 shoves all-in preflop; p1 and p2 call. p0 is now all-in but p1/p2 still
  // have chips, so they contest a side pot on later streets — check it down.
  hand.act('p0', { type: 'allin' });
  hand.act('p1', { type: 'call' });
  hand.act('p2', { type: 'call' });
  assert.equal(hand.street, 'flop');
  for (const street of ['flop', 'turn', 'river']) {
    assert.equal(hand.street, street);
    hand.act('p1', { type: 'check' });
    hand.act('p2', { type: 'check' });
  }
  assert.ok(hand.isComplete());
  assert.equal(hand.board.length, 5);
  // All chips return to stacks once the pot is distributed: 100 + 1000 + 1000.
  assert.equal(totalChips(hand), 2100);
});

test('all-in with no callers behind runs the board out automatically', () => {
  // Heads-up: both all-in preflop → no more betting possible, board runs out.
  const hand = new Hand({
    players: [
      { id: 'p0', stack: 200 },
      { id: 'p1', stack: 200 },
    ],
    buttonIndex: 0,
    blinds: { sb: 10, bb: 20 },
  });
  // Heads-up: button (p0) is SB and acts first preflop.
  hand.act('p0', { type: 'allin' });
  hand.act('p1', { type: 'call' });
  assert.ok(hand.isComplete());
  assert.equal(hand.board.length, 5);
  assert.equal(totalChips(hand), 400);
});

test('min-raise increment is enforced', () => {
  const hand = new Hand({
    players: [
      { id: 'p0', stack: 1000 },
      { id: 'p1', stack: 1000 },
      { id: 'p2', stack: 1000 },
    ],
    buttonIndex: 0,
    blinds: { sb: 10, bb: 20 },
  });
  // p0 raises to 60 (a legal raise). Then a raise to 70 is below min (min 100).
  hand.act('p0', { type: 'raise', amount: 60 });
  const a = hand.legalActions('p1');
  assert.equal(a.minRaiseTo, 100); // 60 + last raise size (40)
  assert.throws(() => hand.act('p1', { type: 'raise', amount: 70 }));
});

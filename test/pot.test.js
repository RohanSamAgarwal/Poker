import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPots, awardPots } from '../server/game/Pot.js';

test('single pot when everyone contributes equally', () => {
  const pots = buildPots([
    { id: 'a', committed: 100, folded: false },
    { id: 'b', committed: 100, folded: false },
    { id: 'c', committed: 100, folded: true },
  ]);
  assert.equal(pots.length, 1);
  assert.equal(pots[0].amount, 300);
  assert.deepEqual(pots[0].eligible.sort(), ['a', 'b']); // c folded
});

test('folded chips stay in the pot but folder is not eligible', () => {
  const pots = buildPots([
    { id: 'a', committed: 50, folded: false },
    { id: 'b', committed: 50, folded: false },
    { id: 'c', committed: 20, folded: true },
  ]);
  const total = pots.reduce((s, p) => s + p.amount, 0);
  assert.equal(total, 120);
  for (const p of pots) assert.ok(!p.eligible.includes('c'));
});

test('classic multi-way all-in builds correct side pots', () => {
  // a all-in 100, b all-in 200, c covers 300. Nobody folds.
  const pots = buildPots([
    { id: 'a', committed: 100, folded: false },
    { id: 'b', committed: 200, folded: false },
    { id: 'c', committed: 300, folded: false },
  ]);
  assert.equal(pots.length, 3);
  // Main pot: 100 from each = 300, all three eligible.
  assert.equal(pots[0].amount, 300);
  assert.deepEqual(pots[0].eligible.sort(), ['a', 'b', 'c']);
  // Side pot 1: 100 from b and c = 200, only b and c eligible.
  assert.equal(pots[1].amount, 200);
  assert.deepEqual(pots[1].eligible.sort(), ['b', 'c']);
  // Side pot 2: 100 from c alone = 100, only c eligible (uncalled — returned to c).
  assert.equal(pots[2].amount, 100);
  assert.deepEqual(pots[2].eligible.sort(), ['c']);
});

test('total chips are always conserved', () => {
  const contributions = [
    { id: 'a', committed: 33, folded: false },
    { id: 'b', committed: 150, folded: true },
    { id: 'c', committed: 150, folded: false },
    { id: 'd', committed: 75, folded: false },
  ];
  const pots = buildPots(contributions);
  const total = pots.reduce((s, p) => s + p.amount, 0);
  assert.equal(total, 33 + 150 + 150 + 75);
});

test('awardPots: short stack wins main pot, big stacks fight for side pot', () => {
  const pots = buildPots([
    { id: 'a', committed: 100, folded: false }, // all-in, best hand
    { id: 'b', committed: 300, folded: false },
    { id: 'c', committed: 300, folded: false },
  ]);
  // a has the best hand overall, but is only eligible for the main pot.
  const scores = new Map([
    ['a', [8, 14]], // straight flush
    ['b', [7, 10, 5]], // quads
    ['c', [1, 2, 9, 8, 7]], // pair
  ]);
  const winnings = awardPots(pots, scores, ['a', 'b', 'c']);
  // Main pot 300 (100×3) → a. Side pot 400 (200 each from b,c) → b (quads beat pair).
  assert.equal(winnings.get('a'), 300);
  assert.equal(winnings.get('b'), 400);
  assert.equal(winnings.get('c'), undefined);
});

test('awardPots: split pot divides evenly and gives odd chip by seat order', () => {
  const pots = [{ amount: 101, eligible: ['a', 'b'] }];
  const scores = new Map([
    ['a', [4, 10]],
    ['b', [4, 10]], // identical → split
  ]);
  // Seat order starts with b (left of button), so b gets the odd chip.
  const winnings = awardPots(pots, scores, ['b', 'a']);
  assert.equal(winnings.get('b'), 51);
  assert.equal(winnings.get('a'), 50);
});

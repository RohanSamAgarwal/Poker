import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, compareScores } from '../server/game/handEval.js';

// Helper: evaluate 7 cards and return the category string.
const cat = (cards) => evaluate(cards).category;
// Helper: true if hand A beats hand B (7 cards each).
const beats = (a, b) => compareScores(evaluate(a).score, evaluate(b).score) > 0;
const ties = (a, b) => compareScores(evaluate(a).score, evaluate(b).score) === 0;

test('recognises each hand category from 7 cards', () => {
  assert.equal(cat(['As', 'Ks', 'Qs', 'Js', 'Ts', '2d', '7c']), 'Straight Flush');
  assert.equal(cat(['9h', '9d', '9c', '9s', 'Kd', '2c', '3h']), 'Four of a Kind');
  assert.equal(cat(['Qh', 'Qd', 'Qc', '4s', '4d', '9c', '2h']), 'Full House');
  assert.equal(cat(['Ah', '7h', '4h', '3h', '2h', 'Kd', 'Qc']), 'Flush');
  assert.equal(cat(['5c', '6d', '7h', '8s', '9c', 'Ad', 'Kd']), 'Straight');
  assert.equal(cat(['Jh', 'Jd', 'Jc', '4s', '9d', '2c', '7h']), 'Three of a Kind');
  assert.equal(cat(['Ah', 'Ad', 'Kc', 'Ks', '9d', '2c', '7h']), 'Two Pair');
  assert.equal(cat(['Ah', 'Ad', 'Kc', '8s', '9d', '2c', '7h']), 'Pair');
  assert.equal(cat(['Ah', 'Jd', 'Kc', '8s', '9d', '2c', '7h']), 'High Card');
});

test('wheel straight (A-2-3-4-5) is recognised, ace plays low', () => {
  assert.equal(cat(['Ah', '2d', '3c', '4s', '5d', 'Kc', 'Qh']), 'Straight');
  // 6-high straight beats the wheel (5-high).
  assert.ok(beats(
    ['2h', '3d', '4c', '5s', '6d', 'Kc', 'Qh'],
    ['Ah', '2d', '3c', '4s', '5d', 'Kc', 'Qh'],
  ));
});

test('wheel straight flush is a straight flush, not ace-high', () => {
  assert.equal(cat(['Ah', '2h', '3h', '4h', '5h', 'Kc', 'Qd']), 'Straight Flush');
});

test('higher four of a kind wins; kicker breaks equal quads', () => {
  assert.ok(beats(
    ['Ah', 'Ad', 'Ac', 'As', '2d', '3c', '4h'],
    ['Kh', 'Kd', 'Kc', 'Ks', 'Ad', '3c', '4h'],
  ));
  assert.ok(beats(
    ['9h', '9d', '9c', '9s', 'Ad', '3c', '4h'],
    ['9h', '9d', '9c', '9s', 'Kd', '3c', '4h'],
  ));
});

test('flush compares by highest cards down the line', () => {
  assert.ok(beats(
    ['Ah', 'Kh', '5h', '4h', '2h', '9c', '8d'],
    ['Ah', 'Qh', '5h', '4h', '2h', '9c', '8d'],
  ));
});

test('full house compares trips first, then the pair', () => {
  assert.ok(beats(
    ['Kh', 'Kd', 'Kc', '2s', '2d', '9c', '8h'],
    ['Qh', 'Qd', 'Qc', 'Ad', 'As', '9c', '8h'],
  ));
});

test('two pair uses higher pair, then lower pair, then kicker', () => {
  assert.ok(beats(
    ['Ah', 'Ad', '3c', '3s', 'Kd', '9c', '8h'],
    ['Kh', 'Kd', '3c', '3s', 'Ad', '9c', '8h'],
  ));
  // Same two pairs, kicker decides.
  assert.ok(beats(
    ['Ah', 'Ad', '3c', '3s', 'Kd', '9c', '8h'],
    ['As', 'Ac', '3d', '3h', 'Qd', '9s', '8c'],
  ));
});

test('identical best hands from different hole cards split (tie)', () => {
  // Board plays: both players have the same ace-high straight on board.
  const board = ['Ts', 'Jd', 'Qc', 'Kh', 'Ah'];
  assert.ok(ties([...board, '2c', '3d'], [...board, '4s', '5h']));
});

test('best-5-of-7 ignores distracting low cards', () => {
  // 2-3-4 + trip aces, but no 5 → no wheel straight, so trips is the best hand.
  const { category } = evaluate(['Ah', 'Ad', 'As', '2c', '3d', '4h', '9s']);
  assert.equal(category, 'Three of a Kind');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateEquity } from '../server/game/equity.js';
import { decide, resolveDifficulty } from '../server/game/Bot.js';

// --- Equity ----------------------------------------------------------------

test('pocket aces crush a random hand heads-up', () => {
  const eq = estimateEquity(['As', 'Ah'], [], 1, 1500);
  assert.ok(eq > 0.8, `expected >0.8, got ${eq.toFixed(3)}`);
});

test('seven-deuce offsuit is a big underdog heads-up', () => {
  const eq = estimateEquity(['7c', '2d'], [], 1, 1500);
  assert.ok(eq < 0.5, `expected <0.5, got ${eq.toFixed(3)}`);
});

test('a made straight flush has essentially 100% equity', () => {
  const eq = estimateEquity(['As', 'Ks'], ['Qs', 'Js', 'Ts'], 2, 500);
  assert.ok(eq > 0.99, `expected ~1, got ${eq.toFixed(3)}`);
});

test('equity falls as more opponents are added', () => {
  const heads = estimateEquity(['Ac', 'Kc'], [], 1, 1200);
  const fiveWay = estimateEquity(['Ac', 'Kc'], [], 4, 1200);
  assert.ok(heads > fiveWay, `${heads.toFixed(2)} should exceed ${fiveWay.toFixed(2)}`);
});

// --- Strategy decisions ----------------------------------------------------

// Minimal fake hand exposing just what decide() reads.
function fakeHand({ hole, board = [], pot, currentBet = 0, numActive = 2 }) {
  const seats = [{ id: 'bot' }, { id: 'opp' }];
  return {
    board, currentBet, button: 0, seats,
    seat: (id) => (id === 'bot' ? { id: 'bot', hole } : { id }),
    potTotal: () => pot,
    activeSeats: () => seats.slice(0, numActive),
  };
}

const openLegal = { toCall: 0, canFold: true, canCheck: true, canCall: false, callAmount: 0, canBet: true, canRaise: false, minRaiseTo: 20, maxRaiseTo: 1000 };
const facingLegal = (toCall) => ({ toCall, canFold: true, canCheck: false, canCall: true, callAmount: toCall, canBet: false, canRaise: true, minRaiseTo: toCall * 2, maxRaiseTo: 1000 });

test('a strong hand bets when checked to', () => {
  const hand = fakeHand({ hole: ['As', 'Ah'], board: [], pot: 100 });
  const action = decide({ legal: openLegal, difficulty: 'intermediate', hand, seat: { id: 'bot' } });
  assert.ok(['bet', 'allin'].includes(action.type), `got ${action.type}`);
  if (action.type === 'bet') assert.ok(action.amount >= openLegal.minRaiseTo);
});

test('a monster raises rather than folds when facing a bet', () => {
  const hand = fakeHand({ hole: ['As', 'Ah'], board: ['Ad', 'Kc', '7h'], pot: 200 });
  const action = decide({ legal: facingLegal(50), difficulty: 'super', hand, seat: { id: 'bot' } });
  assert.ok(['raise', 'allin', 'call'].includes(action.type), `got ${action.type}`);
  assert.notEqual(action.type, 'fold');
});

test('a disciplined bot folds trash to a big bet', () => {
  const hand = fakeHand({ hole: ['7c', '2d'], board: ['As', 'Kd', 'Qh', 'Jc', '9s'], pot: 100 });
  const action = decide({ legal: facingLegal(80), difficulty: 'super', hand, seat: { id: 'bot' } });
  assert.equal(action.type, 'fold');
});

test('a beginner is a calling station on cheap bets', () => {
  const hand = fakeHand({ hole: ['9c', '2d'], board: ['As', 'Kd', '7h'], pot: 100 });
  const action = decide({ legal: facingLegal(10), difficulty: 'beginner', hand, seat: { id: 'bot' } });
  assert.equal(action.type, 'call');
});

test("mixed difficulty resolves to a stable concrete style per seat", () => {
  const a = resolveDifficulty('mixed', 'bot:2');
  const b = resolveDifficulty('mixed', 'bot:2');
  assert.equal(a, b);
  assert.ok(['beginner', 'intermediate', 'super'].includes(a));
});

// =============================================================================
//  handEval.js — 5-card hand scoring + best-of-7 evaluation for Texas Hold'em.
// =============================================================================
//  A hand is scored as a comparable integer array: [category, ...tiebreakers].
//  Compare two scores lexicographically — higher wins, equal length arrays mean
//  a tie (split pot). Categories, high to low:
//
//    8 straight flush   7 four of a kind   6 full house   5 flush
//    4 straight         3 three of a kind  2 two pair     1 pair   0 high card
//
//  Tiebreakers are rank values (2..14) ordered by significance, e.g. a full
//  house is [6, tripsRank, pairRank]; two pair is [2, hiPair, loPair, kicker].
// =============================================================================

import { RANK_VALUE } from './Deck.js';

export const HAND_CATEGORIES = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
];

/** Score a specific 5-card hand → [category, ...tiebreakers]. */
function score5(cards) {
  const values = cards.map((c) => RANK_VALUE[c[0]]).sort((a, b) => b - a);
  const suits = cards.map((c) => c[1]);
  const isFlush = suits.every((s) => s === suits[0]);

  // Count rank multiplicities.
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  // Sort ranks by (count desc, value desc) — this is the natural tiebreak order.
  const byCount = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || b[0] - a[0],
  );
  const counted = byCount.map(([v]) => v);
  const shape = byCount.map(([, n]) => n); // e.g. [3,2] for a full house

  const straightHigh = straightHighCard(values);

  if (isFlush && straightHigh) return [8, straightHigh];
  if (shape[0] === 4) return [7, counted[0], counted[1]];
  if (shape[0] === 3 && shape[1] === 2) return [6, counted[0], counted[1]];
  if (isFlush) return [5, ...values];
  if (straightHigh) return [4, straightHigh];
  if (shape[0] === 3) return [3, counted[0], counted[1], counted[2]];
  if (shape[0] === 2 && shape[1] === 2) return [2, counted[0], counted[1], counted[2]];
  if (shape[0] === 2) return [1, ...counted];
  return [0, ...values];
}

/**
 * Return the high card of a straight given 5 descending unique-ish values,
 * or 0 if not a straight. Handles the wheel (A-2-3-4-5, high card = 5).
 */
function straightHighCard(descValues) {
  const uniq = [...new Set(descValues)];
  if (uniq.length !== 5) return 0;
  if (uniq[0] - uniq[4] === 4) return uniq[0];
  // Wheel: A,5,4,3,2 → treat ace as low.
  if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) return 5;
  return 0;
}

/** Compare two score arrays. >0 if a beats b, <0 if b beats a, 0 = tie. */
export function compareScores(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** All k-combinations of an array (small n, so brute force is fine). */
function combinations(arr, k) {
  const out = [];
  const combo = [];
  (function rec(start) {
    if (combo.length === k) {
      out.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      rec(i + 1);
      combo.pop();
    }
  })(0);
  return out;
}

/**
 * Evaluate the best 5-card hand from 5–7 cards.
 * @returns {{ score: number[], cards: string[], category: string }}
 */
export function evaluate(cards) {
  if (cards.length < 5) throw new Error('Need at least 5 cards to evaluate');
  let best = null;
  for (const five of combinations(cards, 5)) {
    const score = score5(five);
    if (!best || compareScores(score, best.score) > 0) {
      best = { score, cards: five };
    }
  }
  return { ...best, category: HAND_CATEGORIES[best.score[0]] };
}

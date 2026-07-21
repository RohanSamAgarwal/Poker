// =============================================================================
//  equity.js — Monte-Carlo hand-equity estimation for the AI.
// =============================================================================
//  Estimates the probability that a hole-card pair wins (ties counted as a
//  fractional win) against `numOpponents` unknown hands, given the current
//  board. Opponents' cards and the remaining board are sampled uniformly from
//  the cards NOT visible to us — the bot never peeks at the real deck order.
//
//  Uses Math.random (fast, non-crypto) — fine for gameplay AI. This module is
//  used only by bots, never for dealing.
// =============================================================================

import { freshDeck } from './Deck.js';
import { evaluate, compareScores } from './handEval.js';

/**
 * @param {string[]} hole   the bot's two hole cards
 * @param {string[]} board  0–5 community cards
 * @param {number} numOpponents  opponents still live in the hand
 * @param {number} iters  Monte-Carlo iterations (more = smoother, slower)
 * @returns {number} win equity in [0, 1]
 */
export function estimateEquity(hole, board, numOpponents, iters = 200) {
  if (numOpponents <= 0) return 1;

  const known = new Set([...hole, ...board]);
  const unknown = freshDeck().filter((c) => !known.has(c));
  const boardNeeded = 5 - board.length;
  const draw = numOpponents * 2 + boardNeeded;

  let score = 0;
  for (let it = 0; it < iters; it++) {
    // Partial Fisher–Yates: pull `draw` random distinct cards from `unknown`.
    const pool = unknown;
    const picked = [];
    for (let i = 0; i < draw; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      picked.push(pool[i]);
    }

    const fullBoard = board.concat(picked.slice(0, boardNeeded));
    const mine = evaluate(hole.concat(fullBoard)).score;

    let best = 0; // 0 = we're ahead, 1 = an opponent beats us, tie tracked separately
    let tiedWith = 0;
    let offset = boardNeeded;
    for (let o = 0; o < numOpponents; o++) {
      const oppHole = [picked[offset], picked[offset + 1]];
      offset += 2;
      const cmp = compareScores(mine, evaluate(oppHole.concat(fullBoard)).score);
      if (cmp < 0) { best = 1; break; }
      if (cmp === 0) tiedWith++;
    }

    if (best === 0) score += tiedWith > 0 ? 1 / (tiedWith + 1) : 1;
  }
  return score / iters;
}

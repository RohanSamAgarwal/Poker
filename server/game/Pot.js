// =============================================================================
//  Pot.js — main pot + side pot construction and awarding.
// =============================================================================
//  When players go all-in for different amounts, the total pool splits into a
//  main pot and one or more side pots. Each pot can only be won by the players
//  eligible for it (those who contributed to it and did not fold).
// =============================================================================

import { compareScores } from './handEval.js';

/**
 * Build layered pots from per-player contributions.
 *
 * @param {{ id: string, committed: number, folded: boolean }[]} contributions
 *   Every player's TOTAL chips committed to the pot this hand (folded players
 *   included — their chips stay in the pot, they're just not eligible to win).
 * @returns {{ amount: number, eligible: string[] }[]}
 *   Pots ordered main → outermost side pot. `eligible` is the set of non-folded
 *   player ids that can win that pot.
 */
export function buildPots(contributions) {
  // Work on a mutable copy of remaining committed amounts.
  const remaining = contributions
    .filter((c) => c.committed > 0)
    .map((c) => ({ id: c.id, committed: c.committed, folded: c.folded }));

  const pots = [];

  while (remaining.some((c) => c.committed > 0)) {
    const live = remaining.filter((c) => c.committed > 0);
    const level = Math.min(...live.map((c) => c.committed));

    let amount = 0;
    const eligible = [];
    for (const c of live) {
      amount += level; // every live contributor pays into this layer
      c.committed -= level;
      if (!c.folded) eligible.push(c.id);
    }

    // Merge into the previous pot if the eligible set is identical (keeps the
    // pot list minimal: consecutive layers with the same contenders are one pot).
    const prev = pots[pots.length - 1];
    if (prev && sameSet(prev.eligible, eligible)) {
      prev.amount += amount;
    } else {
      pots.push({ amount, eligible });
    }
  }

  return pots;
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/**
 * Award every pot to its best eligible hand(s).
 *
 * @param {{ amount: number, eligible: string[] }[]} pots
 * @param {Map<string, number[]>} scores  playerId → hand score array (from evaluate()).
 *   Only players still in at showdown need a score; folded players are absent.
 * @param {string[]} seatOrder  player ids in seat order starting left of the
 *   button — used to hand any indivisible odd chip to the correct player.
 * @returns {Map<string, number>} playerId → total chips won.
 */
export function awardPots(pots, scores, seatOrder) {
  const winnings = new Map();
  const add = (id, n) => winnings.set(id, (winnings.get(id) || 0) + n);

  for (const pot of pots) {
    const contenders = pot.eligible.filter((id) => scores.has(id));
    if (contenders.length === 0) continue; // shouldn't happen, but be safe

    // Find the best score among contenders.
    let best = null;
    for (const id of contenders) {
      if (best === null || compareScores(scores.get(id), scores.get(best)) > 0) {
        best = id;
      }
    }
    const winners = contenders.filter(
      (id) => compareScores(scores.get(id), scores.get(best)) === 0,
    );

    // Split the pot; distribute the remainder one chip at a time to winners in
    // seat order (standard "odd chip goes to the worst-position winner" rule —
    // first player left of the button among the winners).
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    for (const id of winners) add(id, share);

    const orderedWinners = seatOrder.filter((id) => winners.includes(id));
    for (let i = 0; remainder > 0; i++, remainder--) {
      add(orderedWinners[i % orderedWinners.length], 1);
    }
  }

  return winnings;
}

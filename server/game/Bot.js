// =============================================================================
//  Bot.js — AI player decision-making, four difficulties.
// =============================================================================
//  Every bot exposes the same `decide(ctx)` → action interface the human uses.
//  Strategy is parameterized per difficulty over a shared framework:
//    1. estimate hand equity (Monte-Carlo) vs the live opponents,
//    2. compare against the pot odds of calling,
//    3. choose fold / check / call / bet / raise / all-in with difficulty-tuned
//       thresholds, aggression, and bluff frequency.
//
//  Difficulties:
//    beginner     — loose & passive: plays too many hands, calls too much,
//                   rarely raises, almost never bluffs (a "calling station").
//    intermediate — pot-odds & position aware, value-bets, occasional bluff.
//    super        — tight-aggressive: more Monte-Carlo iters, equity-sized bets,
//                   semi-bluffs and balanced bluffing, folds marginal spots.
//    mixed        — each seat gets a fixed concrete style (varied tables).
// =============================================================================

import { estimateEquity } from './equity.js';

export const BOT_DIFFICULTIES = ['beginner', 'intermediate', 'super', 'mixed'];

const STYLES = ['beginner', 'intermediate', 'super'];

export function botName(difficulty, seatIndex) {
  const label = { beginner: 'Rookie', intermediate: 'Regular', super: 'Deep Blue', mixed: 'Wildcard' };
  return `${label[difficulty] || 'Bot'} ${seatIndex + 1}`;
}

// Stable hash so a 'mixed' seat keeps one style for the whole game.
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

/** Resolve 'mixed' to a concrete style, stable per seat id. */
export function resolveDifficulty(difficulty, seatId = '') {
  if (difficulty !== 'mixed') return difficulty;
  return STYLES[hashString(seatId) % STYLES.length];
}

const PARAMS = {
  beginner: {
    iters: 120,
    callLoose: 0.62,     // will call when equity ≥ potOdds × this (loose → calls light)
    valueBet: 0.72,      // bets/raises for value only when very strong
    raiseEquity: 0.86,
    bluffFreq: 0.02,
    betSizing: 0.4,      // small, timid sizing
    posBonus: 0,
  },
  intermediate: {
    iters: 220,
    callLoose: 1.0,      // calls at roughly correct pot odds
    valueBet: 0.6,
    raiseEquity: 0.74,
    bluffFreq: 0.09,
    betSizing: 0.6,
    posBonus: 0.04,      // widens in late position
  },
  super: {
    iters: 420,
    callLoose: 1.02,     // disciplined: needs a small edge over pot odds
    valueBet: 0.56,
    raiseEquity: 0.68,
    bluffFreq: 0.16,
    betSizing: 0.75,
    posBonus: 0.05,
  },
};

/**
 * @param {object} ctx
 * @param {object} ctx.legal   descriptor from Hand.legalActions()
 * @param {string} ctx.difficulty
 * @param {import('./Hand.js').Hand} ctx.hand
 * @param {object} ctx.seat    the room seat (has id)
 * @returns {{type:string, amount?:number}}
 */
export function decide(ctx) {
  const { legal, hand, seat } = ctx;
  if (!legal) return { type: 'check' };

  const style = resolveDifficulty(ctx.difficulty, seat?.id || '');
  const p = PARAMS[style] || PARAMS.intermediate;

  const hseat = hand.seat(seat.id);
  const hole = hseat?.hole || [];
  const board = hand.board || [];
  const pot = hand.potTotal();
  const numOpp = hand.activeSeats().filter((s) => s.id !== seat.id).length;

  // Positional nudge: acting later (closer to button) is worth a little.
  const equity = estimateEquity(hole, board, numOpp, p.iters) + inPosition(hand, seat) * p.posBonus;

  const toCall = legal.toCall || 0;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const rnd = Math.random();

  // --- No bet to us: check or take the initiative ---------------------------
  if (toCall === 0) {
    if (legal.canBet && equity >= p.valueBet) {
      return sized(legal, hand, pot, p.betSizing, equity);
    }
    // Bluff / semi-bluff occasionally when we can bet and are checked to.
    if (legal.canBet && rnd < p.bluffFreq) {
      return sized(legal, hand, pot, p.betSizing * 0.8, equity);
    }
    return { type: 'check' };
  }

  // --- Facing a bet ---------------------------------------------------------
  // Value raise with strong hands.
  if (legal.canRaise && equity >= p.raiseEquity) {
    return sized(legal, hand, pot, p.betSizing, equity);
  }
  // Occasional bluff-raise (skilled bots only, and not when it's very expensive).
  if (legal.canRaise && rnd < p.bluffFreq * 0.5 && toCall < pot * 0.5) {
    return sized(legal, hand, pot, p.betSizing * 0.9, equity);
  }
  // Call when equity justifies the pot odds (looseness varies by difficulty).
  if (legal.canCall && equity >= potOdds * (1 / p.callLoose)) {
    return { type: 'call' };
  }
  // Beginners hate folding cheaply — call tiny bets regardless.
  if (legal.canCall && style === 'beginner' && toCall <= pot * 0.15) {
    return { type: 'call' };
  }
  return { type: 'fold' };
}

/** +1 if this seat is in late position (button or closer) on this street, else 0. */
function inPosition(hand, seat) {
  const active = hand.activeSeats();
  if (active.length <= 2) return 0.5;
  const buttonId = hand.seats[hand.button]?.id;
  return seat.id === buttonId ? 1 : 0;
}

/**
 * Build a bet/raise action sized as a fraction of the pot, clamped to the legal
 * range. Strong equity nudges the size up. Returns an all-in when the target
 * reaches (or nearly reaches) the max.
 */
function sized(legal, hand, pot, fraction, equity) {
  const base = legal.canBet ? 0 : hand.currentBet;
  const boost = 1 + Math.max(0, equity - 0.7); // bet a touch bigger when crushing
  let target = Math.round(base + pot * fraction * boost);

  target = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, target));
  if (target >= legal.maxRaiseTo * 0.95) return { type: 'allin' };
  return { type: legal.canBet ? 'bet' : 'raise', amount: target };
}

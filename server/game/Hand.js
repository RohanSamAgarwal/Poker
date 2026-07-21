// =============================================================================
//  Hand.js — one complete hand of No-Limit Texas Hold'em.
// =============================================================================
//  Owns the full hand lifecycle: post blinds → deal hole cards → preflop →
//  flop → turn → river → showdown/payout. Enforces legal actions, min-raise
//  rules, all-in handling, and delegates pot splitting to Pot.js.
//
//  Chip amounts are integers. Players are supplied in canonical SEAT ORDER;
//  `buttonIndex` indexes into that array. Only players actually dealt into the
//  hand should be passed in (the Room decides who has chips and is sitting in).
//
//  The betting model tracks per-player `hasActed`. The subtle No-Limit rule
//  that a short all-in (less than a full raise) does NOT reopen the betting is
//  encoded cleanly: a full raise resets everyone's `hasActed` to false; a short
//  all-in does not, so a player who already acted can only call or fold.
// =============================================================================

import { Deck } from './Deck.js';
import { evaluate } from './handEval.js';
import { buildPots, awardPots } from './Pot.js';

export const STREETS = ['preflop', 'flop', 'turn', 'river', 'showdown', 'complete'];

export class Hand {
  /**
   * @param {object} opts
   * @param {{id:string, stack:number}[]} opts.players  in canonical seat order (stack > 0)
   * @param {number} opts.buttonIndex  index of the dealer button within players
   * @param {{sb:number, bb:number}} opts.blinds
   * @param {Deck} [opts.deck]  optional deck (tests inject a fixed order)
   */
  constructor({ players, buttonIndex, blinds, deck }) {
    if (players.length < 2) throw new Error('Need at least 2 players for a hand');
    this.blinds = blinds;
    this.deck = deck || new Deck();
    this.board = [];
    this.street = 'preflop';
    this.log = [];

    this.seats = players.map((p) => ({
      id: p.id,
      stack: p.stack,
      hole: [],
      folded: false,
      allIn: false,
      streetCommitted: 0, // chips in on the current street
      totalCommitted: 0, // chips in across the whole hand
      hasActed: false,
    }));
    this.n = this.seats.length;
    this.button = buttonIndex % this.n;

    this._postBlinds();
    this._dealHoleCards();

    // Preflop min raise is one big blind above the current bet.
    this.currentBet = blinds.bb;
    this.lastRaiseSize = blinds.bb;
    this.actorIndex = this._firstToActPreflop();
    this._settleIfActionClosed();
  }

  // --- Setup helpers ---------------------------------------------------------

  _postBlinds() {
    const sbPos = this.n === 2 ? this.button : (this.button + 1) % this.n;
    const bbPos = this.n === 2 ? (this.button + 1) % this.n : (this.button + 2) % this.n;
    this._commit(this.seats[sbPos], this.blinds.sb);
    this._commit(this.seats[bbPos], this.blinds.bb);
    this.sbPos = sbPos;
    this.bbPos = bbPos;
  }

  _dealHoleCards() {
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < this.n; i++) {
        const seat = this.seats[(this.button + 1 + i) % this.n];
        seat.hole.push(this.deck.deal());
      }
    }
  }

  _firstToActPreflop() {
    // Heads-up: button (== SB) acts first preflop. Otherwise UTG (left of BB).
    if (this.n === 2) return this.button;
    return (this.bbPos + 1) % this.n;
  }

  _firstToActPostflop() {
    // First non-folded player clockwise from the button (heads-up: the BB).
    let i = this.button;
    for (let k = 0; k < this.n; k++) {
      i = (i + 1) % this.n;
      if (!this.seats[i].folded && !this.seats[i].allIn) return i;
    }
    return -1;
  }

  // --- Chip movement ---------------------------------------------------------

  _commit(seat, amount) {
    const paid = Math.min(amount, seat.stack);
    seat.stack -= paid;
    seat.streetCommitted += paid;
    seat.totalCommitted += paid;
    if (seat.stack === 0) seat.allIn = true;
    return paid;
  }

  // --- Queries ---------------------------------------------------------------

  seat(id) {
    return this.seats.find((s) => s.id === id);
  }

  activeSeats() {
    return this.seats.filter((s) => !s.folded);
  }

  ableToAct() {
    return this.seats.filter((s) => !s.folded && !s.allIn);
  }

  currentActorId() {
    if (this.street === 'showdown' || this.street === 'complete') return null;
    if (this.actorIndex < 0) return null;
    return this.seats[this.actorIndex].id;
  }

  /** Legal actions for the current actor. Returns null if it's not their turn. */
  legalActions(id) {
    if (this.currentActorId() !== id) return null;
    const p = this.seat(id);
    const toCall = this.currentBet - p.streetCommitted;
    const callAmount = Math.min(toCall, p.stack);

    // A raise/bet is only "open" to a player who hasn't yet acted at this level;
    // a short all-in leaves hasActed=true, so it correctly forbids re-raising.
    const canOpen = p.stack > toCall && !p.hasActed;

    const acts = {
      toCall,
      canFold: true,
      canCheck: toCall === 0,
      canCall: toCall > 0 && p.stack > 0,
      callAmount,
      canBet: false,
      canRaise: false,
      minRaiseTo: 0,
      maxRaiseTo: p.streetCommitted + p.stack, // all-in total on this street
    };

    if (this.currentBet === 0) {
      acts.canBet = canOpen;
      acts.minRaiseTo = Math.min(this.blinds.bb, acts.maxRaiseTo);
    } else if (canOpen) {
      acts.canRaise = true;
      acts.minRaiseTo = Math.min(this.currentBet + this.lastRaiseSize, acts.maxRaiseTo);
    }
    return acts;
  }

  // --- Action application ----------------------------------------------------

  /**
   * Apply an action for player `id`.
   * @param {string} id
   * @param {{type:'fold'|'check'|'call'|'bet'|'raise'|'allin', amount?:number}} action
   *   For bet/raise, `amount` is the TOTAL street commitment to raise TO.
   */
  act(id, action) {
    const acts = this.legalActions(id);
    if (!acts) throw new Error(`Not ${id}'s turn to act`);
    const p = this.seat(id);

    switch (action.type) {
      case 'fold':
        p.folded = true;
        break;

      case 'check':
        if (!acts.canCheck) throw new Error('Cannot check facing a bet');
        break;

      case 'call': {
        if (!acts.canCall) throw new Error('Nothing to call');
        this._commit(p, acts.toCall);
        break;
      }

      case 'bet':
      case 'raise':
      case 'allin': {
        const target = action.type === 'allin' ? acts.maxRaiseTo : action.amount;
        this._applyBetOrRaise(p, acts, target);
        break;
      }

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }

    p.hasActed = true;
    this.log.push({ id, type: action.type, amount: action.amount ?? null, street: this.street });
    this._afterAction();
    return this.publicState();
  }

  _applyBetOrRaise(p, acts, target) {
    const isBet = this.currentBet === 0;
    const maxTo = acts.maxRaiseTo;
    if (target > maxTo) throw new Error('Cannot commit more chips than you have');

    const goingAllIn = target === maxTo;
    if (isBet) {
      if (!acts.canBet) throw new Error('Cannot bet right now');
      if (target < acts.minRaiseTo && !goingAllIn) throw new Error('Bet below minimum');
    } else {
      if (!acts.canRaise) throw new Error('Cannot raise right now');
      if (target < acts.minRaiseTo && !goingAllIn) throw new Error('Raise below minimum');
    }

    const increment = target - this.currentBet; // how much above the current bet
    this._commit(p, target - p.streetCommitted);

    // A full-size raise (or the opening bet) reopens betting: everyone else must
    // respond, so reset their hasActed. A short all-in does not reopen.
    if (increment >= this.lastRaiseSize) {
      this.lastRaiseSize = increment;
      for (const s of this.seats) {
        if (s !== p && !s.folded && !s.allIn) s.hasActed = false;
      }
    }
    this.currentBet = Math.max(this.currentBet, p.streetCommitted);
  }

  _afterAction() {
    // Everyone folded but one → hand over immediately, no showdown.
    if (this.activeSeats().length === 1) {
      this._finish();
      return;
    }
    if (this._advanceActor()) return; // someone still needs to act
    this._nextStreet();
  }

  /** Move actorIndex to the next player who still needs to act. */
  _advanceActor() {
    let i = this.actorIndex;
    for (let k = 0; k < this.n; k++) {
      i = (i + 1) % this.n;
      const s = this.seats[i];
      if (s.folded || s.allIn) continue;
      if (!s.hasActed || s.streetCommitted < this.currentBet) {
        this.actorIndex = i;
        return true;
      }
    }
    return false;
  }

  /** Called right after construction to handle blinds-only edge cases. */
  _settleIfActionClosed() {
    const actor = this.seats[this.actorIndex];
    if (!actor || actor.folded || actor.allIn) {
      if (!this._advanceActor()) this._nextStreet();
    }
  }

  _nextStreet() {
    // Reset per-street state.
    for (const s of this.seats) {
      s.streetCommitted = 0;
      s.hasActed = false;
    }
    this.currentBet = 0;
    this.lastRaiseSize = this.blinds.bb;

    if (this.street === 'preflop') { this.street = 'flop'; this._dealBoard(3); }
    else if (this.street === 'flop') { this.street = 'turn'; this._dealBoard(1); }
    else if (this.street === 'turn') { this.street = 'river'; this._dealBoard(1); }
    else if (this.street === 'river') { this._finish(); return; }

    // If at most one player can still act, deal out the rest with no betting.
    if (this.ableToAct().length <= 1) {
      for (const s of this.seats) s.hasActed = true;
      this._runOutBoard();
      this._finish();
      return;
    }
    this.actorIndex = this._firstToActPostflop();
  }

  _dealBoard(count) {
    for (let i = 0; i < count; i++) this.board.push(this.deck.deal());
  }

  /** Deal any remaining community cards when all action is done (all-in run-out). */
  _runOutBoard() {
    const target = 5;
    while (this.board.length < target) this.board.push(this.deck.deal());
  }

  // --- Showdown / payout -----------------------------------------------------

  _finish() {
    if (this.board.length < 5 && this.activeSeats().length > 1) this._runOutBoard();

    const active = this.activeSeats();
    let pots;
    let winnings;

    if (active.length === 1) {
      // Uncontested — the lone remaining player collects the whole pot, no reveal.
      pots = [{ amount: this.potTotal(), eligible: [active[0].id] }];
      winnings = new Map([[active[0].id, this.potTotal()]]);
    } else {
      const contributions = this.seats.map((s) => ({
        id: s.id, committed: s.totalCommitted, folded: s.folded,
      }));
      pots = buildPots(contributions);
      const scores = new Map();
      for (const s of active) {
        scores.set(s.id, evaluate([...s.hole, ...this.board]).score);
      }
      // Seat order left of the button, for odd-chip assignment.
      const seatOrder = [];
      for (let k = 1; k <= this.n; k++) seatOrder.push(this.seats[(this.button + k) % this.n].id);
      winnings = awardPots(pots, scores, seatOrder);
    }

    for (const s of this.seats) {
      const won = winnings.get(s.id) || 0;
      s.stack += won;
      s.won = won;
    }

    this.street = active.length === 1 ? 'complete' : 'showdown';
    this.pots = pots;
    this.results = {
      winnings: Object.fromEntries(winnings),
      showdown: active.length > 1,
      board: [...this.board],
      hands: active.length > 1
        ? active.map((s) => ({
            id: s.id,
            hole: s.hole,
            ...evaluate([...s.hole, ...this.board]),
          }))
        : [{ id: active[0].id, hole: active[0].hole }],
    };
    this.street = 'complete';
  }

  isComplete() {
    return this.street === 'complete';
  }

  // --- Serialization ---------------------------------------------------------

  potTotal() {
    return this.seats.reduce((sum, s) => sum + s.totalCommitted, 0);
  }

  /**
   * Public hand state. Hole cards are NOT included here — the Room layer adds
   * them per-viewer according to spectator-visibility rules.
   */
  publicState() {
    return {
      street: this.street,
      board: [...this.board],
      pot: this.potTotal(),
      currentBet: this.currentBet,
      button: this.seats[this.button].id,
      currentActor: this.currentActorId(),
      seats: this.seats.map((s) => ({
        id: s.id,
        stack: s.stack,
        streetCommitted: s.streetCommitted,
        totalCommitted: s.totalCommitted,
        folded: s.folded,
        allIn: s.allIn,
        won: s.won ?? 0,
      })),
      results: this.results || null,
    };
  }
}

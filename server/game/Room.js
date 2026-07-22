// =============================================================================
//  Room.js — one poker table: players, seating, host settings, spectators, and
//  the game loop that drives the engine (Hand.js) over multiple hands.
// =============================================================================
//  The Room is I/O-agnostic. It mutates its own state and calls `this.onChange`
//  whenever something visible changes; the socket layer responds by sending
//  each participant their own `stateFor(playerId)` view. Bot moves and the pause
//  between hands are scheduled through `_schedule`, which runs synchronously
//  when delays are 0 (used by tests) and via timers otherwise.
//
//  Card visibility is enforced HERE, at serialization time: hole cards a viewer
//  is not entitled to never leave the server.
// =============================================================================

import { Hand } from './Hand.js';
import { defaultSettings, normalizeSettings } from './settings.js';
import { pickBotName, resolveDifficulty, decide as botDecide } from './Bot.js';

let seq = 0;
const uid = (prefix) => `${prefix}:${Date.now().toString(36)}:${(seq++).toString(36)}`;

export class Room {
  constructor(code, opts = {}) {
    this.code = code;
    this.settings = normalizeSettings(defaultSettings(), opts.settings || {});
    this.seats = new Array(this.settings.maxSeats).fill(null);
    this.humans = new Map(); // playerId → human record
    this.hostId = null;
    this.phase = 'lobby'; // 'lobby' | 'playing' | 'ended'

    this.hand = null;
    this.buttonSeat = 0;
    this.handCount = 0;
    this.startedAt = null;
    this.lastResult = null;
    this.standings = null;
    this.bustOrder = []; // players in the order they busted (first out = index 0)
    this.actionTimer = null;    // per-turn clock handle (connected humans)
    this.actionDeadline = null; // timestamp the current actor must act by
    this.actionFeed = [];       // rolling log of readable actions for the UI feed
    this.feedSeq = 0;           // monotonic id so the client can detect new entries

    // Timing hooks (injectable for tests).
    this.now = opts.now || (() => Date.now());
    this.deckFactory = opts.deckFactory || null; // () => Deck, optional (tests)
    this.botDelayMs = opts.botDelayMs ?? 700;
    this.betweenHandsMs = opts.betweenHandsMs ?? 3500;
    // Safety backstop: no game runs forever (guards endless mode and any
    // pathological stalemate). Set absurdly high so real play never hits it.
    this.maxHands = opts.maxHands ?? 100_000;
    this.onChange = opts.onChange || (() => {});
    this._timers = new Set();
    this._syncQueue = [];
    this._draining = false;
  }

  // ===========================================================================
  //  Scheduling
  // ===========================================================================
  //  Zero-delay work (used by tests, and by 0-delay bot/next-hand config) is run
  //  through an iterative drain queue rather than recursing, so a long game can
  //  advance many hands without growing the call stack. Real delays use timers,
  //  which unwind the stack naturally.
  _schedule(fn, ms) {
    if (ms <= 0) {
      this._syncQueue.push(fn);
      this._drain();
      return;
    }
    const t = setTimeout(() => { this._timers.delete(t); fn(); }, ms);
    this._timers.add(t);
  }

  _drain() {
    if (this._draining) return;
    this._draining = true;
    try {
      while (this._syncQueue.length) this._syncQueue.shift()();
    } finally {
      this._draining = false;
    }
  }

  destroy() {
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    this._clearActionTimer();
  }

  // ===========================================================================
  //  Membership
  // ===========================================================================

  /** Join (or reconnect) a human. Returns their player record. */
  join({ name, playerId, socketId }) {
    if (playerId && this.humans.has(playerId)) {
      const h = this.humans.get(playerId);
      h.connected = true;
      h.socketId = socketId;
      if (name) h.name = name;
      this.onChange();
      return h;
    }
    const id = uid('p');
    const human = {
      id,
      name: name?.trim() || 'Player',
      socketId,
      connected: true,
      isHost: this.humans.size === 0,
      seatIndex: null,
      followSeat: null,
    };
    this.humans.set(id, human);
    if (human.isHost) this.hostId = id;

    // In the lobby, seat newcomers automatically into the lowest open seat.
    if (this.phase === 'lobby') {
      const open = this.seats.findIndex((s) => s === null);
      if (open !== -1) this._seatHuman(human, open);
    }
    this.onChange();
    return human;
  }

  disconnect(playerId) {
    const h = this.humans.get(playerId);
    if (!h) return;
    h.connected = false;
    // If it's their turn, don't let the table stall.
    this._driveActor();
    this.onChange();
  }

  leaveRoom(playerId) {
    const h = this.humans.get(playerId);
    if (!h) return;
    if (h.seatIndex != null && this.seats[h.seatIndex]?.id === playerId) {
      this.seats[h.seatIndex] = null;
    }
    this.humans.delete(playerId);
    if (playerId === this.hostId) this._reassignHost();
    this._driveActor();
    this.onChange();
  }

  _reassignHost() {
    const next = [...this.humans.values()].find((h) => h.connected) || [...this.humans.values()][0];
    this.hostId = next?.id || null;
    for (const h of this.humans.values()) h.isHost = h.id === this.hostId;
  }

  isEmpty() {
    return this.humans.size === 0;
  }

  // ===========================================================================
  //  Lobby actions (most are host-only or lobby-only)
  // ===========================================================================

  _requireHost(playerId) {
    if (playerId !== this.hostId) throw new Error('Only the host can do that');
  }
  _requireLobby() {
    if (this.phase !== 'lobby') throw new Error('Cannot change that once the game has started');
  }

  updateSettings(playerId, patch) {
    this._requireHost(playerId);
    this._requireLobby();
    const next = normalizeSettings(this.settings, patch);
    // Resizing seats: grow/shrink the seat array, preserving occupants.
    if (next.maxSeats !== this.seats.length) {
      const resized = new Array(next.maxSeats).fill(null);
      for (let i = 0; i < Math.min(next.maxSeats, this.seats.length); i++) resized[i] = this.seats[i];
      // Bump any humans/bots that fell outside the new size back to spectators.
      for (let i = next.maxSeats; i < this.seats.length; i++) {
        const s = this.seats[i];
        if (s?.kind === 'human') { const h = this.humans.get(s.id); if (h) h.seatIndex = null; }
      }
      this.seats = resized;
    }
    // Re-stack seated players to the new starting chips while still in lobby.
    for (const s of this.seats) if (s) s.stack = next.startingChips;
    this.settings = next;
    this.onChange();
  }

  takeSeat(playerId, seatIndex) {
    this._requireLobby();
    const h = this.humans.get(playerId);
    if (!h) throw new Error('Unknown player');
    if (seatIndex < 0 || seatIndex >= this.seats.length) throw new Error('Bad seat');
    if (this.seats[seatIndex]) throw new Error('Seat taken');
    if (h.seatIndex != null) this.seats[h.seatIndex] = null;
    this._seatHuman(h, seatIndex);
    this.onChange();
  }

  leaveSeat(playerId) {
    this._requireLobby();
    const h = this.humans.get(playerId);
    if (!h || h.seatIndex == null) return;
    this.seats[h.seatIndex] = null;
    h.seatIndex = null;
    this.onChange();
  }

  _seatHuman(human, seatIndex) {
    this.seats[seatIndex] = {
      index: seatIndex,
      kind: 'human',
      id: human.id,
      name: human.name,
      botDifficulty: null,
      stack: this.settings.startingChips,
      status: 'active',
      connected: true,
    };
    human.seatIndex = seatIndex;
  }

  addBot(playerId, seatIndex, difficulty) {
    this._requireHost(playerId);
    this._requireLobby();
    if (seatIndex < 0 || seatIndex >= this.seats.length) throw new Error('Bad seat');
    if (this.seats[seatIndex]) throw new Error('Seat taken');
    const usedNames = new Set(this._occupied().map((s) => s.name));
    this.seats[seatIndex] = {
      index: seatIndex,
      kind: 'bot',
      id: `bot:${seatIndex}`,
      name: pickBotName(usedNames),
      botDifficulty: difficulty,
      thinkBias: 0.8 + Math.random() * 0.4, // consistent per-bot speed (0.8–1.2×)
      stack: this.settings.startingChips,
      status: 'active',
      connected: true,
    };
    this.onChange();
  }

  removeBot(playerId, seatIndex) {
    this._requireHost(playerId);
    this._requireLobby();
    const s = this.seats[seatIndex];
    if (s?.kind === 'bot') this.seats[seatIndex] = null;
    this.onChange();
  }

  // ===========================================================================
  //  Game loop
  // ===========================================================================

  _occupied() {
    return this.seats.filter(Boolean);
  }
  _live() {
    return this.seats.filter((s) => s && s.stack > 0 && s.status !== 'busted');
  }

  startGame(playerId) {
    this._requireHost(playerId);
    this._requireLobby();
    if (this._occupied().length < 2) throw new Error('Need at least 2 players to start');
    this.phase = 'playing';
    this.handCount = 0;
    this.startedAt = this.now();
    // Button starts at the first occupied seat.
    this.buttonSeat = this.seats.findIndex(Boolean);
    this._startHand();
  }

  _startHand() {
    const live = this._live();
    if (live.length < 2) { this._endGame(); return; }

    // Ensure the button sits on a live seat, then find its index among participants.
    if (!this.seats[this.buttonSeat] || this.seats[this.buttonSeat].stack <= 0) {
      this.buttonSeat = this._nextLiveSeat(this.buttonSeat);
    }
    const participants = live.map((s) => ({ id: s.id, stack: s.stack }));
    const buttonIndex = participants.findIndex((p) => p.id === this.seats[this.buttonSeat].id);

    this.handCount += 1;
    this.lastResult = null;
    for (const s of this._occupied()) { s.folded = false; s.won = 0; }

    this.hand = new Hand({
      players: participants,
      buttonIndex,
      blinds: this._effectiveBlinds(),
      deck: this.deckFactory ? this.deckFactory() : undefined,
    });

    // Feed: mark the new hand and who posted the blinds.
    this._pushFeed(`— Hand #${this.handCount} —`);
    const sb = this.hand.seats[this.hand.sbPos];
    const bb = this.hand.seats[this.hand.bbPos];
    if (sb) this._pushFeed(`${this._name(sb.id)} posts small blind ${sb.streetCommitted}`);
    if (bb) this._pushFeed(`${this._name(bb.id)} posts big blind ${bb.streetCommitted}`);

    if (this.hand.isComplete()) { this._settleHand(); return; }
    this.onChange();
    this._driveActor();
  }

  /**
   * Blinds for the current hand, escalated if the host enabled a schedule.
   * Every `everyHands` hands the blinds multiply by `factor` (rounded).
   */
  _effectiveBlinds() {
    const { blinds, blindEscalation } = this.settings;
    if (!blindEscalation) return blinds;
    const levels = Math.floor((this.handCount - 1) / blindEscalation.everyHands);
    if (levels <= 0) return blinds;
    const mult = Math.pow(blindEscalation.factor, levels);
    return { sb: Math.max(1, Math.round(blinds.sb * mult)), bb: Math.max(2, Math.round(blinds.bb * mult)) };
  }

  _nextLiveSeat(from) {
    for (let k = 1; k <= this.seats.length; k++) {
      const i = (from + k) % this.seats.length;
      if (this.seats[i] && this.seats[i].stack > 0 && this.seats[i].status !== 'busted') return i;
    }
    return from;
  }

  /** Seat that owns the id currently to act, or null. */
  _actorSeat() {
    if (!this.hand || this.hand.isComplete()) return null;
    const id = this.hand.currentActorId();
    return this._occupied().find((s) => s.id === id) || null;
  }

  /**
   * Drive whoever is now to act: bots and disconnected humans are auto-played;
   * a connected human gets the action clock armed (if the host set one).
   */
  _driveActor() {
    this._clearActionTimer();
    const seat = this._actorSeat();
    if (!seat) return;
    const human = seat.kind === 'human' ? this.humans.get(seat.id) : null;
    const isBot = seat.kind === 'bot';
    const isAbsentHuman = human && !human.connected;

    if (isBot || isAbsentHuman) {
      this._schedule(() => {
        // Re-check: state may have moved on by the time the timer fires.
        const cur = this._actorSeat();
        if (!cur || cur.id !== seat.id) return;
        const legal = this.hand.legalActions(seat.id);
        const action = isBot
          ? botDecide({ legal, difficulty: seat.botDifficulty, hand: this.hand, seat })
          : (legal.canCheck ? { type: 'check' } : { type: 'fold' }); // absent human
        this._applyAndContinue(seat.id, action);
      }, isBot ? this._botThinkMs(seat) : Math.min(this.botDelayMs, 400));
      return;
    }

    // Connected human: arm the per-turn clock if configured. On expiry we
    // auto-check when free, otherwise fold — the standard "time bank ran out".
    if (this.settings.actionTimeoutSec) {
      const ms = this.settings.actionTimeoutSec * 1000;
      this.actionDeadline = this.now() + ms;
      this.actionTimer = setTimeout(() => {
        this.actionTimer = null;
        const cur = this._actorSeat();
        if (!cur || cur.id !== seat.id) return;
        const legal = this.hand.legalActions(seat.id);
        this._applyAndContinue(seat.id, legal.canCheck ? { type: 'check' } : { type: 'fold' });
      }, ms);
      // Re-broadcast so clients receive the freshly-armed deadline (callers
      // broadcast BEFORE driving the actor, so the deadline wasn't in that view).
      this.onChange();
    } else {
      this.actionDeadline = null;
    }
  }

  _clearActionTimer() {
    if (this.actionTimer) { clearTimeout(this.actionTimer); this.actionTimer = null; }
    this.actionDeadline = null;
  }

  /**
   * How long a bot "thinks" before acting — randomized, longer for stronger
   * players, with a per-seat bias (some bots are consistently slower) and the
   * occasional long tank. Returns 0 in sync test mode so tests stay instant.
   */
  _botThinkMs(seat) {
    if (this.botDelayMs <= 0) return 0;
    const ranges = {
      beginner: [600, 1600],
      intermediate: [1100, 2800],
      super: [1800, 4000], // deliberates the longest
    };
    const style = resolveDifficulty(seat.botDifficulty, seat.id);
    const [lo, hi] = ranges[style] || ranges.intermediate;
    let t = (lo + Math.random() * (hi - lo)) * (seat.thinkBias || 1);
    if (Math.random() < 0.12) t += 1200 + Math.random() * 2200; // occasional tank
    return Math.round(t);
  }

  /** Apply a validated action then continue the loop (bot chaining / settle). */
  _applyAndContinue(id, action) {
    // Describe the action for the UI feed BEFORE applying (so we can read the
    // pre-action legal amounts, e.g. how much a call is for).
    const seat = this._occupied().find((s) => s.id === id);
    const legal = this.hand.legalActions(id);
    if (seat && legal) this._pushFeed(this._actionText(seat.name, action, legal, this.hand.seat(id)));

    this.hand.act(id, action);
    if (this.hand.isComplete()) { this._settleHand(); return; }
    this.onChange();
    this._driveActor();
  }

  // --- Action feed -----------------------------------------------------------
  _pushFeed(text) {
    if (!text) return;
    this.feedSeq += 1;
    this.actionFeed.push({ seq: this.feedSeq, text });
    if (this.actionFeed.length > 20) this.actionFeed.shift();
  }

  _name(id) {
    const s = this._occupied().find((x) => x.id === id);
    return s ? s.name : (this.lastResult?.names?.[id] || 'Player');
  }

  /** Human-readable text for one action, e.g. "Velma raises to 60". */
  _actionText(name, action, legal, hseat) {
    const allInBet = action.amount != null && action.amount >= legal.maxRaiseTo;
    switch (action.type) {
      case 'fold': return `${name} folds`;
      case 'check': return `${name} checks`;
      case 'call': {
        const allIn = hseat && legal.callAmount >= hseat.stack && hseat.stack > 0;
        return `${name} calls ${legal.callAmount}${allIn ? ' (all in)' : ''}`;
      }
      case 'bet': return `${name} bets ${action.amount}${allInBet ? ' (all in)' : ''}`;
      case 'raise': return `${name} raises to ${action.amount}${allInBet ? ' (all in)' : ''}`;
      case 'allin': return `${name} is all in (${legal.maxRaiseTo})`;
      default: return `${name} acts`;
    }
  }

  /** Human/seat action entry point. */
  act(playerId, action) {
    if (this.phase !== 'playing' || !this.hand || this.hand.isComplete()) {
      throw new Error('No hand in progress');
    }
    if (this.hand.currentActorId() !== playerId) throw new Error('Not your turn');
    this._applyAndContinue(playerId, action);
  }

  _settleHand() {
    this._clearActionTimer();
    // Copy final stacks from the engine back onto the room seats.
    for (const hs of this.hand.seats) {
      const seat = this._occupied().find((s) => s.id === hs.id);
      if (seat) { seat.stack = hs.stack; seat.won = hs.won || 0; }
    }
    // Enrich the result with player names now, while their seats still exist
    // (busts happen after the pause, which would otherwise drop the names).
    const names = {};
    for (const hs of this.hand.seats) {
      const seat = this._occupied().find((s) => s.id === hs.id);
      names[hs.id] = seat ? seat.name : 'Player';
    }
    this.lastResult = { ...this.hand.results, names };

    // Feed: announce the winner(s) and the amount they won.
    for (const [id, amt] of Object.entries(this.lastResult.winnings || {})) {
      if (amt > 0) this._pushFeed(`${names[id] || 'Player'} wins ${amt}`);
    }
    this.onChange();

    // Pause on the result, then clean up and either continue or end.
    this._schedule(() => this._afterHand(), this.betweenHandsMs);
  }

  _afterHand() {
    // Bust out anyone with no chips: bots vanish, humans become spectators.
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      if (s && s.stack <= 0) {
        this.bustOrder.push({ id: s.id, name: s.name, kind: s.kind });
        if (s.kind === 'human') { const h = this.humans.get(s.id); if (h) h.seatIndex = null; }
        this.seats[i] = null;
      }
    }

    if (this._checkEnd()) { this._endGame(); return; }

    this.buttonSeat = this._nextLiveSeat(this.buttonSeat);
    this._startHand();
  }

  /** True when the configured end condition (or an unplayable table) is reached. */
  _checkEnd() {
    const live = this._live();
    if (live.length < 2) return true; // can't play on
    if (this.handCount >= this.maxHands) return true; // safety backstop

    const ec = this.settings.endCondition;
    switch (ec.type) {
      case 'lastStanding': return live.length <= 1;
      case 'targetChips': return live.some((s) => s.stack >= ec.targetChips);
      case 'numHands': return this.handCount >= ec.numHands;
      case 'timeLimit': return this.now() - this.startedAt >= ec.minutes * 60_000;
      case 'endless': return false;
      default: return false;
    }
  }

  _endGame() {
    this.phase = 'ended';
    this.hand = null;
    // Standings: survivors by chips desc first, then busted players in reverse
    // bust order (last to bust finishes higher).
    const survivors = this._occupied()
      .map((s) => ({ id: s.id, name: s.name, kind: s.kind, stack: s.stack }))
      .sort((a, b) => b.stack - a.stack);
    const busted = [...this.bustOrder].reverse().map((b) => ({ ...b, stack: 0 }));
    this.standings = [...survivors, ...busted];
    this.onChange();
  }

  // ===========================================================================
  //  Spectator follow (follow-one mode; changeable only between hands)
  // ===========================================================================
  followSeat(playerId, seatIndex) {
    const h = this.humans.get(playerId);
    if (!h) return;
    if (this.settings.spectatorVisibility !== 'followOne') return;
    const midHand = this.hand && !this.hand.isComplete();
    if (midHand) throw new Error('You can only change who you follow between hands');
    h.followSeat = (seatIndex == null) ? null : seatIndex;
    this.onChange();
  }

  // ===========================================================================
  //  Serialization — the ONLY place hole cards are exposed, per visibility rules
  // ===========================================================================

  _canSeeHole(viewer, seat) {
    if (!seat || seat.kind == null) return false;
    const hs = this.hand?.seat(seat.id);
    if (!hs || hs.hole.length === 0) return false;

    // Showdown: reveal exactly the hands that were shown down (folders stay hidden).
    if (this.hand?.isComplete() && this.lastResult?.showdown) {
      return this.lastResult.hands.some((h) => h.id === seat.id);
    }

    const viewerSeated = viewer && viewer.seatIndex != null;
    // Your own cards, always.
    if (viewerSeated && this.seats[viewer.seatIndex]?.id === seat.id) return true;
    // Seated players otherwise see only their own cards.
    if (viewerSeated) return false;

    // Spectators (incl. busted players) follow the host's visibility setting.
    switch (this.settings.spectatorVisibility) {
      case 'open': return !hs.folded;
      case 'followOne': return viewer?.followSeat === seat.index && !hs.folded;
      case 'publicOnly':
      default: return false;
    }
  }

  /** Build the state object tailored to one viewer. */
  stateFor(playerId) {
    const viewer = this.humans.get(playerId) || null;
    const hs = this.hand ? this.hand.publicState() : null;
    const handSeatById = new Map((hs?.seats || []).map((s) => [s.id, s]));

    const seats = this.seats.map((seat, index) => {
      if (!seat) return { index, empty: true };
      const dyn = handSeatById.get(seat.id);
      const view = {
        index,
        empty: false,
        id: seat.id, // needed client-side to match "you"/host/winner; safe to expose
        kind: seat.kind,
        name: seat.name,
        botDifficulty: seat.botDifficulty,
        // During a live hand the engine seat holds the authoritative remaining
        // stack (chips already committed have left it); the room seat only
        // catches up at settle. Prefer the live value so the UI shows chips
        // leaving the stack as bets are made.
        stack: dyn ? dyn.stack : seat.stack,
        status: seat.status,
        connected: seat.connected,
        isButton: index === this.buttonSeat && this.phase === 'playing',
        won: seat.won || 0,
      };
      if (dyn) {
        view.folded = dyn.folded;
        view.allIn = dyn.allIn;
        view.streetCommitted = dyn.streetCommitted;
        view.isCurrentActor = hs.currentActor === seat.id;
      }
      if (this._canSeeHole(viewer, seat)) {
        view.hole = this.hand.seat(seat.id).hole;
      }
      return view;
    });

    const you = viewer ? {
      playerId: viewer.id,
      name: viewer.name,
      seatIndex: viewer.seatIndex,
      isHost: viewer.id === this.hostId,
      isSpectator: viewer.seatIndex == null,
      followSeat: viewer.followSeat,
    } : null;

    // Legal actions only for the actor themself.
    let legal = null;
    if (hs && hs.currentActor && viewer && this.seats[viewer.seatIndex]?.id === hs.currentActor) {
      legal = this.hand.legalActions(hs.currentActor);
    }

    return {
      code: this.code,
      phase: this.phase,
      settings: this.settings,
      hostId: this.hostId,
      handCount: this.handCount,
      seats,
      you,
      hand: hs ? {
        street: hs.street,
        board: hs.board,
        pot: hs.pot,
        currentBet: hs.currentBet,
        currentActor: hs.currentActor,
        button: hs.button,
      } : null,
      blinds: this._effectiveBlinds(),
      legal,
      feed: this.actionFeed,
      result: this.lastResult,
      standings: this.standings,
      timeRemainingMs: this._timeRemaining(),
      // How long the current actor has left on the clock (null = no clock / not armed).
      actionRemainingMs: this.actionDeadline ? Math.max(0, this.actionDeadline - this.now()) : null,
      actionTimeoutSec: this.settings.actionTimeoutSec,
      spectatorCount: [...this.humans.values()].filter((h) => h.seatIndex == null).length,
    };
  }

  _timeRemaining() {
    if (this.settings.endCondition.type !== 'timeLimit' || this.phase !== 'playing') return null;
    const end = this.startedAt + this.settings.endCondition.minutes * 60_000;
    return Math.max(0, end - this.now());
  }
}

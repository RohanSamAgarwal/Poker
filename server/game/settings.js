// =============================================================================
//  settings.js — host-configurable room settings: defaults + validation.
// =============================================================================

export const VARIANTS = ['holdem']; // more later; the engine is built to extend
export const BOT_DIFFICULTIES = ['beginner', 'intermediate', 'super', 'mixed'];
export const SPECTATOR_MODES = ['open', 'followOne', 'publicOnly'];
export const END_TYPES = ['lastStanding', 'targetChips', 'numHands', 'timeLimit', 'endless'];

export const MAX_SEATS = 6;

export function defaultSettings() {
  return {
    variant: 'holdem',
    startingChips: 1000,
    blinds: { sb: 10, bb: 20 },
    // Optional escalation: raise blinds every N hands by a multiplier (Phase 6
    // wires the timing; the shape lives here so settings validate up front).
    blindEscalation: null, // e.g. { everyHands: 10, factor: 2 }
    maxSeats: 6,
    endCondition: { type: 'lastStanding' },
    spectatorVisibility: 'publicOnly',
    actionTimeoutSec: null, // null = no clock
  };
}

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

/**
 * Merge partial settings over the current settings and validate/normalize.
 * Throws on hard errors (bad enums); clamps numeric ranges silently.
 */
export function normalizeSettings(current, patch = {}) {
  const s = { ...current, ...patch };
  if (patch.blinds) s.blinds = { ...current.blinds, ...patch.blinds };
  if (patch.endCondition) s.endCondition = { ...current.endCondition, ...patch.endCondition };

  if (!VARIANTS.includes(s.variant)) throw new Error(`Unknown variant: ${s.variant}`);
  if (!SPECTATOR_MODES.includes(s.spectatorVisibility)) {
    throw new Error(`Unknown spectator mode: ${s.spectatorVisibility}`);
  }
  if (!END_TYPES.includes(s.endCondition.type)) {
    throw new Error(`Unknown end condition: ${s.endCondition.type}`);
  }

  s.maxSeats = clampInt(s.maxSeats, 2, MAX_SEATS, 6);
  s.startingChips = clampInt(s.startingChips, 100, 10_000_000, 1000);

  let bb = clampInt(s.blinds.bb, 2, s.startingChips, 20);
  let sb = clampInt(s.blinds.sb, 1, bb, Math.floor(bb / 2));
  s.blinds = { sb, bb };

  // End-condition parameters.
  const ec = s.endCondition;
  if (ec.type === 'targetChips') {
    ec.targetChips = clampInt(ec.targetChips, s.startingChips + 1, 1_000_000_000, s.startingChips * s.maxSeats);
  }
  if (ec.type === 'numHands') {
    ec.numHands = clampInt(ec.numHands, 1, 100_000, 20);
  }
  if (ec.type === 'timeLimit') {
    ec.minutes = clampInt(ec.minutes, 1, 1440, 15);
  }

  if (s.actionTimeoutSec != null) s.actionTimeoutSec = clampInt(s.actionTimeoutSec, 5, 300, 30);

  if (s.blindEscalation) {
    s.blindEscalation = {
      everyHands: clampInt(s.blindEscalation.everyHands, 1, 100_000, 10),
      factor: Math.min(10, Math.max(1.1, Number(s.blindEscalation.factor) || 2)),
    };
  }
  return s;
}

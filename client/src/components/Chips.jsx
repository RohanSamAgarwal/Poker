// =============================================================================
//  Chips.jsx — casino chip visuals (adapted from the Blackjack game).
// =============================================================================
//  Chip: a clickable tray chip. MiniChip: a small chip for stacks/piles.
//  ChipStack: breaks an amount into denominated stacks. ChipPile: a compact,
//  semi-random decorative pile (used for a player's total stack).
// =============================================================================

export const CHIP_DENOMS = [1, 5, 25, 100, 500, 1000];

// Per-denomination colors: bg → edge gradient, acc(ent) ring, text.
export const CHIP_COLORS = {
  1:    { bg: '#f0ece0', edge: '#b8a88c', acc: '#d4af37', text: '#5a4a2e' },
  5:    { bg: '#cc3333', edge: '#8a1e1e', acc: '#ff6666', text: '#ffffff' },
  25:   { bg: '#28a745', edge: '#145a32', acc: '#58d68d', text: '#ffffff' },
  100:  { bg: '#2c1650', edge: '#120828', acc: '#9b59b6', text: '#f1c40f' },
  500:  { bg: '#7c3aed', edge: '#4a2296', acc: '#c4b5fd', text: '#ffffff' },
  1000: { bg: '#c99a2e', edge: '#8a6a17', acc: '#ffe08a', text: '#3a2c05' },
};

export function chipLabel(v) {
  if (v >= 1000) return `${v % 1000 === 0 ? v / 1000 : (v / 1000).toFixed(1)}K`;
  return String(v);
}

// Greedy breakdown of an amount into available denominations.
export function breakIntoChips(amount) {
  const out = [];
  let rem = Math.round(amount);
  for (let i = CHIP_DENOMS.length - 1; i >= 0; i--) {
    while (rem >= CHIP_DENOMS[i]) { out.push(CHIP_DENOMS[i]); rem -= CHIP_DENOMS[i]; }
  }
  return out;
}

// Full detailed chip face (used in the betting tray).
export function Chip({ value, size = 60, onClick, disabled = false }) {
  const c = CHIP_COLORS[value] || CHIP_COLORS[1];
  return (
    <button
      className="pchip"
      onClick={onClick ? () => onClick(value) : undefined}
      disabled={disabled}
      style={{ width: size, height: size, opacity: disabled ? 0.35 : 1 }}
      aria-label={`${value} chip`}
    >
      <span className="pchip-face" style={{ background: `radial-gradient(circle at 38% 32%, ${c.bg}, ${c.edge})` }} />
      <span className="pchip-ring" style={{ borderColor: `${c.acc}88` }} />
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <span key={deg} className="pchip-dash" style={{
          background: `${c.acc}bb`,
          top: `${50 - 43 * Math.cos((deg * Math.PI) / 180)}%`,
          left: `${50 + 43 * Math.sin((deg * Math.PI) / 180)}%`,
        }} />
      ))}
      <span className="pchip-label" style={{ color: c.text, borderColor: `${c.acc}66`, fontSize: size * 0.28 }}>{chipLabel(value)}</span>
    </button>
  );
}

export function MiniChip({ value, size = 26, style = {} }) {
  const c = CHIP_COLORS[value] || CHIP_COLORS[1];
  return (
    <span className="mchip" style={{
      width: size, height: size,
      background: `radial-gradient(circle at 38% 32%, ${c.bg}, ${c.edge})`,
      borderColor: c.edge, color: c.text, fontSize: size * 0.34, ...style,
    }}>
      <span className="mchip-ring" style={{ borderColor: `${c.acc}55` }} />
      {chipLabel(value)}
    </span>
  );
}

// A bet amount rendered as denominated, stacked chips (with drop animation).
export function ChipStack({ amount, chips, size = 26, animate = true, style = {} }) {
  const all = chips && chips.length ? chips : breakIntoChips(amount);
  if (!all.length) return null;
  const groups = [];
  const seen = {};
  for (const v of all) { if (!seen[v]) { seen[v] = { val: v, count: 0 }; groups.push(seen[v]); } seen[v].count++; }
  const overlap = Math.max(3, Math.round(size * 0.16));
  let idx = 0;
  return (
    <span className="chip-stack" style={{ gap: Math.max(2, Math.round(size * 0.12)), ...style }}>
      {groups.map((g) => {
        const shown = Math.min(g.count, 6);
        return (
          <span key={g.val} className="chip-col" style={{ width: size, height: (shown - 1) * overlap + size }}>
            {Array.from({ length: shown }).map((_, i) => {
              const ci = idx++;
              return (
                <MiniChip key={i} value={g.val} size={size} style={{
                  position: i === 0 ? 'relative' : 'absolute',
                  bottom: i === 0 ? undefined : i * overlap, left: i === 0 ? undefined : 0, zIndex: i,
                  animation: animate ? `chipDrop .34s cubic-bezier(.34,1.56,.64,1) ${ci * 0.04}s both` : 'none',
                }} />
              );
            })}
            {g.count > 1 && <span className="chip-count">×{g.count}</span>}
          </span>
        );
      })}
    </span>
  );
}

// Compact decorative pile for a player's total stack: a few overlapping chips
// chosen semi-randomly (seeded by the seat) — flavor, not an exact breakdown.
export function ChipPile({ amount, seed = 0, size = 22 }) {
  if (amount <= 0) return null;
  // Pick a few denominations near the stack's magnitude for visual variety.
  const affordable = CHIP_DENOMS.filter((d) => d <= amount);
  const palette = affordable.slice(-3).length ? affordable.slice(-3) : [CHIP_DENOMS[0]];
  const n = 3 + (seed % 3); // 3–5 chips
  const chips = Array.from({ length: n }, (_, i) => palette[(seed + i) % palette.length]);
  return (
    <span className="chip-pile" style={{ width: size + (n - 1) * 4, height: size }}>
      {chips.map((v, i) => (
        <MiniChip key={i} value={v} size={size} style={{
          position: 'absolute', left: i * 4, bottom: (i % 2) * 2, zIndex: i,
        }} />
      ))}
    </span>
  );
}

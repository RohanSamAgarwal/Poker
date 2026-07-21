// =============================================================================
//  sound.js — lightweight synthesized sound effects (Web Audio API).
// =============================================================================
//  All sounds are generated on the fly (oscillators + noise bursts), so there
//  are no audio files to bundle or fetch. A global on/off flag is persisted to
//  localStorage; browsers require a user gesture before audio can start, so the
//  AudioContext is created/resumed on the first interaction and on enable.
// =============================================================================

const LS_KEY = 'poker:sound';
let ctx = null;
let enabled = load();
const listeners = new Set();

function load() {
  const v = localStorage.getItem(LS_KEY);
  return v === null ? true : v === '1';
}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Resume audio on the first user gesture (autoplay policy).
if (typeof window !== 'undefined') {
  const kick = () => { ac(); window.removeEventListener('pointerdown', kick); window.removeEventListener('keydown', kick); };
  window.addEventListener('pointerdown', kick);
  window.addEventListener('keydown', kick);
}

export function isEnabled() { return enabled; }
export function setEnabled(v) {
  enabled = v;
  localStorage.setItem(LS_KEY, v ? '1' : '0');
  listeners.forEach((fn) => fn(v));
  if (v) { ac(); sfx.click(); }
}
export function onSoundChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// A single enveloped oscillator note.
function tone({ freq = 440, dur = 0.12, type = 'sine', gain = 0.18, slideTo = null, delay = 0 }) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(c.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.03);
}

// A short decaying noise burst (for card swishes / chip rattle), band-filtered.
function noise({ dur = 0.12, gain = 0.14, hp = 1000, lp = 7000, delay = 0 }) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n); // decay
  const src = c.createBufferSource(); src.buffer = buf;
  const hpf = c.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = hp;
  const lpf = c.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = lp;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(hpf); hpf.connect(lpf); lpf.connect(g); g.connect(c.destination);
  src.start(t0);
}

// Guard every effect on the enabled flag.
const on = (fn) => (...a) => { if (enabled) fn(...a); };

export const sfx = {
  deal: on(() => noise({ dur: 0.14, gain: 0.11, hp: 1300, lp: 7500 })),
  flip: on(() => noise({ dur: 0.09, gain: 0.13, hp: 1800, lp: 9500 })),
  // chips: two quick bright ticks
  chip: on(() => { tone({ freq: 1500, dur: 0.045, type: 'triangle', gain: 0.16 }); tone({ freq: 2100, dur: 0.05, type: 'triangle', gain: 0.11, delay: 0.045 }); }),
  check: on(() => tone({ freq: 190, dur: 0.11, type: 'sine', gain: 0.22 })),
  fold: on(() => tone({ freq: 320, dur: 0.2, type: 'sine', gain: 0.14, slideTo: 150 })),
  // your-turn: a friendly two-note chime
  yourTurn: on(() => { tone({ freq: 660, dur: 0.14, type: 'sine', gain: 0.2 }); tone({ freq: 988, dur: 0.18, type: 'sine', gain: 0.18, delay: 0.13 }); }),
  // win: short rising arpeggio
  win: on(() => { [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'triangle', gain: 0.18, delay: i * 0.085 })); }),
  click: on(() => tone({ freq: 760, dur: 0.03, type: 'square', gain: 0.06 })),
};

# Poker

Multiplayer **No-Limit Texas Hold'em** — a self-hosted Kamino game in the same
mould as Plunder: the first visitor becomes the host, configures the table, and
shares a room code for others to join. Up to 6 seats per room; the server runs
many rooms at once.

## Status

Built in phases:

| Phase | Scope | State |
|------:|-------|-------|
| 1 | Repo scaffold + container | ✅ done |
| 2 | Engine core (deck, hand eval, side pots, betting) — unit tested | ✅ done |
| 3 | Room manager, host lobby, spectators, socket protocol | ✅ done |
| 4 | Table UI (human play loop) + brand card-back easter egg | ✅ done |
| 5 | AI bots (beginner / intermediate / super computer / mixed) | ✅ done |
| 6 | End conditions + spectators + timers + blind escalation | ✅ done |
| 7 | Polish (animations, reconnect, brand watermark) | ✅ done |
| 8 | Wire into homeserver + push to GitHub | ✅ done |

## Architecture

- **Server** — Express + Socket.IO (`server/`). Authoritative game state, all in
  memory (rooms are ephemeral). Serves the built client on one port (`3003`).
  - `server/game/` — the poker engine: `Deck`, `handEval`, `Pot` (main + side
    pots), `Hand` (full hand state machine). Pure, no I/O, fully unit-tested.
- **Client** — React + Vite (`client/`), served under base path `/poker/`.
- **Deploy** — its own container, path-routed at `/poker/` behind Caddy, wired
  into the `homeserver` compose/Caddy/deploy pipeline (Phase 8).

## Develop

```bash
npm install                 # server deps
npm test                    # run the engine test suite (node:test)

# Local run (two terminals):
npm run start               # server on :3003 (serves built client)
npm run dev:client          # Vite dev server on :5173 with socket proxy
```

## Design decisions

See the engine modules for the authoritative rules. Key correctness points that
are unit-tested: 7-card best-5 evaluation with full tiebreakers and the wheel
straight; layered side pots with odd-chip assignment by seat order; No-Limit
min-raise and the short-all-in "no reopen" rule; chip conservation.

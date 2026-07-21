import { useState } from 'react';
import { BOT_LABELS, END_LABELS, SPEC_LABELS } from '../labels.js';

// Pre-game room: share the code, arrange seats/bots, host configures the table.
export default function Lobby({ state, actions }) {
  const { code, settings, seats, you, hostId } = state;
  const isHost = you?.isHost;
  const [copied, setCopied] = useState(false);
  const [botDiff, setBotDiff] = useState('intermediate');

  const occupied = seats.filter((s) => !s.empty).length;
  const set = (patch) => actions.updateSettings(patch);

  const copyCode = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <main className="shell lobby">
      <div className="lobby-head">
        <div>
          <div className="eyebrow">Room code</div>
          <button className="room-code" onClick={copyCode} title="Copy to share">
            {code} <span className="copy-hint">{copied ? 'copied!' : 'copy'}</span>
          </button>
        </div>
        <div className="lobby-meta">
          <span>{occupied} / {settings.maxSeats} seated</span>
          {you?.isSpectator && <span className="tag">spectating</span>}
        </div>
      </div>

      <section className="card seatmap">
        <h2>Seats</h2>
        <ul className="seat-list">
          {seats.map((seat) => (
            <li key={seat.index} className={`seat-row ${seat.empty ? 'empty' : ''}`}>
              <span className="seat-num">{seat.index + 1}</span>
              {seat.empty ? (
                <>
                  <span className="seat-open">open</span>
                  <span className="seat-actions">
                    {you?.isSpectator && (
                      <button className="btn tiny" onClick={() => actions.takeSeat(seat.index)}>Sit here</button>
                    )}
                    {isHost && (
                      <button className="btn tiny ghost" onClick={() => actions.addBot(seat.index, botDiff)}>
                        + Bot
                      </button>
                    )}
                  </span>
                </>
              ) : (
                <>
                  <span className="seat-name">
                    {seat.name}
                    {seat.id === hostId && <span className="tag host">host</span>}
                    {seat.kind === 'bot' && <span className="tag bot">{BOT_LABELS[seat.botDifficulty]}</span>}
                    {seat.id === you?.playerId && <span className="tag you">you</span>}
                  </span>
                  <span className="seat-actions">
                    {seat.kind === 'bot' && isHost && (
                      <button className="btn tiny ghost" onClick={() => actions.removeBot(seat.index)}>Remove</button>
                    )}
                    {seat.id === you?.playerId && (
                      <button className="btn tiny ghost" onClick={() => actions.leaveSeat()}>Stand up</button>
                    )}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
        {isHost && (
          <label className="field inline">
            <span>New bot difficulty</span>
            <select value={botDiff} onChange={(e) => setBotDiff(e.target.value)}>
              {Object.entries(BOT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        )}
      </section>

      <section className="card settings">
        <h2>Table settings {!isHost && <span className="tag">host controls</span>}</h2>
        <fieldset disabled={!isHost} className="settings-grid">
          <label className="field">
            <span>Starting chips</span>
            <input type="number" min="100" step="100" defaultValue={settings.startingChips}
              onBlur={(e) => set({ startingChips: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>Small blind</span>
            <input type="number" min="1" defaultValue={settings.blinds.sb}
              onBlur={(e) => set({ blinds: { sb: Number(e.target.value) } })} />
          </label>
          <label className="field">
            <span>Big blind</span>
            <input type="number" min="2" defaultValue={settings.blinds.bb}
              onBlur={(e) => set({ blinds: { bb: Number(e.target.value) } })} />
          </label>
          <label className="field">
            <span>Max seats</span>
            <select value={settings.maxSeats} onChange={(e) => set({ maxSeats: Number(e.target.value) })}>
              {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>

          <label className="field">
            <span>End condition</span>
            <select value={settings.endCondition.type}
              onChange={(e) => set({ endCondition: { type: e.target.value } })}>
              {Object.entries(END_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {settings.endCondition.type === 'targetChips' && (
            <label className="field">
              <span>Target chips</span>
              <input type="number" defaultValue={settings.endCondition.targetChips || settings.startingChips * 2}
                onBlur={(e) => set({ endCondition: { type: 'targetChips', targetChips: Number(e.target.value) } })} />
            </label>
          )}
          {settings.endCondition.type === 'numHands' && (
            <label className="field">
              <span>Number of hands</span>
              <input type="number" min="1" defaultValue={settings.endCondition.numHands || 20}
                onBlur={(e) => set({ endCondition: { type: 'numHands', numHands: Number(e.target.value) } })} />
            </label>
          )}
          {settings.endCondition.type === 'timeLimit' && (
            <label className="field">
              <span>Minutes</span>
              <input type="number" min="1" defaultValue={settings.endCondition.minutes || 15}
                onBlur={(e) => set({ endCondition: { type: 'timeLimit', minutes: Number(e.target.value) } })} />
            </label>
          )}

          <label className="field">
            <span>Spectators can see</span>
            <select value={settings.spectatorVisibility}
              onChange={(e) => set({ spectatorVisibility: e.target.value })}>
              {Object.entries(SPEC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Action timer (sec)</span>
            <input type="number" min="0" placeholder="off" defaultValue={settings.actionTimeoutSec || ''}
              onBlur={(e) => set({ actionTimeoutSec: e.target.value ? Number(e.target.value) : null })} />
          </label>
          <label className="field">
            <span>Blinds double every</span>
            <select
              value={settings.blindEscalation ? String(settings.blindEscalation.everyHands) : 'off'}
              onChange={(e) => set({
                blindEscalation: e.target.value === 'off' ? null : { everyHands: Number(e.target.value), factor: 2 },
              })}
            >
              <option value="off">Never (fixed)</option>
              <option value="5">5 hands</option>
              <option value="10">10 hands</option>
              <option value="15">15 hands</option>
            </select>
          </label>
        </fieldset>
      </section>

      <div className="lobby-foot">
        {isHost ? (
          <button className="btn primary big" disabled={occupied < 2} onClick={() => actions.startGame()}>
            {occupied < 2 ? 'Need 2+ players' : 'Start game'}
          </button>
        ) : (
          <p className="muted">Waiting for the host to start…</p>
        )}
        <button className="btn ghost" onClick={() => actions.leaveRoom()}>Leave room</button>
      </div>
    </main>
  );
}

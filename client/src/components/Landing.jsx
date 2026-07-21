import { useState } from 'react';
import RSACube from './RSACube.jsx';

// Entry screen: pick a name, then create a new table or join one by code.
export default function Landing({ onCreate, onJoin, connected }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => { setBusy(true); await onCreate(name.trim() || 'Host'); setBusy(false); };
  const join = async () => { setBusy(true); await onJoin(code.trim(), name.trim() || 'Player'); setBusy(false); };

  return (
    <main className="shell landing">
      <header className="brand">
        <RSACube size={40} color="var(--violet-bright)" />
        <h1>Poker</h1>
      </header>
      <p className="tagline">No-Limit Texas Hold’em · self-hosted on Kamino</p>

      <section className="card">
        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rohan"
            maxLength={20}
          />
        </label>

        <button className="btn primary" disabled={!connected || busy} onClick={create}>
          Create a table
        </button>

        <div className="divider"><span>or join one</span></div>

        <div className="join-row">
          <input
            className="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="CODE"
            maxLength={4}
          />
          <button className="btn" disabled={!connected || busy || code.length < 4} onClick={join}>
            Join
          </button>
        </div>
      </section>

      {!connected && <p className="muted">Connecting to the server…</p>}
    </main>
  );
}

// Final standings overlay shown when the room's end condition is reached.
export default function GameOver({ state, actions }) {
  const standings = state.standings || [];
  const isHost = state.you?.isHost;
  return (
    <div className="overlay">
      <div className="overlay-card">
        <h2>Game over</h2>
        <ol className="standings">
          {standings.map((s, i) => (
            <li key={s.id} className={i === 0 ? 'first' : ''}>
              <span className="place">{i + 1}</span>
              <span className="who">{s.name}{s.id === state.you?.playerId && ' (you)'}</span>
              <span className="chips">{s.stack.toLocaleString()}</span>
            </li>
          ))}
        </ol>
        {standings[0] && <p className="winner-line">🏆 {standings[0].name} takes it down</p>}
        <div className="overlay-actions">
          <button className="btn ghost" onClick={() => actions.leaveRoom()}>Back to start</button>
        </div>
        {isHost && <p className="muted small">Leave and create a new room to play again.</p>}
      </div>
    </div>
  );
}

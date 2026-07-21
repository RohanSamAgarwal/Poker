import Card from './Card.jsx';
import { BOT_LABELS } from '../labels.js';

// One player position around the table. `seat` is the per-viewer seat view from
// the server (may include `hole` only when this viewer is allowed to see it).
export default function Seat({ seat, isYou, style, showdownWin, dealKey }) {
  if (seat.empty) {
    return (
      <div className="seat seat-empty" style={style}>
        <span>Seat {seat.index + 1}</span>
      </div>
    );
  }

  const classes = [
    'seat',
    seat.isCurrentActor ? 'acting' : '',
    seat.folded ? 'folded' : '',
    isYou ? 'you' : '',
    showdownWin ? 'winner' : '',
  ].filter(Boolean).join(' ');

  // Show two hole cards: real faces if the server sent them, else face-down.
  const holes = seat.hole || (seat.folded ? [] : [null, null]);
  // Your own hand is rendered larger so it's easy to read at a glance.
  const holeSize = isYou ? 'lg' : 'sm';

  return (
    <div className={classes} style={style}>
      {seat.isButton && <span className="dealer-btn" title="Dealer">D</span>}

      <div className={`seat-cards ${isYou ? 'mine' : ''}`}>
        {holes.map((c, i) => (
          <div key={`${dealKey}-${i}`} className="dealt" style={{ animationDelay: `${i * 90}ms` }}>
            <Card card={c} faceDown={!c} size={holeSize} dim={seat.folded} />
          </div>
        ))}
      </div>

      <div className="seat-plate">
        <div className="seat-name-line">
          <span className="nm">{seat.name}</span>
          {seat.kind === 'bot' && <span className="mini-tag">{BOT_LABELS[seat.botDifficulty]?.split(' ')[0]}</span>}
          {!seat.connected && <span className="mini-tag off">off</span>}
        </div>
        <div className="seat-stack">{seat.stack.toLocaleString()}</div>
      </div>

      {seat.streetCommitted > 0 && (
        <div className="seat-bet">{seat.streetCommitted.toLocaleString()}</div>
      )}
      {seat.allIn && <div className="allin-flag">ALL IN</div>}
      {showdownWin > 0 && <div className="won-flag">+{showdownWin.toLocaleString()}</div>}
    </div>
  );
}

import { useEffect, useState } from 'react';

// Betting controls, shown only when it's the viewer's turn. `legal` is the
// server's legal-action descriptor for this actor.
export default function ActionBar({ legal, onAct, timeLeftMs, timeoutSec }) {
  const canAggress = legal.canBet || legal.canRaise;
  const [amount, setAmount] = useState(legal.minRaiseTo || 0);

  const totalMs = (timeoutSec || 0) * 1000;
  const clockPct = totalMs && timeLeftMs != null ? Math.max(0, Math.min(100, (timeLeftMs / totalMs) * 100)) : null;
  const urgent = timeLeftMs != null && timeLeftMs < 5000;

  // Reset the slider to the minimum each time a fresh decision is required.
  useEffect(() => {
    setAmount(legal.minRaiseTo || legal.maxRaiseTo || 0);
  }, [legal.minRaiseTo, legal.maxRaiseTo]);

  const clamp = (v) => Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(v)));
  const isAllInAmount = amount >= legal.maxRaiseTo;
  const aggressVerb = legal.canBet ? 'Bet' : 'Raise to';

  return (
    <div className="action-bar">
      {clockPct != null && (
        <div className="action-clock">
          <div className={`action-clock-fill ${urgent ? 'urgent' : ''}`} style={{ width: `${clockPct}%` }} />
        </div>
      )}
      <div className="action-row">
        {legal.canFold && (
          <button className="btn act fold" onClick={() => onAct('fold')}>Fold</button>
        )}
        {legal.canCheck && (
          <button className="btn act check" onClick={() => onAct('check')}>Check</button>
        )}
        {legal.canCall && (
          <button className="btn act call" onClick={() => onAct('call')}>
            Call <b>{legal.callAmount.toLocaleString()}</b>
          </button>
        )}
        {canAggress && (
          <button
            className="btn act raise primary"
            onClick={() => onAct(isAllInAmount ? 'allin' : (legal.canBet ? 'bet' : 'raise'), amount)}
          >
            {isAllInAmount ? 'All in' : `${aggressVerb} ${amount.toLocaleString()}`}
          </button>
        )}
      </div>

      {canAggress && legal.maxRaiseTo > legal.minRaiseTo && (
        <div className="raise-controls">
          <input
            type="range"
            min={legal.minRaiseTo}
            max={legal.maxRaiseTo}
            value={amount}
            onChange={(e) => setAmount(clamp(Number(e.target.value)))}
          />
          <div className="raise-presets">
            <button className="chip-btn" onClick={() => setAmount(legal.minRaiseTo)}>Min</button>
            <button className="chip-btn" onClick={() => setAmount(clamp((legal.pot || 0) * 0.5 || legal.minRaiseTo))}>½ pot</button>
            <button className="chip-btn" onClick={() => setAmount(clamp(legal.pot || legal.minRaiseTo))}>Pot</button>
            <button className="chip-btn" onClick={() => setAmount(legal.maxRaiseTo)}>Max</button>
            <input
              className="raise-input"
              type="number"
              min={legal.minRaiseTo}
              max={legal.maxRaiseTo}
              value={amount}
              onChange={(e) => setAmount(clamp(Number(e.target.value)))}
            />
          </div>
        </div>
      )}
    </div>
  );
}

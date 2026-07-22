import { useEffect, useState } from 'react';
import { Chip, ChipStack, CHIP_DENOMS } from './Chips.jsx';
import { sfx } from '../sound.js';

// Betting controls, shown only when it's the viewer's turn. `legal` is the
// server's legal-action descriptor. Raises are built by clicking chips (the
// amount is the total "raise to"); presets and an all-in are provided too.
export default function ActionBar({ legal, onAct, timeLeftMs, timeoutSec }) {
  const canAggress = legal.canBet || legal.canRaise;
  const [amount, setAmount] = useState(legal.minRaiseTo || 0);

  const totalMs = (timeoutSec || 0) * 1000;
  const clockPct = totalMs && timeLeftMs != null ? Math.max(0, Math.min(100, (timeLeftMs / totalMs) * 100)) : null;
  const urgent = timeLeftMs != null && timeLeftMs < 5000;

  // Start each fresh decision at the minimum legal raise.
  useEffect(() => {
    setAmount(legal.minRaiseTo || legal.maxRaiseTo || 0);
  }, [legal.minRaiseTo, legal.maxRaiseTo]);

  const clamp = (v) => Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(v)));
  const isAllInAmount = amount >= legal.maxRaiseTo;
  const aggressVerb = legal.canBet ? 'Bet' : 'Raise to';
  const atMax = amount >= legal.maxRaiseTo;

  const addChip = (v) => { sfx.chip(); setAmount((a) => Math.min(legal.maxRaiseTo, a + v)); };
  const denoms = CHIP_DENOMS.filter((d) => d <= legal.maxRaiseTo);
  const showBuilder = canAggress && legal.maxRaiseTo > legal.minRaiseTo;

  return (
    <div className="action-bar">
      {clockPct != null && (
        <div className="action-clock">
          <div className={`action-clock-fill ${urgent ? 'urgent' : ''}`} style={{ width: `${clockPct}%` }} />
        </div>
      )}

      {showBuilder && (
        <div className="bet-builder">
          <div className="bet-pending">
            <ChipStack amount={amount} size={22} />
            <span className="bet-amt">{amount.toLocaleString()}</span>
          </div>
          <div className="chip-tray">
            {denoms.map((d) => (
              <Chip key={d} value={d} size={48} onClick={addChip} disabled={atMax} />
            ))}
          </div>
          <div className="raise-presets">
            <button className="chip-btn" onClick={() => setAmount(legal.minRaiseTo)}>Min</button>
            <button className="chip-btn" onClick={() => setAmount(clamp((legal.pot || 0) * 0.5 || legal.minRaiseTo))}>½ pot</button>
            <button className="chip-btn" onClick={() => setAmount(clamp(legal.pot || legal.minRaiseTo))}>Pot</button>
            <button className="chip-btn" onClick={() => setAmount(legal.maxRaiseTo)}>All-in</button>
          </div>
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
    </div>
  );
}

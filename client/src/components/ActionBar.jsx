import { useEffect, useState } from 'react';
import { Chip, ChipStack, CHIP_DENOMS } from './Chips.jsx';
import { sfx } from '../sound.js';

// Betting controls, shown only when it's the viewer's turn. `legal` is the
// server's legal-action descriptor. Raises are built by clicking chips (the
// amount is the total "raise to"); it starts empty, and a Clear button resets
// it in case of a mis-click. Presets and all-in are provided too.
export default function ActionBar({ legal, onAct, timeLeftMs, timeoutSec }) {
  const canAggress = legal.canBet || legal.canRaise;
  const [amount, setAmount] = useState(0);

  const totalMs = (timeoutSec || 0) * 1000;
  const clockPct = totalMs && timeLeftMs != null ? Math.max(0, Math.min(100, (timeLeftMs / totalMs) * 100)) : null;
  const urgent = timeLeftMs != null && timeLeftMs < 5000;

  // Reset to empty for each fresh decision.
  useEffect(() => { setAmount(0); }, [legal.minRaiseTo, legal.maxRaiseTo]);

  // Presets/chips clamp to the legal range; Clear goes to 0.
  const preset = (v) => Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(v)));
  const onlyAllIn = canAggress && legal.maxRaiseTo <= legal.minRaiseTo; // short stack: only shove
  const showBuilder = canAggress && !onlyAllIn;
  const validRaise = amount >= legal.minRaiseTo;
  const isAllInAmount = amount > 0 && amount >= legal.maxRaiseTo;
  const verb = legal.canBet ? 'Bet' : 'Raise to';

  const addChip = (v) => { sfx.chip(); setAmount((a) => Math.min(legal.maxRaiseTo, a + v)); };
  const denoms = CHIP_DENOMS.filter((d) => d <= legal.maxRaiseTo);

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
            {amount > 0
              ? <><ChipStack amount={amount} size={34} /><span className="bet-amt">{amount.toLocaleString()}</span></>
              : <span className="bet-hint">Tap chips to build your bet</span>}
          </div>
          <div className="chip-tray">
            {denoms.map((d) => (
              <Chip key={d} value={d} size={66} onClick={addChip} disabled={amount >= legal.maxRaiseTo} />
            ))}
          </div>
          <div className="raise-presets">
            <button className="chip-btn" onClick={() => setAmount(preset(legal.minRaiseTo))}>Min</button>
            <button className="chip-btn" onClick={() => setAmount(preset((legal.pot || 0) * 0.5))}>½ pot</button>
            <button className="chip-btn" onClick={() => setAmount(preset(legal.pot || 0))}>Pot</button>
            <button className="chip-btn" onClick={() => setAmount(legal.maxRaiseTo)}>All-in</button>
            <button className="chip-btn clear" onClick={() => setAmount(0)} disabled={amount === 0}>Clear</button>
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
        {onlyAllIn && (
          <button className="btn act raise primary" onClick={() => onAct('allin')}>
            All in ({legal.maxRaiseTo.toLocaleString()})
          </button>
        )}
        {showBuilder && (
          <button
            className="btn act raise primary"
            disabled={!validRaise}
            onClick={() => onAct(isAllInAmount ? 'allin' : (legal.canBet ? 'bet' : 'raise'), amount)}
          >
            {amount === 0 ? verb : (isAllInAmount ? 'All in' : `${verb} ${amount.toLocaleString()}`)}
          </button>
        )}
      </div>
    </div>
  );
}

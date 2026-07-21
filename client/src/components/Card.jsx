// A playing card. `card` is a 2-char string like "As" / "Td" / null.
// When `faceDown` (or no card given) it shows the brand card-back easter egg:
// Electric-Violet field with the black-outline RSA cube monogram.
import RSACube from './RSACube.jsx';

const SUITS = {
  s: { glyph: '♠', color: 'ink' },
  c: { glyph: '♣', color: 'ink' },
  h: { glyph: '♥', color: 'red' },
  d: { glyph: '♦', color: 'red' },
};
const RANK_LABEL = { T: '10' };

// size: 'sm' (opponent hole) | 'md' (community board) | 'lg' (your hole)
export default function Card({ card, faceDown = false, size = 'md', dim = false }) {
  const cls = `card card-${size}${dim ? ' card-dim' : ''}`;

  if (faceDown || !card) {
    return (
      <div className={`${cls} card-back`} aria-label="face-down card">
        <div className="card-back-frame">
          <RSACube size="56%" color="#0a0a12" strokeWidth={11} />
        </div>
      </div>
    );
  }

  const rank = card[0];
  const suit = SUITS[card[1]] || { glyph: '?', color: 'ink' };
  const label = RANK_LABEL[rank] || rank;
  const index = (
    <>
      <span className="ci-rank">{label}</span>
      <span className="ci-suit">{suit.glyph}</span>
    </>
  );

  return (
    <div className={`${cls} card-face suit-${suit.color}`} aria-label={`${label} of ${suit.glyph}`}>
      <span className="card-index tl">{index}</span>
      <span className="card-center">{suit.glyph}</span>
      <span className="card-index br">{index}</span>
    </div>
  );
}

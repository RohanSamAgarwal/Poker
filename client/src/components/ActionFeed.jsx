import { useEffect, useRef, useState } from 'react';

// Transient pop-ups describing what players did ("Velma raises to 60"). Reads
// the server's rolling feed and shows each new entry briefly, then fades it.
const LIFETIME_MS = 4000;

export default function ActionFeed({ feed }) {
  const [items, setItems] = useState([]);
  const seenRef = useRef(0);

  useEffect(() => {
    if (!feed || !feed.length) return;
    const fresh = feed.filter((f) => f.seq > seenRef.current);
    if (!fresh.length) return;
    seenRef.current = feed[feed.length - 1].seq;
    setItems((prev) => [...prev, ...fresh]);
    fresh.forEach((f) => {
      setTimeout(() => setItems((prev) => prev.filter((x) => x.seq !== f.seq)), LIFETIME_MS);
    });
  }, [feed]);

  if (!items.length) return null;
  // Show at most the latest few so a fast street doesn't stack too tall.
  return (
    <div className="action-feed" aria-live="polite">
      {items.slice(-5).map((it) => (
        <div key={it.seq} className={`feed-item ${it.text.startsWith('—') ? 'feed-hand' : ''}`}>
          {it.text}
        </div>
      ))}
    </div>
  );
}

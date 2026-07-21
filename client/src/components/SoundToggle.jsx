import { useEffect, useState } from 'react';
import { isEnabled, setEnabled, onSoundChange } from '../sound.js';

// Small always-visible button to mute/unmute the game sounds. Persists via
// localStorage (handled in sound.js).
export default function SoundToggle() {
  const [on, setOn] = useState(isEnabled());
  useEffect(() => onSoundChange(setOn), []);
  return (
    <button
      className="sound-toggle"
      onClick={() => setEnabled(!on)}
      title={on ? 'Sound on — click to mute' : 'Sound off — click to unmute'}
      aria-label={on ? 'Mute sound' : 'Unmute sound'}
    >
      {on ? '🔊' : '🔇'}
    </button>
  );
}

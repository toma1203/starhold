import { useT } from '../i18n/useT.ts';
import { useGameStore } from '../store/gameStore.ts';
import { Button } from './Button.tsx';

/** Speaker icon, crossed out while muted. Decorative: the button carries the label. */
function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M3 8h3l4-3.5v11L6 12H3z" fill="currentColor" />
      {muted ? (
        <path
          d="M13 7l4 6m0-6l-4 6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M13 7.5a3.5 3.5 0 010 5M15.2 5.5a6.5 6.5 0 010 9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** Sound on/off. The label always names the action the next press performs. */
export function MuteToggle() {
  const t = useT();
  const muted = useGameStore((s) => s.muted);
  const setMuted = useGameStore((s) => s.setMuted);
  return (
    <Button
      variant="ghost"
      className="mute-toggle"
      aria-label={t(muted ? 'common.unmute' : 'common.mute')}
      onClick={() => setMuted(!muted)}
    >
      <SpeakerIcon muted={muted} />
    </Button>
  );
}

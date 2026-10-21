import { useT } from '../i18n/useT.ts';
import { useSecondsLeft } from './useCountdown.ts';

const WARNING_SECONDS = 10;

/** Seconds left until a deadline; turns into a warning for the last ten. */
export function TurnTimer({ deadline }: { deadline: number | null }) {
  const t = useT();
  const left = useSecondsLeft(deadline);
  if (left === null) return null;
  return (
    <span role="timer" className="turn-timer" data-warning={left <= WARNING_SECONDS}>
      {t('game.timerValue', { seconds: left })}
    </span>
  );
}

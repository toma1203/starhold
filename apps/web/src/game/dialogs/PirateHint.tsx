import type { PlayerId, PlayerView } from '@starhold/engine';
import { useT } from '../../i18n/useT.ts';

/** Reminder for the player who has to move the pirate ship. */
export function PirateHint({ view, me }: { view: PlayerView; me: PlayerId }) {
  const t = useT();
  if (view.phase !== 'PIRATE' || view.players[view.current]?.id !== me) return null;
  return (
    <p className="pirate-hint" role="status">
      {t('game.pirateHint')}
    </p>
  );
}

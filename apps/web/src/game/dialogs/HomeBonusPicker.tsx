import { legalActions } from '@starhold/engine';
import type { PlayerId, PlayerView } from '@starhold/engine';
import { useT } from '../../i18n/useT.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { Button } from '../../ui/Button.tsx';
import { ResourceLabel } from '../ResourceLabel.tsx';

/** Inline chooser for the free home-system resource; only for the player whose bonus it is. */
export function HomeBonusPicker({ view, me }: { view: PlayerView; me: PlayerId }) {
  const t = useT();
  const sendAction = useGameStore((s) => s.sendAction);
  if (view.phase !== 'HOME_BONUS' || view.players[view.current]?.id !== me) return null;
  return (
    <section className="prompt home-bonus">
      <h2>{t('game.homeBonusTitle')}</h2>
      <div className="button-row">
        {legalActions(view, me).flatMap((action) =>
          action.type === 'chooseHomeBonus'
            ? [
                <Button key={action.resource} onClick={() => sendAction(action)}>
                  <ResourceLabel resource={action.resource} />
                </Button>,
              ]
            : [],
        )}
      </div>
    </section>
  );
}

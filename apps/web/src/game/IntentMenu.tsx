import type { MessageKey } from '@starhold/i18n';
import { useT } from '../i18n/useT.ts';
import { Button } from '../ui/Button.tsx';
import type { Intent } from './selection.ts';

export type MenuIntent = Exclude<Intent, { kind: 'pirate' }>;

const LABELS: Record<MenuIntent['kind'], MessageKey> = {
  expand: 'game.expand',
  attack: 'game.attack',
  fortify: 'game.fortify',
  build: 'game.build',
};

/** Small choice shown when one click on the map could mean more than one thing. */
export function IntentMenu({
  intents,
  onPick,
  onCancel,
}: {
  intents: MenuIntent[];
  onPick: (intent: MenuIntent) => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <div role="group" aria-label={t('game.chooseAction')} className="intent-menu">
      {intents.map((intent) => (
        <Button key={intent.kind} variant="primary" onClick={() => onPick(intent)}>
          {t(LABELS[intent.kind])}
        </Button>
      ))}
      <Button variant="ghost" onClick={onCancel}>
        {t('game.cancel')}
      </Button>
    </div>
  );
}

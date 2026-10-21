import { useState } from 'react';
import type { PlayerId, PlayerView } from '@starhold/engine';
import { useT } from '../../i18n/useT.ts';
import { Dialog } from '../../ui/Dialog.tsx';
import { BankTab } from './BankTab.tsx';
import { OfferTab } from './OfferTab.tsx';

export type TradeTab = 'bank' | 'players';

export interface TradeDialogProps {
  view: PlayerView;
  me: PlayerId;
  initialTab: TradeTab;
  onClose: () => void;
}

/** Trade with the bank or offer a swap to the other players. */
export function TradeDialog({ view, me, initialTab, onClose }: TradeDialogProps) {
  const t = useT();
  const [tab, setTab] = useState<TradeTab>(initialTab);
  const tabs: { id: TradeTab; label: string }[] = [
    { id: 'bank', label: t('game.bankTrade') },
    { id: 'players', label: t('game.trade.players') },
  ];
  return (
    <Dialog title={t('game.trade.title')} onClose={onClose}>
      <div role="tablist" className="tabs">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="btn btn-ghost"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'bank' ? (
          <BankTab view={view} me={me} />
        ) : (
          <OfferTab view={view} me={me} onSent={onClose} />
        )}
      </div>
    </Dialog>
  );
}

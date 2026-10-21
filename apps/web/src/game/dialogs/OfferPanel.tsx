import { legalActions } from '@starhold/engine';
import type { PlayerId, PlayerView } from '@starhold/engine';
import { useT } from '../../i18n/useT.ts';
import { useGameStore } from '../../store/gameStore.ts';
import { Button } from '../../ui/Button.tsx';
import { bagText, playerName } from '../format.ts';

/** The open trade offer: incoming (accept / decline) for others, answers and confirm for the offerer. */
export function OfferPanel({ view, me }: { view: PlayerView; me: PlayerId }) {
  const t = useT();
  const sendAction = useGameStore((s) => s.sendAction);
  const offer = view.offer;
  if (!offer) return null;
  const actions = legalActions(view, me);
  const give = bagText(offer.give, t);
  const want = bagText(offer.want, t);

  if (offer.from !== me) {
    const canAccept = actions.some((a) => a.type === 'respondTrade' && a.accept);
    const canDecline = actions.some((a) => a.type === 'respondTrade' && !a.accept);
    return (
      <section className="prompt offer-panel">
        <p>{t('game.offer.incoming', { player: playerName(view, offer.from), give, want })}</p>
        {offer.accepted.includes(me) && <p className="hint">{t('game.offer.youAccepted')}</p>}
        {offer.declined.includes(me) && <p className="hint">{t('game.offer.youDeclined')}</p>}
        {canDecline && !canAccept && <p className="hint">{t('game.offer.cannotAfford')}</p>}
        <div className="button-row">
          {canAccept && (
            <Button
              variant="primary"
              onClick={() => sendAction({ type: 'respondTrade', accept: true })}
            >
              {t('game.accept')}
            </Button>
          )}
          {canDecline && (
            <Button onClick={() => sendAction({ type: 'respondTrade', accept: false })}>
              {t('game.decline')}
            </Button>
          )}
        </div>
      </section>
    );
  }

  const status = (id: string) =>
    offer.accepted.includes(id)
      ? t('game.offer.accepted')
      : offer.declined.includes(id)
        ? t('game.offer.declined')
        : t('game.offer.pending');
  return (
    <section className="prompt offer-panel">
      <p>{t('game.offer.yours', { give, want })}</p>
      <ul className="offer-status">
        {view.players
          .filter((p) => p.id !== me)
          .map((p) => (
            <li key={p.id}>{t('game.offer.status', { player: p.name, status: status(p.id) })}</li>
          ))}
      </ul>
      <div className="button-row">
        {actions.flatMap((a) =>
          a.type === 'confirmTrade'
            ? [
                <Button key={a.with} variant="primary" onClick={() => sendAction(a)}>
                  {t('game.offer.tradeWith', { player: playerName(view, a.with) })}
                </Button>,
              ]
            : [],
        )}
        <Button
          disabled={!actions.some((a) => a.type === 'cancelTrade')}
          onClick={() => sendAction({ type: 'cancelTrade' })}
        >
          {t('game.offer.withdraw')}
        </Button>
      </div>
    </section>
  );
}

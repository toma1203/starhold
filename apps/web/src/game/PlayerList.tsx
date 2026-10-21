import { useId } from 'react';
import { victoryPoints } from '@starhold/engine';
import type { PlayerView } from '@starhold/engine';
import type { SeatInfo } from '@starhold/protocol';
import { useT } from '../i18n/useT.ts';
import { PlayerMarker } from '../ui/PlayerMarker.tsx';

function fleetTotal(view: PlayerView, id: string): number {
  return view.sectorIds.reduce((sum, sid) => {
    const sector = view.sectors[sid];
    return sector?.owner === id ? sum + sector.fleets : sum;
  }, 0);
}

/** Everybody at the table: colour and shape, score, cards, fleets, awards and presence. */
export function PlayerList({ view, seats }: { view: PlayerView; seats: SeatInfo[] }) {
  const t = useT();
  const headingId = useId();
  const currentId = view.players[view.current]?.id;
  return (
    <section className="player-list">
      <h2 id={headingId}>{t('game.players')}</h2>
      <ul className="players" aria-labelledby={headingId}>
        {view.players.map((player) => {
          const seat = seats.find((s) => s.playerId === player.id);
          const presence =
            seat && !seat.isBot && !seat.connected
              ? 'game.disconnected'
              : seat?.afk
                ? 'game.afk'
                : null;
          return (
            <li
              key={player.id}
              className="player"
              aria-current={player.id === currentId ? 'true' : undefined}
            >
              <div className="player-head">
                <PlayerMarker seat={player.seat} />
                <span className="player-name">{player.name}</span>
                {player.id === view.me && <span className="badge">{t('lobby.you')}</span>}
                {view.awards.largestEmpire === player.id && (
                  <span className="badge badge-award">{t('game.largestEmpire')}</span>
                )}
                {view.awards.warlord === player.id && (
                  <span className="badge badge-award">{t('game.warlord')}</span>
                )}
                {presence && <span className="badge badge-warn">{t(presence)}</span>}
              </div>
              <dl className="player-stats">
                <div>
                  <dt>{t('game.vp')}</dt>
                  <dd>{victoryPoints(view, player.id)}</dd>
                </div>
                <div>
                  <dt>{t('game.cards')}</dt>
                  <dd>{player.cardCount}</dd>
                </div>
                <div>
                  <dt>{t('game.fleets')}</dt>
                  <dd>{fleetTotal(view, player.id)}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import { useLocation } from 'wouter';
import { ranking, sectorCount, victoryPoints } from '@starhold/engine';
import { useT } from '../i18n/useT.ts';
import { playerName } from '../game/format.ts';
import { useGameStore } from '../store/gameStore.ts';
import { Button } from '../ui/Button.tsx';
import { MuteToggle } from '../ui/MuteToggle.tsx';
import { PlayerMarker } from '../ui/PlayerMarker.tsx';

/** The finished game: who won and why, the final ranking, Rematch (host) and Home. */
export function EndScreen() {
  const t = useT();
  const [, navigate] = useLocation();
  const room = useGameStore((s) => s.room);
  const game = useGameStore((s) => s.game);
  const rematch = useGameStore((s) => s.rematch);
  const leaveRoom = useGameStore((s) => s.leaveRoom);

  if (room === null || game === null) return <p className="screen">{t('game.loading')}</p>;
  const view = game.view;
  const me = view.me ?? room.you;
  const isHost = room.hostId === room.you;
  const order = ranking(view);

  return (
    <main className="screen end-screen">
      <header>
        <h1>
          {t('end.winner', { player: view.winner === null ? '' : playerName(view, view.winner) })}
        </h1>
        <p className="tagline">
          {view.endReason === 'roundLimit' ? t('end.reasonRoundLimit') : t('end.reasonTarget')}
        </p>
      </header>

      <section className="panel">
        <table className="ranking">
          <caption>{t('end.ranking')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('end.rank')}</th>
              <th scope="col">{t('end.player')}</th>
              <th scope="col">{t('game.vp')}</th>
              <th scope="col">{t('end.sectors')}</th>
              <th scope="col">{t('end.conquests')}</th>
            </tr>
          </thead>
          <tbody>
            {order.map((id, index) => {
              const player = view.players.find((p) => p.id === id);
              if (!player) return null;
              return (
                <tr key={id} data-winner={id === view.winner ? 'true' : undefined}>
                  <td>{index + 1}</td>
                  <td>
                    <span className="ranking-player">
                      <PlayerMarker seat={player.seat} />
                      <span>{player.name}</span>
                      {id === me && <span className="badge">{t('lobby.you')}</span>}
                    </span>
                  </td>
                  <td>{victoryPoints(view, id)}</td>
                  <td>{sectorCount(view, id)}</td>
                  <td>{player.conquests}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="end-actions">
        {isHost && (
          <Button variant="primary" onClick={rematch}>
            {t('end.rematch')}
          </Button>
        )}
        <Button
          onClick={() => {
            leaveRoom();
            navigate('/');
          }}
        >
          {t('end.home')}
        </Button>
        <MuteToggle />
      </div>
    </main>
  );
}

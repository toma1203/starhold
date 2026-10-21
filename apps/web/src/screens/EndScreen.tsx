import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { ranking, sectorCount, victoryPoints } from '@starhold/engine';
import type { PlayerView } from '@starhold/engine';
import type { RoomInfo } from '@starhold/protocol';
import { useT } from '../i18n/useT.ts';
import { playerName } from '../game/format.ts';
import { useGameStore } from '../store/gameStore.ts';
import { Button } from '../ui/Button.tsx';
import { MuteToggle } from '../ui/MuteToggle.tsx';
import { PlayerMarker } from '../ui/PlayerMarker.tsx';

function EndBoard({ view, room }: { view: PlayerView; room: RoomInfo }) {
  const t = useT();
  const [, navigate] = useLocation();
  const rematch = useGameStore((s) => s.rematch);
  const leaveRoom = useGameStore((s) => s.leaveRoom);
  const me = view.me ?? room.you;
  const isHost = room.hostId === room.you;
  const order = ranking(view);

  // The recorded winner, else whoever the ranking puts first, else a neutral heading.
  const winnerId = view.winner ?? order[0] ?? null;
  const headline =
    winnerId === null
      ? t('game.phase.finished')
      : t('end.winner', { player: playerName(view, winnerId) });
  const reason =
    view.endReason === 'roundLimit' ? t('end.reasonRoundLimit') : t('end.reasonTarget');

  // Filled after mount so a screen reader reads it as news, not as initial page content.
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => setAnnouncement(`${headline} ${reason}`), [headline, reason]);

  return (
    <main className="screen end-screen">
      <header>
        <h1>{headline}</h1>
        <p className="tagline">{reason}</p>
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>
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

/** The finished game: who won and why, the final ranking, Rematch (host) and Home. */
export function EndScreen() {
  const t = useT();
  const room = useGameStore((s) => s.room);
  const game = useGameStore((s) => s.game);
  if (room === null || game === null) return <p className="screen">{t('game.loading')}</p>;
  return <EndBoard view={game.view} room={room} />;
}

import { useEffect } from 'react';
import { Route, Switch } from 'wouter';
import { useT } from './i18n/useT.ts';
import { loadSession } from './net/session.ts';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { TitlePage } from './pages/TitlePage.tsx';
import { GameScreen } from './screens/GameScreen.tsx';
import { HomeScreen } from './screens/HomeScreen.tsx';
import { JoinPrompt } from './screens/JoinPrompt.tsx';
import { LobbyScreen } from './screens/LobbyScreen.tsx';
import { useGameStore } from './store/gameStore.ts';

/** /room/:code. Lobby, game and end screens are chosen by the room phase. */
function RoomRoute({ code }: { code: string }) {
  const t = useT();
  const room = useGameStore((s) => s.room);
  const connection = useGameStore((s) => s.connection);
  const activeCode = useGameStore((s) => s.activeCode);
  const rejoin = useGameStore((s) => s.rejoin);
  // Re-render when a session is saved or cleared (a failed rejoin drops back to the join form).
  useGameStore((s) => s.sessionTick);

  const hasSession = loadSession(code) !== null;
  const needsRejoin = hasSession && connection === 'online' && activeCode !== code;

  useEffect(() => {
    if (needsRejoin) void rejoin(code);
  }, [needsRejoin, rejoin, code]);

  if (!hasSession) return <JoinPrompt code={code} />;
  if (room?.code !== code) return <p className="screen">{t('game.reconnecting')}</p>;
  if (room.phase === 'LOBBY') return <LobbyScreen />;
  if (room.phase === 'IN_GAME') return <GameScreen />;
  // EndScreen arrives with the end-of-game UI.
  return <p className="screen">{t('game.phase.finished')}</p>;
}

export function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={HomeScreen} />
      <Route path="/room/:code">{(params) => <RoomRoute code={params.code.toUpperCase()} />}</Route>
      <Route path="/rules">
        <TitlePage titleKey="pages.rules.title" />
      </Route>
      <Route path="/privacy">
        <TitlePage titleKey="pages.privacy.title" />
      </Route>
      <Route path="/credits">
        <TitlePage titleKey="pages.credits.title" />
      </Route>
      <Route component={NotFoundPage} />
    </Switch>
  );
}

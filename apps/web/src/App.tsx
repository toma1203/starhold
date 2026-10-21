import { useT } from './i18n/useT.ts';
import { AppRoutes } from './routes.tsx';
import { useGameStore } from './store/gameStore.ts';
import { ErrorBoundary } from './ui/ErrorBoundary.tsx';
import { Toasts } from './ui/Toasts.tsx';

function ConnectionBanner() {
  const t = useT();
  // Not before the very first connect, and only here: screens say "loading", not "reconnecting".
  const lost = useGameStore((s) => s.connection === 'offline' && s.hasConnected);
  if (!lost) return null;
  return (
    <div className="connection-banner" role="status">
      {t('game.reconnecting')}
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <ConnectionBanner />
      <AppRoutes />
      <Toasts />
    </ErrorBoundary>
  );
}

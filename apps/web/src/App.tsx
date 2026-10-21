import { useT } from './i18n/useT.ts';
import { AppRoutes } from './routes.tsx';
import { useGameStore } from './store/gameStore.ts';
import { Button } from './ui/Button.tsx';
import { ErrorBoundary } from './ui/ErrorBoundary.tsx';
import { Toasts } from './ui/Toasts.tsx';

/** The socket keeps retrying on its own; after this many failures the user can push it. */
const RETRY_BUTTON_AFTER = 3;

function ConnectionBanner() {
  const t = useT();
  // Not before the very first connect, and only here: screens say "loading", not "reconnecting".
  const lost = useGameStore((s) => s.connection === 'offline' && s.hasConnected);
  const failures = useGameStore((s) => s.reconnectFailures);
  const retry = useGameStore((s) => s.retryConnect);
  if (!lost) return null;
  return (
    <div className="connection-banner" role="status">
      <span>{t('game.reconnecting')}</span>
      {failures >= RETRY_BUTTON_AFTER && (
        <Button variant="secondary" onClick={retry}>
          {t('common.retry')}
        </Button>
      )}
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

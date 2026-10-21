import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const PORT = 4173;
/** Second server without the shortened turn timer; human-turn.spec.ts points at this port. */
const HUMAN_TURN_PORT = 4174;
// `npm run e2e -- --grep @screenshots` regenerates the README screenshots (calmer game pace).
const screenshots = process.argv.some((arg) => arg.includes('@screenshots'));

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: fileURLToPath(new URL('../../../../test-results', import.meta.url)),
  // One solo game can take minutes; everything else is quick.
  timeout: 240_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // The README screenshots are a documentation tool, not part of the default e2e run.
  ...(screenshots ? { grep: /@screenshots/ } : { grepInvert: /@screenshots/ }),
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI']
    ? [['list'], ['html', { open: 'never', outputFolder: `${root}playwright-report` }]]
    : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: [
    {
      command: 'node apps/server/dist/index.js',
      cwd: root,
      url: `http://localhost:${PORT}/healthz`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        PORT: String(PORT),
        STARHOLD_BOT_DELAY_MS: screenshots ? '150' : '0',
        STARHOLD_TURN_SECONDS: screenshots ? '120' : '3',
        STARHOLD_DISCARD_SECONDS: '1',
        STARHOLD_STATIC_DIR: `${root}apps/web/dist`,
      },
    },
    {
      // Real turn lengths (the room setting decides, default 90 s): a human can play a turn by hand.
      // Used by human-turn.spec.ts only.
      command: 'node apps/server/dist/index.js',
      cwd: root,
      url: `http://localhost:${HUMAN_TURN_PORT}/healthz`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        PORT: String(HUMAN_TURN_PORT),
        STARHOLD_BOT_DELAY_MS: '0',
        STARHOLD_DISCARD_SECONDS: '30',
        STARHOLD_STATIC_DIR: `${root}apps/web/dist`,
      },
    },
  ],
});

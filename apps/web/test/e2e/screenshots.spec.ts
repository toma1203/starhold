import { fileURLToPath } from 'node:url';
import { devices, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Regenerates the README screenshots from a real game against bots:
 *   npm run build && npm run e2e -- --grep @screenshots
 * Excluded from the default e2e run (see playwright.config.ts).
 */
const outDir = fileURLToPath(new URL('../../../../docs/screenshots/', import.meta.url));

async function createRoomWithBots(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Nickname').fill('Nova');
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByRole('heading', { name: /^Room [A-Z0-9]{5}$/ })).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Add bot: Normal' }).click();
  }
  await expect(page.getByRole('list', { name: 'Players' }).getByRole('listitem')).toHaveCount(4);
}

/** Starts the game, takes the home bonus and lets the bots play so the map has some history. */
async function startAndSettle(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByRole('group', { name: 'Galaxy map' })).toBeVisible();
  await page.getByRole('button', { name: 'Metal', exact: true }).click();
  await expect(page.getByText('Home system bonus: choose a resource')).toHaveCount(0);
  await page.waitForTimeout(3_000);
}

test('@screenshots README screenshots', async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'one run produces all three images');

  await page.setViewportSize({ width: 1280, height: 800 });
  await createRoomWithBots(page);
  await page.screenshot({ path: `${outDir}lobby.png` });

  await startAndSettle(page);
  await page.screenshot({ path: `${outDir}game-desktop.png` });

  const mobileContext = await browser.newContext({
    ...devices['Pixel 5'],
    baseURL: testInfo.project.use.baseURL ?? undefined,
  });
  try {
    const mobile = await mobileContext.newPage();
    await createRoomWithBots(mobile);
    await startAndSettle(mobile);
    await mobile.screenshot({ path: `${outDir}game-mobile.png` });
  } finally {
    await mobileContext.close();
  }
});

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
// The second web server in playwright.config.ts: the normal turn timer (the shared server gives
// each turn 3 s and hands it to a bot, which is too short to play a turn by hand).
test.use({ baseURL: 'http://localhost:4174' });

/** Phones keep the panels in a bottom sheet; desktops show them all. */
async function openPanel(page: Page, name: 'Actions' | 'Log'): Promise<void> {
  const tab = page.getByRole('tab', { name, exact: true });
  if ((await tab.count()) > 0 && (await tab.getAttribute('aria-selected')) !== 'true') {
    await tab.click();
  }
}

test('a human plays a turn by hand: home bonus, roll, end turn', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Nickname').fill('Alice');
  await page.getByRole('button', { name: 'Create room' }).click();
  await page.getByRole('button', { name: 'Add bot: Normal' }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByRole('group', { name: 'Galaxy map' })).toBeVisible();

  // Whoever is seated first, the human's turn comes up (the bot plays at once).
  const bonus = page.locator('.home-bonus');
  await expect(bonus).toBeVisible();
  await bonus.getByRole('button').first().click();
  await expect(bonus).toHaveCount(0);

  await openPanel(page, 'Actions');
  await page.getByRole('button', { name: 'Roll dice' }).click();

  await openPanel(page, 'Log');
  await expect(page.getByRole('log').getByText(/^Alice rolls \d \+ \d+ = \d+$/)).toBeVisible();

  // A 7 sends the pirates first: move them to the first valid sector, then carry on.
  await openPanel(page, 'Actions');
  const endTurn = page.getByRole('button', { name: 'End turn' });
  if (await page.locator('.pirate-hint').isVisible()) {
    await page.locator('g.sector[data-target="true"]').first().click();
  }
  await endTurn.click();

  // The turn really passed: the log shows the bot taking its own turn.
  await openPanel(page, 'Log');
  await expect(
    page
      .getByRole('log')
      .getByText(/Bot .*'s turn, round \d+/)
      .first(),
  ).toBeVisible();
});

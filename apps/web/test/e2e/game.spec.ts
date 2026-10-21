import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Home screen: type a nickname and create a room; resolves to the 5-character room code. */
async function createRoom(page: Page, nickname: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('Nickname').fill(nickname);
  await page.getByRole('button', { name: 'Create room' }).click();
  const heading = page.getByRole('heading', { name: /^Room [A-Z0-9]{5}$/ });
  await expect(heading).toBeVisible();
  const text = (await heading.textContent()) ?? '';
  return text.replace('Room ', '').trim();
}

async function startGame(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByRole('group', { name: 'Galaxy map' })).toBeVisible();
}

/** Phones show the player list in a bottom-sheet tab; desktops always show it. */
async function showPlayers(page: Page): Promise<void> {
  const tab = page.getByRole('tab', { name: 'Players' });
  if ((await tab.count()) > 0 && (await tab.getAttribute('aria-selected')) !== 'true') {
    await tab.click();
  }
}

test('solo vs 3 bots reaches end screen', async ({ page }) => {
  test.setTimeout(240_000);
  await createRoom(page, 'Solo');
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Add bot: Normal' }).click();
  }
  await expect(page.getByRole('list', { name: 'Players' }).getByRole('listitem')).toHaveCount(4);
  await page.getByLabel('Victory points to win').selectOption('6');
  await startGame(page);

  // The human never acts: the turn timer hands each of their turns to a bot.
  const started = Date.now();
  await expect(page.getByRole('heading', { name: /wins!$/ })).toBeVisible({ timeout: 180_000 });
  test.info().annotations.push({
    type: 'duration',
    description: `game finished after ${Math.round((Date.now() - started) / 1000)} s`,
  });
  await expect(page.getByText('The victory target was reached.', { exact: true })).toBeVisible();
  const ranking = page.getByRole('table', { name: 'Final ranking' });
  await expect(ranking).toBeVisible();
  // Rows are ranked: the first one holds the winner's points, which reached the target.
  const rows = ranking.getByRole('row');
  await expect(rows).toHaveCount(5);
  const winnerPoints = Number(await rows.nth(1).getByRole('cell').nth(2).textContent());
  expect(winnerPoints).toBeGreaterThanOrEqual(6);
  await expect(page.getByRole('button', { name: 'Back to start' })).toBeVisible();
});

test('friend joins via copied link', async ({ browser, page }) => {
  const host = page;
  await createRoom(host, 'Alice');

  // The invite field shows the same URL the "Copy invite link" button copies.
  const link = await host.getByLabel('Invite link').inputValue();
  expect(link).toMatch(/\/room\/[A-Z0-9]{5}$/);

  const guestContext = await browser.newContext({
    ...test.info().project.use,
    baseURL: test.info().project.use.baseURL ?? undefined,
  });
  const guest = await guestContext.newPage();
  try {
    await guest.goto(link);
    await guest.getByLabel('Nickname').fill('Bob');
    await guest.getByRole('button', { name: 'Join room' }).click();

    for (const view of [host, guest]) {
      const seats = view.getByRole('list', { name: 'Players' }).getByRole('listitem');
      await expect(seats).toHaveCount(2);
      await expect(seats.filter({ hasText: 'Alice' })).toHaveCount(1);
      await expect(seats.filter({ hasText: 'Bob' })).toHaveCount(1);
    }
    await expect(guest.getByText('Waiting for the host to start the game…')).toBeVisible();

    await startGame(host);
    await expect(guest.getByRole('group', { name: 'Galaxy map' })).toBeVisible();
  } finally {
    await guestContext.close();
  }
});

test('reload mid-game returns to the same seat', async ({ page }) => {
  await createRoom(page, 'Alice');
  await page.getByRole('button', { name: 'Add bot: Normal' }).click();
  await page.getByLabel('Victory points to win').selectOption('10');
  await startGame(page);

  await page.reload();
  await expect(page.getByRole('group', { name: 'Galaxy map' })).toBeVisible();
  await showPlayers(page);
  const players = page.getByRole('list', { name: 'Players' }).getByRole('listitem');
  const me = players.filter({ hasText: 'Alice' });
  await expect(me).toHaveCount(1);
  await expect(me.getByText('You', { exact: true })).toBeVisible();
  // No second seat was created for the reloaded tab.
  await expect(players).toHaveCount(2);
  await expect(players.filter({ hasText: 'You' })).toHaveCount(1);
});

test('language switch to HR changes UI text', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Create room' })).toBeVisible();

  await page.getByRole('button', { name: 'Hrvatski' }).click();
  await expect(page.getByRole('button', { name: 'Stvori sobu' })).toBeVisible();
  await expect(page.getByLabel('Nadimak')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hr');
  await expect(page.getByRole('button', { name: 'Create room' })).toHaveCount(0);

  // The choice survives a reload and reaches the lobby.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Stvori sobu' })).toBeVisible();
  await page.getByLabel('Nadimak').fill('Marko');
  await page.getByRole('button', { name: 'Stvori sobu' }).click();
  await expect(page.getByRole('button', { name: 'Dodaj bota: Normalni' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pokreni igru' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Soba [A-Z0-9]{5}$/ })).toBeVisible();
});

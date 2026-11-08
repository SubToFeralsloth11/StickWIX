import { expect, test, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { doc, newGame } from './helpers';

async function download(page: Page, testId: string) {
  const wait = page.waitForEvent('download');
  await page.getByTestId('export-menu').click();
  await page.getByTestId(testId).click();
  const d = await wait;
  const path = test.info().outputPath(d.suggestedFilename());
  await d.saveAs(path);
  return { path, name: d.suggestedFilename() };
}

// T110: quickstart scenario 5 (US5): export a game that plays offline and remembers values; project file round trip.
test('export the Clicker as one HTML file that plays offline and remembers Coins', async ({ page, context }) => {
  await newGame(page, 'clicker', 'Cookie Time');
  const d = await doc(page);
  const cookieKind = d.kinds.find((k) => k.lookId === 'builtin:img/cookie')!;
  const cookie = d.scenes[0]!.objects.find((o) => o.kindId === cookieKind.id)!;
  const html = await download(page, 'export-game');
  expect(html.name).toBe('cookie-time.html');

  // A fresh page with the network off opens the single file.
  const game = await context.newPage();
  await context.setOffline(true);
  const failed: string[] = [];
  game.on('requestfailed', (r) => failed.push(r.url()));
  await game.goto(pathToFileURL(html.path).href);
  await expect(game.getByText('Click to play')).toBeVisible();
  await expect(game.locator('button')).toHaveCount(1); // no editor UI
  await game.getByText('Click to play').click();

  const clickCookie = async () => {
    const box = (await game.locator('canvas').boundingBox())!;
    const sx = box.width / 960;
    const sy = box.height / 540;
    await game.mouse.click(box.x + (cookie.x + 64) * sx, box.y + (cookie.y + 64) * sy);
  };
  const coins = () => game.evaluate((id) => localStorage.getItem(`stickwix:${id}:Coins`), d.id);
  for (let i = 0; i < 3; i++) await clickCookie();
  await expect.poll(coins).toBe('3');

  // Reload: Coins comes back (the next click continues from 3).
  await game.reload();
  await game.getByText('Click to play').click();
  await clickCookie();
  await expect.poll(coins).toBe('4');
  expect(failed.filter((u) => !u.startsWith('file:'))).toEqual([]);

  // Letterboxed: the canvas keeps 16:9 when the window shape changes.
  await game.setViewportSize({ width: 700, height: 900 });
  const box = (await game.locator('canvas').boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(960 / 540, 1);
  await context.setOffline(false);
});

test('a project file round trip gives an identical project; junk files are refused', async ({ page }) => {
  await newGame(page, 'platformer', 'Backup Test');
  const original = await doc(page);
  const file = await download(page, 'export-project');
  expect(file.name).toBe('backup-test.stickwix');

  await page.getByRole('button', { name: 'Back to my games' }).click();
  await page.getByTestId('project-card').filter({ hasText: 'Backup Test' }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete game' }).click();
  await expect(page.getByTestId('project-card').filter({ hasText: 'Backup Test' })).toHaveCount(0);

  await page.getByTestId('import-file').setInputFiles(file.path);
  await expect(page.getByTestId('editor')).toBeVisible();
  const imported = await doc(page);
  const strip = (p: typeof original) => ({ ...p, id: undefined, createdAt: undefined, updatedAt: undefined });
  expect(strip(imported)).toEqual(strip(original));

  await page.getByRole('button', { name: 'Back to my games' }).click();
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  const before = 1;
  await page.getByTestId('import-file').setInputFiles({ name: 'notes.stickwix', mimeType: 'application/octet-stream', buffer: Buffer.from('hello') });
  await expect(page.getByRole('status').filter({ hasText: "This file isn't a StickWIX project." })).toBeVisible();
  await expect(page.getByTestId('project-card')).toHaveCount(before);
});

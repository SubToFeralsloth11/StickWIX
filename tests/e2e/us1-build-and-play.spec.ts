import { expect, test } from '@playwright/test';
import { canvasPoint, doc, gameEval, newGame } from './helpers';

// T044: quickstart scenario 1 (US1).
test('paint a floor, place a hero and a coin, play, collect, stop restores, undo/redo, one controller', async ({ page }) => {
  await newGame(page, 'blank');

  // Paint a solid floor with Fill box (tile 0 of the grass set is solid).
  await page.locator('[data-tour="tool-rect"]').click();
  await page.getByTestId('tile-0').click();
  await page.locator('[data-tour="tool-rect"]').click();
  const a = await canvasPoint(page, 4, 15 * 32 + 4);
  const b = await canvasPoint(page, 25 * 32 + 4, 16 * 32 + 4);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  expect(Object.keys((await doc(page)).scenes[0]!.tileLayer.cells).length).toBe(26 * 2);

  // Hero with the Platformer Controller.
  await page.locator('[data-tour="tab-art"]').click();
  await page.getByTestId('art-builtin:img/hero').dblclick();
  await page.getByTestId('add-sticker').click();
  await page.getByTestId('add-platformer').click();
  await page.getByLabel('X', { exact: true }).fill('64');
  await page.getByLabel('X', { exact: true }).press('Enter');

  // Coin with Collectible, placed on the floor to the hero's right.
  await page.getByTestId('art-builtin:img/coin').dblclick();
  await page.getByTestId('add-sticker').click();
  await page.getByTestId('add-collectible').click();
  await page.getByLabel('X', { exact: true }).fill('256');
  await page.getByLabel('X', { exact: true }).press('Enter');
  await page.getByLabel('Y', { exact: true }).fill(String(15 * 32 - 32));
  await page.getByLabel('Y', { exact: true }).press('Enter');

  // Second controller: StickWIX explains and offers to replace.
  const hero = (await doc(page)).kinds.find((k) => k.stickers.some((s) => s.type === 'platformer'))!;
  await page.evaluate((id) => (window as unknown as { __stickwixEditor: { getState(): { select(s: unknown[]): void } } }).__stickwixEditor.getState().select([{ kind: 'kind', id }]), hero.id);
  await page.getByTestId('add-sticker').click();
  await page.getByTestId('add-topdown').click();
  await expect(page.getByRole('heading', { name: 'Only one way to move' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect((await doc(page)).kinds.find((k) => k.id === hero.id)!.stickers.map((s) => s.type)).toEqual(['platformer']);

  // Play: the hero lands, runs right and collects the coin.
  await page.getByTestId('play').click();
  await expect(page.getByTestId('play-view')).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as { __stickwixGame?: unknown }).__stickwixGame);
  await page.waitForTimeout(500); // let the hero land (real game time)
  expect(await gameEval<boolean>(page, 'return [...g.scene.world.all()].find(i => i.stickers.some(s => s.type==="platformer")).grounded')).toBe(true);
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => {
    const g = (window as unknown as { __stickwixGame: { scene: { world: { all(): Iterable<{ stickers: { type: string }[] }> } } } }).__stickwixGame;
    return ![...g.scene.world.all()].some((i) => i.stickers.some((s) => s.type === 'collectible'));
  }, null, { timeout: 5000 });
  await page.keyboard.up('ArrowRight');

  // Stop: everything is back as before Play.
  await page.getByTestId('stop').click();
  await expect(page.getByTestId('play-view')).toHaveCount(0);
  const after = await doc(page);
  expect(after.scenes[0]!.objects).toHaveLength(2);
  expect(after.scenes[0]!.objects.find((o) => o.x === 256)).toBeTruthy();

  // Undo removes the Collectible sticker; redo puts it back.
  const coinKind = () => doc(page).then((d) => d.kinds.find((k) => k.lookId === 'builtin:img/coin')!);
  expect((await coinKind()).stickers.map((s) => s.type)).toEqual(['collectible']);
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  // Undo the two position edits, then the sticker.
  for (let i = 0; i < 3; i++) await page.keyboard.press('ControlOrMeta+z');
  expect((await coinKind()).stickers).toEqual([]);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect((await coinKind()).stickers.map((s) => s.type)).toEqual(['collectible']);
});

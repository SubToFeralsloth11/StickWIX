import { expect, test } from '@playwright/test';
import { canvasPoint, doc, editDoc, pickOption } from './helpers';

// T128: quickstart scenario 7 (US7): first launch tour builds a playable mini-platformer; warnings point at problems.
test('the guided tour walks a new user through a playable mini-platformer, then warnings show where things are wrong', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-tour').click();
  await expect(page.getByTestId('editor')).toBeVisible();
  const card = page.getByTestId('tour-card');
  await expect(card).toContainText('Paint the ground');

  // 1. Ground.
  await page.locator('[data-tour="tool-rect"]').click();
  await page.getByTestId('tile-0').click();
  await page.locator('[data-tour="tool-rect"]').click();
  const a = await canvasPoint(page, 4, 15 * 32 + 4);
  const b = await canvasPoint(page, 20 * 32 + 4, 15 * 32 + 4);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  await expect(card).toContainText('Add a hero from Presets');

  // 2. A preset hero.
  await page.locator('[data-tour="tab-presets"]').click();
  await page.getByTestId('preset-platformer-hero').dblclick();
  await expect(card).toContainText('Add a coin');

  // 3. A coin from the art, 4. with the Collectible sticker.
  await page.locator('[data-tour="tab-art"]').click();
  await page.getByTestId('art-builtin:img/coin').dblclick();
  await expect(card).toContainText('Stick on a sticker');
  await page.getByTestId('add-sticker').click();
  await page.getByTestId('add-collectible').click();
  await expect(card).toContainText('Write a sentence rule');

  // 5. When any Coin is collected → Score goes up by 1.
  await page.locator('[data-tour="tab-rules"]').click();
  await page.getByTestId('new-rule').click();
  await pickOption(page, 'a sticker event happens');
  await pickOption(page, 'change a value');
  await page.locator('.rule.incomplete [data-blank="trigger.target"]').click();
  await pickOption(page, /^any Coin/);
  await page.locator('.rule.incomplete [data-blank="actions.0.value"]').click();
  const hasScore = (await doc(page)).values.some((v) => v.name === 'Score');
  if (hasScore) await pickOption(page, /^Score/);
  else {
    await pickOption(page, 'New value');
    await page.getByLabel('New value name').fill('Score');
    await page.getByRole('button', { name: 'Make' }).click();
  }
  await expect(card).toContainText('Play it!');

  // 6. Play, 7. Show-me.
  await page.getByTestId('play').click();
  await expect(card).toContainText('Teach a rule with Show-me');
  await page.keyboard.press('Space');
  await page.keyboard.press('F2');
  await page.getByTestId('showme-event').filter({ hasText: 'Space was pressed' }).first().click();
  await page.getByLabel('Play a sound').selectOption({ label: 'Jump' });
  await page.getByTestId('showme-confirm').click();
  await expect(card).toContainText('You made a game!');

  // 8. Stop: the tour is over and the mini-platformer has its two rules.
  await page.getByTestId('stop').click();
  await expect(card).toHaveCount(0);
  const d = await doc(page);
  expect(d.scenes[0]!.rules.length).toBeGreaterThanOrEqual(2);

  // Warnings: delete the floor → "has nothing solid to stand on" → Show me where selects the hero.
  await editDoc(page, 'Remove floor', 'd.scenes[0].tileLayer.cells = {};');
  await page.locator('[data-tour="tab-warnings"]').click();
  const warn = page.getByTestId('warning').filter({ hasText: 'has nothing solid to stand on' });
  await expect(warn).toBeVisible();
  await warn.getByRole('button', { name: 'Show me where' }).click();
  await expect(page.getByTestId('inspector')).toBeVisible();
  const heroKind = (await doc(page)).kinds.find((k) => k.stickers.some((s) => s.type === 'platformer'))!;
  await expect(page.getByLabel('Kind name')).toHaveValue(heroKind.name);
});

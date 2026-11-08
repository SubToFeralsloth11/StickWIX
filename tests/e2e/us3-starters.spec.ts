import { expect, test } from '@playwright/test';
import { doc, gameEval, newGame } from './helpers';

// T087: quickstart scenario 3 (US3) and SC-002.
for (const starter of ['platformer', 'topdown', 'clicker'] as const) {
  test(`${starter} starter is playable within a minute of opening StickWIX`, async ({ page }) => {
    const t0 = Date.now();
    await newGame(page, starter);
    const d = await doc(page);
    expect(d.scenes.length).toBeGreaterThanOrEqual(2); // a level plus a win/goal screen
    expect(d.values.length).toBeGreaterThan(0); // on-screen values
    await page.getByTestId('play').click();
    await page.waitForFunction(() => !!(window as unknown as { __stickwixGame?: { totalTime: number } }).__stickwixGame?.totalTime);
    expect(Date.now() - t0).toBeLessThan(60_000);
    // The game is genuinely running: time advances and its rules are live (no broken/incomplete rules in a starter).
    const t = await gameEval<number>(page, 'return g.totalTime');
    await expect.poll(() => gameEval<number>(page, 'return g.totalTime')).toBeGreaterThan(t + 0.5);
    await page.getByTestId('stop').click();
    await expect(page.locator('.rule.incomplete, .rule.broken')).toHaveCount(0);
  });
}

test('the Patrolling Enemy preset arrives ready to patrol, and a rule preset inserts with blanks to fill', async ({ page }) => {
  await newGame(page, 'blank');
  await page.locator('[data-tour="tab-presets"]').click();
  await page.getByTestId('preset-patrolling-enemy').dblclick();
  const d = await doc(page);
  const enemy = d.kinds.find((k) => k.stickers.some((s) => s.type === 'patrol'))!;
  expect(enemy.stickers.map((s) => s.type)).toEqual(expect.arrayContaining(['patrol', 'hurts']));
  const placed = d.scenes[0]!.objects.find((o) => o.kindId === enemy.id)!;

  await page.getByTestId('play').click();
  await page.waitForFunction(() => !!(window as unknown as { __stickwixGame?: unknown }).__stickwixGame);
  await expect.poll(() => gameEval<number>(page, `const i = g.scene.world.get(${JSON.stringify(placed.id)}); return i ? Math.abs(i.x - ${placed.x}) : 0`)).toBeGreaterThan(8);
  await page.getByTestId('stop').click();

  await page.locator('[data-tour="tab-rules"]').click();
  await page.getByTestId('rule-presets').click();
  await page.locator('.pop .opt').filter({ hasText: 'Collect for points' }).first().click();
  await expect(page.locator('.rule.incomplete')).toHaveCount(1);
});

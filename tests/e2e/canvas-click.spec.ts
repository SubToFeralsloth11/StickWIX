import { expect, test } from '@playwright/test';
import { canvasPoint, doc, editDoc, newGame } from './helpers';

// Review round 1: a plain click that selects an object must never move it, at any window width.
for (const width of [1280, 1440, 1920]) {
  test(`clicking an object to select it leaves it where it is (${width}px wide)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await newGame(page, 'blank');
    await page.getByTestId('art-builtin:img/coin').dblclick();
    await editDoc(page, 'Place', 'const o = d.scenes[0].objects[0]; o.x = 256; o.y = 448;');
    await page.evaluate(() => (window as unknown as { __stickwixEditor: { getState(): { select(s: unknown[]): void } } }).__stickwixEditor.getState().select([]));
    const p = await canvasPoint(page, 256 + 16, 448 + 16);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('inspector')).toBeVisible();
    const o = (await doc(page)).scenes[0]!.objects[0]!;
    expect({ x: o.x, y: o.y }).toEqual({ x: 256, y: 448 });
  });
}

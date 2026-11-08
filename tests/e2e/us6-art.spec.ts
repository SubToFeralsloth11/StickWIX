import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { doc, editDoc, gameEval, newGame } from './helpers';

/** A PNG of random noise (barely compressible), so its file size tracks width × height. */
function noisePng(w: number, h: number): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < png.data.length; i++) png.data[i] = (Math.random() * 256) | 0;
  return PNG.sync.write(png, { deflateLevel: 1 });
}

// T119: quickstart scenario 6 (US6).
test('draw a two-frame sprite, use it as the walk look, and import pictures within and over the limits', async ({ page }) => {
  await newGame(page, 'blank');

  // Pixel editor: 32×32, two frames.
  await page.getByTestId('draw-new').click();
  await expect(page.getByTestId('pixel-editor')).toBeVisible();
  const board = page.getByTestId('pixel-board');
  const b = (await board.boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: b.x + b.width * fx, y: b.y + b.height * fy });
  let p = at(0.2, 0.5);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  p = at(0.8, 0.5);
  await page.mouse.move(p.x, p.y, { steps: 10 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Copy' }).click();
  p = at(0.5, 0.2);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  p = at(0.5, 0.8);
  await page.mouse.move(p.x, p.y, { steps: 10 });
  await page.mouse.up();
  await page.getByLabel('Drawing name').fill('Walker');
  await page.getByTestId('pixel-save').click();
  await expect(page.getByTestId('pixel-editor')).toHaveCount(0);
  const drawn = (await doc(page)) as unknown as { assets: { id: string; name: string; frames: { w: number; h: number; count: number } }[] };
  const walker = drawn.assets.find((a) => a.name === 'Walker')!;
  expect(walker.frames).toMatchObject({ w: 32, h: 32, count: 2 });

  // Hero with a floor; the drawing becomes its running look.
  await page.getByTestId('art-builtin:img/hero').dblclick();
  await page.getByTestId('add-sticker').click();
  await page.getByTestId('add-platformer').click();
  await page.getByLabel('Running look').selectOption(walker.id);
  await editDoc(page, 'Floor', "const s = d.scenes[0]; for (let x = 0; x < 30; x++) s.tileLayer.cells[x + ',15'] = 0;");
  await page.getByTestId('play').click();
  await page.waitForFunction(() => !!(window as unknown as { __stickwixGame?: unknown }).__stickwixGame);
  await gameEval(page, 'const h=[...g.scene.world.all()][0]; h.vy=0;');
  await page.keyboard.down('ArrowRight');
  await expect.poll(() => gameEval<string | null>(page, 'return [...g.scene.world.all()][0].lookId')).toBe(walker.id);
  await page.keyboard.up('ArrowRight');
  await page.getByTestId('stop').click();

  // Import: a ~3 MB PNG is accepted; a ~6 MB one is refused with the limit.
  const input = page.locator('input[type="file"][accept*=".png"]');
  await input.setInputFiles({ name: 'big-ok.png', mimeType: 'image/png', buffer: noisePng(870, 870) });
  await expect.poll(async () => ((await doc(page)) as unknown as { assets: { name: string }[] }).assets.some((a) => a.name.startsWith('big-ok'))).toBe(true);
  await input.setInputFiles({ name: 'too-big.png', mimeType: 'image/png', buffer: noisePng(1240, 1240) });
  await expect(page.getByRole('status').filter({ hasText: /at most 5 MB/ })).toBeVisible();
  expect(((await doc(page)) as unknown as { assets: { name: string }[] }).assets.some((a) => a.name.startsWith('too-big'))).toBe(false);
});

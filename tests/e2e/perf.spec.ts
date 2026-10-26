import { expect, test, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';

// T133 / SC-004: 200 patrolling, animated objects hold ≥ 58 FPS on average over 10 s,
// in the editor's Play and in the exported HTML. Always headed: headless Chromium draws
// WebGL in software (~44 FPS here while the simulation itself takes 0.3 ms a step), which
// says nothing about a real laptop GPU.
test.use({ headless: false });
const FIXTURE = new URL('../fixtures/stress-200.stickwix', import.meta.url).pathname;

async function averageFps(page: Page, seconds: number) {
  await page.waitForFunction(() => !!(window as unknown as { __stickwixFps?: { frames: number } }).__stickwixFps?.frames);
  await page.evaluate(() => {
    const s = (window as unknown as { __stickwixFps: { frames: number; seconds: number } }).__stickwixFps;
    Object.assign(window, { __perfStart: { frames: s.frames, seconds: s.seconds } });
  });
  await page.waitForTimeout(seconds * 1000); // measuring real frame pacing needs real time
  return page.evaluate(() => {
    const w = window as unknown as { __stickwixFps: { frames: number; seconds: number }; __perfStart: { frames: number; seconds: number } };
    return (w.__stickwixFps.frames - w.__perfStart.frames) / (w.__stickwixFps.seconds - w.__perfStart.seconds);
  });
}

test('200 objects run at 60 FPS in Play and in the exported game', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('/?fps');
  const noThanks = page.getByRole('button', { name: 'No thanks' });
  if (await noThanks.isVisible().catch(() => false)) await noThanks.click();
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await expect(page.getByTestId('editor')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __stickwixEditor: { getState(): { project: { scenes: { objects: unknown[] }[] } } } }).__stickwixEditor.getState().project.scenes[0]!.objects.length)).toBe(200);

  await page.getByTestId('play').click();
  const playFps = await averageFps(page, 10);
  console.log(`Play: ${playFps.toFixed(1)} fps`);
  expect(playFps).toBeGreaterThanOrEqual(58);
  await page.getByTestId('stop').click();

  const wait = page.waitForEvent('download');
  await page.getByTestId('export-menu').click();
  await page.getByTestId('export-game').click();
  const d = await wait;
  const path = test.info().outputPath('stress.html');
  await d.saveAs(path);
  const game = await context.newPage();
  await game.goto(`${pathToFileURL(path).href}?fps`);
  await game.getByText('Click to play').click();
  const exportFps = await averageFps(game, 10);
  console.log(`Exported: ${exportFps.toFixed(1)} fps`);
  expect(exportFps).toBeGreaterThanOrEqual(58);
});

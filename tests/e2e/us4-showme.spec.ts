import { expect, test } from '@playwright/test';
import { doc, editDoc, gameEval, newGame } from './helpers';

// T101: quickstart scenario 4 (US4): teach coin collecting with Show-me.
test('Show-me: touch a coin, freeze, put that coin in the bin, Score +1, confirm, and every coin works next Play', async ({ page }) => {
  await newGame(page, 'platformer');
  // Make coins plain objects: no Collectible sticker and no coin rules, so nothing collects them yet.
  await editDoc(
    page,
    'Strip coin collecting',
    `const coin = d.kinds.find(k => k.lookId === 'builtin:img/coin');
     coin.stickers = coin.stickers.filter(s => s.type !== 'collectible');
     coin.rules = [];
     const mentions = r => JSON.stringify(r).includes(coin.id);
     d.rules = d.rules.filter(r => !mentions(r));
     for (const s of d.scenes) s.rules = s.rules.filter(r => !mentions(r));
     for (const k of d.kinds) k.rules = k.rules.filter(r => !mentions(r));`,
  );
  const coinKind = (await doc(page)).kinds.find((k) => k.lookId === 'builtin:img/coin')!;
  const hero = (await doc(page)).kinds.find((k) => k.stickers.some((s) => s.type === 'platformer'))!;

  await page.getByTestId('play').click();
  await page.waitForFunction(() => !!(window as unknown as { __stickwixGame?: unknown }).__stickwixGame);
  // Put the hero right next to the first coin so they touch.
  await gameEval(page, `const h=[...g.scene.world.all()].find(i=>i.kindId===${JSON.stringify(hero.id)}); const c=g.scene.world.byKind(${JSON.stringify(coinKind.id)}).sort((a,b)=>a.x-b.x)[0]; h.x=c.x-4; h.y=c.y; h.vy=0;`);
  await page.waitForTimeout(150); // a few real frames so the touch happens

  await page.keyboard.press('F2');
  await expect(page.getByTestId('showme-panel')).toBeVisible();
  const event = page.getByTestId('showme-event').filter({ hasText: new RegExp(`touched ${coinKind.name}`) }).first();
  await event.click();

  // Drag the touched coin into the bin.
  const layer = (await page.getByTestId('showme-layer').boundingBox())!;
  const scale = layer.width / 960;
  const coin = await gameEval<{ x: number; y: number }>(
    page,
    `const h=[...g.scene.world.all()].find(i=>i.kindId===${JSON.stringify(hero.id)}); const c=g.scene.world.byKind(${JSON.stringify(coinKind.id)}).filter(i=>g.scene.world.overlaps(i,h))[0] ?? g.scene.world.byKind(${JSON.stringify(coinKind.id)}).sort((a,b)=>a.x-b.x)[0]; const cam=g.scene.camera; return {x:c.x-cam.x+c.w-3, y:c.y-cam.y+c.h/2};`,
  );
  const bin = (await page.getByTestId('showme-bin').boundingBox())!;
  await page.mouse.move(layer.x + coin.x * scale, layer.y + coin.y * scale);
  await page.mouse.down();
  await page.mouse.move(layer.x + coin.x * scale + 30, layer.y + coin.y * scale - 30, { steps: 4 });
  await page.mouse.move(bin.x + bin.width / 2, bin.y + bin.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.getByTestId('showme-plus-Score').click();

  await expect(page.getByTestId('showme-sentence')).toHaveText(`When ${hero.name} touches any ${coinKind.name} → that ${coinKind.name} disappears and Score goes up by 1.`);
  await page.getByTestId('showme-confirm').click();
  await expect(page.getByTestId('showme-panel')).toHaveCount(0);
  await page.getByTestId('stop').click();

  // Next Play: every coin is collectable.
  await page.getByTestId('play').click();
  await page.waitForFunction(() => !!(window as unknown as { __stickwixGame?: { totalTime: number } }).__stickwixGame?.totalTime);
  const before = await gameEval<number>(page, `return g.scene.world.byKind(${JSON.stringify(coinKind.id)}).length`);
  await gameEval(page, `const h=[...g.scene.world.all()].find(i=>i.kindId===${JSON.stringify(hero.id)}); for (const c of g.scene.world.byKind(${JSON.stringify(coinKind.id)}).slice(0,2)) { h.x=c.x; h.y=c.y; g.step(); g.step(); }`);
  expect(await gameEval<number>(page, `return g.scene.world.byKind(${JSON.stringify(coinKind.id)}).length`)).toBe(before - 2);
});

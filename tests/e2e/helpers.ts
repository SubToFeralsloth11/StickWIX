import { expect, type Page } from '@playwright/test';

/** Reads the document being edited (dev builds expose the store). */
export async function doc(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __stickwixEditor?: { getState(): { project: unknown } } };
    return w.__stickwixEditor!.getState().project as {
      id: string;
      name: string;
      kinds: { id: string; name: string; lookId: string | null; stickers: { type: string }[] }[];
      values: { id: string; name: string }[];
      rules: unknown[];
      scenes: { id: string; name: string; objects: { id: string; kindId: string; x: number; y: number }[]; rules: { id: string }[]; tileLayer: { cells: Record<string, number> } }[];
    };
  });
}

/** Runs an edit through the editor store (one undo step), for setting up scenarios quickly. */
export async function editDoc(page: Page, label: string, fn: string) {
  await page.evaluate(
    ([l, body]) => {
      const w = window as unknown as { __stickwixEditor: { getState(): { edit(l: string, r: (d: unknown) => void): void } } };
      w.__stickwixEditor.getState().edit(l, new Function('d', body) as (d: unknown) => void);
    },
    [label, fn] as const,
  );
}

/** Reads from the running game (dev builds expose it while playing). */
export async function gameEval<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate((body) => new Function('g', body)((window as unknown as { __stickwixGame: unknown }).__stickwixGame) as T, fn);
}

export async function valueByName(page: Page, name: string): Promise<unknown> {
  return gameEval(page, `const d=[...g.values.defs.values()].find(v=>v.name===${JSON.stringify(name)}); return d ? g.values.get(d.id) : undefined;`);
}

/** Home → New game → the given starter (or blank). Dismisses the first-launch tour offer. */
export async function newGame(page: Page, starter: 'blank' | 'platformer' | 'topdown' | 'clicker' = 'blank', name?: string) {
  await page.goto('/');
  const noThanks = page.getByRole('button', { name: 'No thanks' });
  if (await noThanks.isVisible().catch(() => false)) await noThanks.click();
  await page.getByRole('button', { name: /New game/ }).click();
  if (name) await page.getByLabel('Game name').fill(name);
  await page.getByTestId(`starter-${starter}`).click();
  await expect(page.getByTestId('editor')).toBeVisible();
}

/** Scene px → page px on the edit canvas (zoom 100%, default camera at -32,-32). */
export async function canvasPoint(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('scene-canvas').boundingBox())!;
  return { x: box.x + 32 + x, y: box.y + 32 + y };
}

/** Clicks a picker option by its leading text inside the open popover/menu. */
export async function pickOption(page: Page, text: string | RegExp) {
  await page.locator('.pop .opt').filter({ hasText: text }).first().click();
}

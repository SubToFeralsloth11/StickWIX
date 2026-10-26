import { expect, test, type Page } from '@playwright/test';
import { doc, newGame, pickOption, valueByName } from './helpers';

async function blank(page: Page, path: string) {
  await page.locator(`[data-blank="${path}"]`).last().click();
}

async function newRule(page: Page, trigger: string, action: string) {
  await page.getByTestId('new-rule').click();
  await pickOption(page, trigger);
  await pickOption(page, action);
}

async function makeValue(page: Page, name: string, start: number) {
  await page.getByTestId('new-value').click();
  const row = page.getByTestId('value-row').last();
  await row.getByLabel('Value name').fill(name);
  await row.getByLabel('Value name').press('Enter');
  await row.getByLabel('Starting amount').fill(String(start));
  await row.getByLabel('Starting amount').press('Tab');
}

async function clickGame(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('play-view').locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + (x / 960) * box.width, box.y + (y / 540) * box.height);
}

// T070: quickstart scenario 2 (US2), plus rule list operations and the Kind-delete warning.
test('a hand-made clicker with values, rules, a button and on-screen text', async ({ page }) => {
  await newGame(page, 'blank');

  // A Cookie in the middle of the screen (double-click places it at the screen centre).
  await page.getByTestId('art-builtin:img/cookie').dblclick();
  const cookie = (await doc(page)).kinds[0]!;

  // Values: Coins (0), Per Click (1).
  await page.locator('[data-tour="tab-values"]').click();
  await makeValue(page, 'Coins', 0);
  await makeValue(page, 'Per Click', 1);

  // Screen: text "Coins: {Coins}" and an "Upgrade" button.
  await page.locator('[data-tour="tab-screen"]').click();
  await page.getByTestId('add-ui-text').click();
  await page.getByTestId('add-ui-button').click();
  await page.getByLabel('Name', { exact: true }).fill('Upgrade');
  await page.getByLabel('Name', { exact: true }).press('Tab');

  // Rule 1: When [Cookie] is clicked → [Coins] goes up by [Per Click].
  await page.locator('[data-tour="tab-rules"]').click();
  await newRule(page, 'something is clicked', 'change a value');
  await blank(page, 'trigger.target');
  await pickOption(page, `any ${cookie.name}`);
  await blank(page, 'actions.0.value');
  await pickOption(page, /^Coins/);
  await blank(page, 'actions.0.amount');
  await pickOption(page, /^Per Click/);

  // Rule 2: When [Upgrade] is clicked, only if [Coins] is at least [10] → [Coins] goes down by [10], [Per Click] goes up by [1].
  await newRule(page, 'something is clicked', 'change a value');
  await blank(page, 'trigger.target');
  await pickOption(page, /^Upgrade/);
  const card = page.getByTestId('rule').last();
  await card.getByRole('button', { name: '＋ only if' }).click();
  await pickOption(page, 'a value is');
  await blank(page, 'conditions.items.0.value');
  await pickOption(page, /^Coins/);
  await blank(page, 'conditions.items.0.to');
  await page.getByLabel('Amount').fill('10');
  await page.getByLabel('Amount').press('Enter');
  await blank(page, 'actions.0.value');
  await pickOption(page, /^Coins/);
  await blank(page, 'actions.0.op');
  await pickOption(page, 'goes down by');
  await blank(page, 'actions.0.amount');
  await page.getByLabel('Amount').fill('10');
  await page.getByLabel('Amount').press('Enter');
  await card.getByTestId('add-action').click();
  await pickOption(page, 'change a value');
  await blank(page, 'actions.1.value');
  await pickOption(page, /^Per Click/);

  await expect(card.locator('.sentence')).toHaveText(
    'When Upgrade is clicked, only if Coins is at least 10 → Coins goes down by 10 and Per Click goes up by 1.'.replace(/ /g, ''),
    { useInnerText: false },
  ).catch(async () => {
    // Text nodes are separate chips; compare with whitespace collapsed.
    const text = (await card.locator('.sentence').innerText()).replace(/\s+/g, ' ').trim();
    expect(text).toBe('When Upgrade is clicked , only if Coins is at least 10 → Coins goes down by 10 and Per Click goes up by 1 .'.replace(' ,', ',').replace(' .', '.'));
  });
  await expect(page.locator('.rule.incomplete, .rule.broken')).toHaveCount(0);

  // Play: 10 clicks, Upgrade, then the next click adds 2.
  await page.getByTestId('play').click();
  await page.waitForFunction(() => !!(window as unknown as { __stickwixGame?: unknown }).__stickwixGame);
  for (let i = 0; i < 10; i++) await clickGame(page, 480, 270);
  await expect.poll(() => valueByName(page, 'Coins')).toBe(10);
  await clickGame(page, 40, 70); // the Upgrade button sits under the text at the top-left
  await expect.poll(() => valueByName(page, 'Coins')).toBe(0);
  await clickGame(page, 480, 270);
  await expect.poll(() => valueByName(page, 'Coins')).toBe(2);
  await page.getByTestId('stop').click();

  // Rule list: disable, duplicate, move, delete.
  const rules = page.getByTestId('rule');
  await expect(rules).toHaveCount(2);
  await rules.first().getByLabel('Rule on').uncheck();
  await expect(rules.first()).toHaveClass(/off/);
  await rules.first().getByRole('button', { name: 'Duplicate rule' }).click();
  await expect(rules).toHaveCount(3);
  await rules.last().getByRole('button', { name: 'Move rule up' }).click();
  await rules.last().getByRole('button', { name: 'Delete rule' }).click();
  await expect(rules).toHaveCount(2);

  // Deleting the Cookie Kind warns about the rule that uses it, then marks it broken.
  await page.evaluate((id) => (window as unknown as { __stickwixEditor: { getState(): { select(s: unknown[]): void } } }).__stickwixEditor.getState().select([{ kind: 'kind', id }]), cookie.id);
  await page.locator('[data-tour="tab-inspect"]').click();
  await page.getByRole('button', { name: /Delete the .* Kind/ }).click();
  await expect(page.getByRole('heading', { name: /Delete the Kind/ })).toBeVisible();
  await expect(page.getByText(/is clicked/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Delete anyway' }).click();
  await page.locator('[data-tour="tab-rules"]').click();
  await expect(page.locator('.rule.broken')).toHaveCount(1);
});

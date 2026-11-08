import { expect, test } from '@playwright/test';
import { doc, newGame } from './helpers';

// T018: FR-001 (blank), FR-002 (autosave + restore), FR-004 (list/open/rename/duplicate/delete).
test('create, edit, rename, duplicate, delete, and everything survives a reload', async ({ page }) => {
  await newGame(page, 'blank', 'Rocket Run');
  await page.getByTestId('art-builtin:img/hero').dblclick();
  await expect(page.getByTestId('inspector')).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const id = (await doc(page)).id;

  // Reload: the project re-opens from IndexedDB with the edit in it.
  await page.reload();
  await expect(page.getByTestId('editor')).toBeVisible();
  expect((await doc(page)).scenes[0]!.objects).toHaveLength(1);

  // Home: list, rename, duplicate, delete.
  await page.getByRole('button', { name: 'Back to my games' }).click();
  const card = page.getByTestId('project-card').filter({ hasText: 'Rocket Run' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('New name').fill('Rocket Run 2000');
  await page.getByLabel('New name').press('Enter');
  await expect(page.getByTestId('project-card').filter({ hasText: 'Rocket Run 2000' })).toBeVisible();

  await page.getByTestId('project-card').filter({ hasText: 'Rocket Run 2000' }).getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByTestId('project-card').filter({ hasText: 'Rocket Run 2000 copy' })).toBeVisible();

  await page.getByTestId('project-card').filter({ hasText: 'Rocket Run 2000 copy' }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete game' }).click();
  await expect(page.getByTestId('project-card').filter({ hasText: 'copy' })).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Open Rocket Run 2000' }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
  expect((await doc(page)).id).toBe(id);
});

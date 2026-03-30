import { expect, test } from '@playwright/test';
import { goToTrades, login } from './helpers';

test('authenticated user can open trades and positions pages', async ({ page }) => {
  await login(page);

  await goToTrades(page);
  await expect(page.getByRole('heading', { name: 'New Trade' })).toBeVisible();

  await page.getByRole('link', { name: 'Positions' }).click();
  await expect(page).toHaveURL(/\/positions$/);
  await expect(page.getByText('Current Composition')).toBeVisible();
  await expect(page.getByRole('button', { name: /Manage Lots/i }).first()).toBeVisible();
});

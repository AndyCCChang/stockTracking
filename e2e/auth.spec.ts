import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('redirects unauthenticated users to login', async ({ page }) => {
  await page.goto('/positions');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
});

test('login opens dashboard workspace', async ({ page }) => {
  await login(page);
  await expect(page.getByText('Stock Tracking Workspace')).toBeVisible();
  await expect(page.getByText('Market Value')).toBeVisible();
  await expect(page.getByText('System Status')).toBeVisible();
});

test('authenticated user can logout and is redirected to login', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
});

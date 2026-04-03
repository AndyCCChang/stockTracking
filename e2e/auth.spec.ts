import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('redirects unauthenticated users to login', async ({ page }) => {
  await page.goto('/positions');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
});

test('redirects invalid stored sessions to login with a notice', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('stock-tracking-token', 'invalid-jwt-token');
    localStorage.setItem(
      'stock-tracking-user',
      JSON.stringify({
        id: 999,
        email: 'expired@example.com',
        name: 'Expired Session',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    );
  });

  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  await expect(page.getByText(/session expired|no longer valid|sign in again/i)).toBeVisible();
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

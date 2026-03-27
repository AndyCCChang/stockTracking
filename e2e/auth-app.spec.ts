import { expect, test } from '@playwright/test';

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'DemoPass123!';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/$/);
}

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

test('authenticated user can open trades and positions pages', async ({ page }) => {
  await login(page);

  await page.getByRole('link', { name: 'Trades' }).click();
  await expect(page).toHaveURL(/\/trades$/);
  await expect(page.getByText('Trade Ledger')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New Trade' })).toBeVisible();

  await page.getByRole('link', { name: 'Positions' }).click();
  await expect(page).toHaveURL(/\/positions$/);
  await expect(page.getByText('Current Composition')).toBeVisible();
  await expect(page.getByRole('button', { name: /Manage Lots/i }).first()).toBeVisible();
});

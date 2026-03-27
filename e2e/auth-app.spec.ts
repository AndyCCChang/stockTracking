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

function tradeForm(page: import('@playwright/test').Page) {
  return {
    tickerInput: page.locator('label').filter({ hasText: /^Ticker$/ }).locator('input'),
    quantityInput: page.locator('label').filter({ hasText: /^Quantity$/ }).locator('input'),
    priceInput: page.locator('label').filter({ hasText: /Price/ }).locator('input'),
    feeInput: page.locator('label').filter({ hasText: /^Fee$/ }).locator('input'),
    notesInput: page.locator('label').filter({ hasText: /^Notes$/ }).locator('textarea')
  };
}

async function goToTrades(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Trades' }).click();
  await expect(page).toHaveURL(/\/trades$/);
  await expect(page.getByText('Trade Ledger')).toBeVisible();
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

  await goToTrades(page);
  await expect(page.getByRole('heading', { name: 'New Trade' })).toBeVisible();

  await page.getByRole('link', { name: 'Positions' }).click();
  await expect(page).toHaveURL(/\/positions$/);
  await expect(page.getByText('Current Composition')).toBeVisible();
  await expect(page.getByRole('button', { name: /Manage Lots/i }).first()).toBeVisible();
});

test('authenticated user can create a trade from the trades page', async ({ page }) => {
  await login(page);
  await goToTrades(page);

  const form = tradeForm(page);
  const ticker = `E2E${Date.now().toString().slice(-4)}`;

  await form.tickerInput.fill(ticker);
  await form.quantityInput.fill('3');
  await form.priceInput.fill('123.45');
  await form.feeInput.fill('1');
  await form.notesInput.fill('playwright create trade smoke');
  await page.getByRole('button', { name: 'Create Trade' }).click();

  await expect(page.getByText('Trade created successfully.')).toBeVisible();
  await expect(page.getByRole('cell', { name: ticker }).first()).toBeVisible();
});

test('authenticated user can edit a trade from the trades page', async ({ page }) => {
  await login(page);
  await goToTrades(page);

  const form = tradeForm(page);
  const ticker = `EDT${Date.now().toString().slice(-4)}`;

  await form.tickerInput.fill(ticker);
  await form.quantityInput.fill('4');
  await form.priceInput.fill('111.11');
  await form.feeInput.fill('1');
  await form.notesInput.fill('before edit');
  await page.getByRole('button', { name: 'Create Trade' }).click();
  await expect(page.getByText('Trade created successfully.')).toBeVisible();

  const tradeRow = page.locator('tr', { has: page.getByRole('cell', { name: ticker }) }).first();
  await tradeRow.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('button', { name: 'Update Trade' })).toBeVisible();

  await form.quantityInput.fill('7');
  await form.priceInput.fill('222.22');
  await page.getByRole('button', { name: 'Update Trade' }).click();

  await expect(page.getByText('Trade updated successfully.')).toBeVisible();
  await expect(tradeRow.getByRole('cell', { name: '7.00' })).toBeVisible();
});

test('authenticated user can delete a trade from the trades page', async ({ page }) => {
  await login(page);
  await goToTrades(page);

  const form = tradeForm(page);
  const ticker = `DEL${Date.now().toString().slice(-4)}`;

  await form.tickerInput.fill(ticker);
  await form.quantityInput.fill('2');
  await form.priceInput.fill('98.76');
  await form.feeInput.fill('1');
  await form.notesInput.fill('delete me');
  await page.getByRole('button', { name: 'Create Trade' }).click();
  await expect(page.getByText('Trade created successfully.')).toBeVisible();

  page.on('dialog', (dialog) => dialog.accept());
  const tradeRow = page.locator('tr', { has: page.getByRole('cell', { name: ticker }) }).first();
  await tradeRow.getByRole('button', { name: 'Delete' }).click();

  await expect(page.getByText('Trade deleted.')).toBeVisible();
  await expect(page.getByRole('cell', { name: ticker })).toHaveCount(0);
});

test('authenticated user can logout and is redirected to login', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { goToTrades, login, tradeForm } from './helpers';

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

import { expect, test } from '@playwright/test';
import { goToTrades, login, tradeForm } from './helpers';

test('authenticated user can create a SPECIFIC lot sell from the trades page', async ({ page }) => {
  await login(page);
  await goToTrades(page);

  const form = tradeForm(page);
  const ticker = `SPL${Date.now().toString().slice(-4)}`;

  await form.tickerInput.fill(ticker);
  await form.quantityInput.fill('5');
  await form.priceInput.fill('100');
  await form.feeInput.fill('1');
  await form.notesInput.fill('specific lot buy seed');
  await page.getByRole('button', { name: 'Create Trade' }).click();
  await expect(page.getByText('Trade created successfully.')).toBeVisible();

  await form.tickerInput.fill(ticker);
  await page.getByLabel('Type').selectOption('SELL');
  await form.quantityInput.fill('2');
  await form.priceInput.fill('150');
  await form.feeInput.fill('1');
  await form.notesInput.fill('specific lot sell');

  await page.getByRole('button', { name: 'Specific Lot Selection' }).click();
  await expect(page.getByText('Allocated Total')).toBeVisible();
  await expect(page.getByText('Allocate Now')).toBeVisible();

  const allocationInput = page
    .locator('table')
    .filter({ has: page.getByText('Allocate Now') })
    .locator('tbody input')
    .first();

  await allocationInput.fill('2');
  await page.getByRole('button', { name: 'Create Trade' }).click();

  await expect(page.getByText('Trade created successfully.')).toBeVisible();
  const sellRow = page.locator('tr', { has: page.getByRole('cell', { name: ticker }) }).filter({ hasText: 'SELL' }).first();
  await expect(sellRow).toContainText('SPECIFIC');
});

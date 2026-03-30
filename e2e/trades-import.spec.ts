import { expect, test } from '@playwright/test';
import { goToTrades, login } from './helpers';

test('authenticated user can import trades from CSV', async ({ page }) => {
  await login(page);
  await goToTrades(page);

  const ticker = `CSV${Date.now().toString().slice(-4)}`;
  const csv = [
    'ticker,tradeDate,type,quantity,price,fee,notes,currency,lotSelectionMethod',
    `${ticker},2026-03-20,BUY,4,210.5,1,csv import smoke,USD,FIFO`
  ].join('\n');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'trades-import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv)
  });

  await expect(page.getByText('Import Preview')).toBeVisible();
  await expect(page.getByText('File: trades-import.csv')).toBeVisible();
  await expect(page.getByRole('cell', { name: ticker })).toBeVisible();
  await page.getByRole('button', { name: 'Import Ready Rows' }).click();

  await expect(page.getByText('Imported 1 trades successfully.')).toBeVisible();
  await expect(page.getByRole('cell', { name: ticker }).first()).toBeVisible();
});

test('authenticated user can import SPECIFIC lot trades from CSV', async ({ page }) => {
  await login(page);
  await goToTrades(page);

  const ticker = `CSVS${Date.now().toString().slice(-4)}`;
  const csv = [
    'importRef,ticker,tradeDate,type,quantity,price,fee,notes,currency,lotSelectionMethod,allocations',
    `LOT-${ticker},${ticker},2026-03-18,BUY,5,100,1,csv specific buy,USD,FIFO,`,
    `,${ticker},2026-03-20,SELL,2,145,1,csv specific sell,USD,SPECIFIC,"[{""buyTradeRef"":""LOT-${ticker}"",""quantity"":2}]"`
  ].join('\n');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'trades-specific-import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv)
  });

  await expect(page.getByText('Import Preview')).toBeVisible();
  await expect(page.getByText('File: trades-specific-import.csv')).toBeVisible();
  await expect(page.getByRole('cell', { name: ticker })).toHaveCount(2);
  await page.getByRole('button', { name: 'Import Ready Rows' }).click();

  await expect(page.getByText('Imported 2 trades successfully.')).toBeVisible();
  const sellRow = page.locator('tr', { has: page.getByRole('cell', { name: ticker }) }).filter({ hasText: 'SELL' }).first();
  await expect(sellRow).toContainText('SPECIFIC');
});

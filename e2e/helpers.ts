import { expect, type Page } from '@playwright/test';

export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'DemoPass123!';

export async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(DEMO_EMAIL);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/$/);
}

export async function goToTrades(page: Page) {
  await page.getByRole('link', { name: 'Trades' }).click();
  await expect(page).toHaveURL(/\/trades$/);
  await expect(page.getByText('Trade Ledger')).toBeVisible();
}

export function tradeForm(page: Page) {
  return {
    tickerInput: page.locator('label').filter({ hasText: /^Ticker$/ }).locator('input'),
    quantityInput: page.locator('label').filter({ hasText: /^Quantity$/ }).locator('input'),
    priceInput: page.locator('label').filter({ hasText: /Price/ }).locator('input'),
    feeInput: page.locator('label').filter({ hasText: /^Fee$/ }).locator('input'),
    notesInput: page.locator('label').filter({ hasText: /^Notes$/ }).locator('textarea')
  };
}

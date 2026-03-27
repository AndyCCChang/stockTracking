import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { createApp } from '../app.js';
import { validateTradeInput } from '../lib/validation.js';
import { createTradeWithValidation, resetTrades } from '../services.js';

type AuthPayload = {
  token: string;
  user: { id: number; email: string };
};

async function startTestServer() {
  resetTrades();
  const app = createApp();
  const server = createServer(app);
  server.listen(0);
  await once(server, 'listening');

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'analytics@example.com', password: 'Password123!', name: 'Analytics User' })
  });
  const auth = await registerResponse.json() as AuthPayload;

  const aaplBuyOne = createTradeWithValidation(auth.user.id, validateTradeInput({
    ticker: 'AAPL',
    tradeDate: '2026-01-03',
    type: 'BUY',
    quantity: 10,
    price: 180,
    fee: 1
  }));

  const aaplBuyTwo = createTradeWithValidation(auth.user.id, validateTradeInput({
    ticker: 'AAPL',
    tradeDate: '2026-01-10',
    type: 'BUY',
    quantity: 5,
    price: 190,
    fee: 1
  }));

  const aaplSell = createTradeWithValidation(auth.user.id, validateTradeInput({
    ticker: 'AAPL',
    tradeDate: '2026-02-10',
    type: 'SELL',
    quantity: 6,
    price: 210,
    fee: 3,
    lotSelectionMethod: 'SPECIFIC',
    allocations: [
      { buyTradeId: aaplBuyOne.id, quantity: 4 },
      { buyTradeId: aaplBuyTwo.id, quantity: 2 }
    ]
  }));

  createTradeWithValidation(auth.user.id, validateTradeInput({
    ticker: 'MSFT',
    tradeDate: '2026-01-15',
    type: 'BUY',
    quantity: 6,
    price: 390,
    fee: 1
  }));

  return {
    server,
    baseUrl,
    token: auth.token,
    ids: {
      aaplBuyOneId: aaplBuyOne.id,
      aaplBuyTwoId: aaplBuyTwo.id,
      aaplSellId: aaplSell.id
    }
  };
}

test('GET /api/dashboard returns stable analytics payload', async () => {
  const { server, baseUrl, token } = await startTestServer();

  const response = await fetch(`${baseUrl}/api/dashboard`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(typeof payload.totalCostBasis, 'number');
  assert.ok(payload.totalMarketValue === null || typeof payload.totalMarketValue === 'number');
  assert.equal(typeof payload.totalRealizedPnL, 'number');
  assert.ok(payload.totalUnrealizedPnL === null || typeof payload.totalUnrealizedPnL === 'number');
  assert.ok(payload.totalReturnRate === null || typeof payload.totalReturnRate === 'number');
  assert.equal(typeof payload.currentYearRealizedPnL, 'number');
  assert.ok(payload.currentYearUnrealizedPnL === null || typeof payload.currentYearUnrealizedPnL === 'number');
  assert.equal(typeof payload.openPositionCount, 'number');
  assert.ok(Array.isArray(payload.cumulativePnLSeries));
  assert.ok(Array.isArray(payload.unrealizedDistribution));
  assert.ok(Array.isArray(payload.yearlyOverview));

  server.close();
  await once(server, 'close');
  resetTrades();
});

test('GET /api/realized returns allocation-based grouped sell records', async () => {
  const { server, baseUrl, token, ids } = await startTestServer();

  const response = await fetch(`${baseUrl}/api/realized`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.length, 1);
  assert.equal(payload[0].sellTradeId, ids.aaplSellId);
  assert.equal(payload[0].lotSelectionMethod, 'SPECIFIC');
  assert.equal(payload[0].quantity, 6);
  assert.equal(payload[0].allocations.length, 2);
  assert.equal(payload[0].allocations[0].buyTradeId, ids.aaplBuyOneId);
  assert.equal(payload[0].allocations[0].quantity, 4);
  assert.equal(payload[0].allocations[1].buyTradeId, ids.aaplBuyTwoId);
  assert.equal(payload[0].allocations[1].quantity, 2);
  assert.equal(typeof payload[0].realizedPnL, 'number');
  assert.equal(typeof payload[0].returnRate, 'number');

  server.close();
  await once(server, 'close');
  resetTrades();
});

test('GET /api/positions reflects remaining open lots after allocations', async () => {
  const { server, baseUrl, token } = await startTestServer();

  const response = await fetch(`${baseUrl}/api/positions`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.length, 2);

  const aapl = payload.find((item: { ticker: string }) => item.ticker === 'AAPL');
  assert.ok(aapl);
  assert.equal(aapl.quantity, 9);
  assert.equal(aapl.openLotsCount, 2);
  assert.equal(typeof aapl.costBasis, 'number');
  assert.ok(aapl.marketValue === null || typeof aapl.marketValue === 'number');
  assert.ok(aapl.unrealizedPnL === null || typeof aapl.unrealizedPnL === 'number');

  server.close();
  await once(server, 'close');
  resetTrades();
});

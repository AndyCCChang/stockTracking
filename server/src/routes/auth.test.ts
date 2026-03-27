import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { createApp } from '../app.js';
import { resetTrades, createTradeWithValidation } from '../services.js';
import { validateTradeInput } from '../lib/validation.js';

type AuthPayload = {
  token: string;
  user: {
    id: number;
    email: string;
    name: string | null;
  };
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

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function register(baseUrl: string, email: string, password = 'Password123!', name = 'Tester') {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name })
  });
  const payload = await response.json() as AuthPayload | { message: string };
  return { response, payload };
}

async function login(baseUrl: string, email: string, password = 'Password123!') {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const payload = await response.json() as AuthPayload | { message: string };
  return { response, payload };
}

test('register and login return JWT token and user payload', async () => {
  const { server, baseUrl } = await startTestServer();

  const registerResult = await register(baseUrl, 'alpha@example.com');
  assert.equal(registerResult.response.status, 201);
  assert.equal(typeof (registerResult.payload as AuthPayload).token, 'string');
  assert.equal((registerResult.payload as AuthPayload).user.email, 'alpha@example.com');

  const loginResult = await login(baseUrl, 'alpha@example.com');
  assert.equal(loginResult.response.status, 200);
  assert.equal(typeof (loginResult.payload as AuthPayload).token, 'string');
  assert.equal((loginResult.payload as AuthPayload).user.email, 'alpha@example.com');

  server.close();
  await once(server, 'close');
  resetTrades();
});

test('protected API rejects requests without token', async () => {
  const { server, baseUrl } = await startTestServer();

  const response = await fetch(`${baseUrl}/api/trades`);
  const payload = await response.json() as { message: string };

  assert.equal(response.status, 401);
  assert.match(payload.message, /Bearer token|Authentication required/i);

  server.close();
  await once(server, 'close');
  resetTrades();
});

test('user B cannot modify user A trade and cannot see user A trades', async () => {
  const { server, baseUrl } = await startTestServer();

  const alpha = await register(baseUrl, 'alpha@example.com');
  const beta = await register(baseUrl, 'beta@example.com');
  const alphaAuth = alpha.payload as AuthPayload;
  const betaAuth = beta.payload as AuthPayload;

  const trade = createTradeWithValidation(alphaAuth.user.id, validateTradeInput({
    ticker: 'AAPL',
    tradeDate: '2026-03-01',
    type: 'BUY',
    quantity: 10,
    price: 190,
    fee: 1
  }));

  const forbiddenResponse = await fetch(`${baseUrl}/api/trades/${trade.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${betaAuth.token}` }
  });
  const forbiddenPayload = await forbiddenResponse.json() as { message: string };

  assert.equal(forbiddenResponse.status, 403);
  assert.match(forbiddenPayload.message, /access|permission/i);

  const listResponse = await fetch(`${baseUrl}/api/trades`, {
    headers: { Authorization: `Bearer ${betaAuth.token}` }
  });
  const listPayload = await listResponse.json() as { items: Array<{ id: number }> };

  assert.equal(listResponse.status, 200);
  assert.equal(listPayload.items.length, 0);

  server.close();
  await once(server, 'close');
  resetTrades();
});

test('SELL allocation cannot use another user BUY lot', async () => {
  const { server, baseUrl } = await startTestServer();

  const alpha = await register(baseUrl, 'alpha@example.com');
  const beta = await register(baseUrl, 'beta@example.com');
  const alphaAuth = alpha.payload as AuthPayload;
  const betaAuth = beta.payload as AuthPayload;

  const alphaBuy = createTradeWithValidation(alphaAuth.user.id, validateTradeInput({
    ticker: 'NVDA',
    tradeDate: '2026-03-01',
    type: 'BUY',
    quantity: 10,
    price: 900,
    fee: 1
  }));

  const response = await fetch(`${baseUrl}/api/trades`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${betaAuth.token}`
    },
    body: JSON.stringify({
      ticker: 'NVDA',
      tradeDate: '2026-03-05',
      type: 'SELL',
      quantity: 5,
      price: 920,
      fee: 1,
      lotSelectionMethod: 'SPECIFIC',
      allocations: [{ buyTradeId: alphaBuy.id, quantity: 5 }]
    })
  });
  const payload = await response.json() as { message: string };

  assert.equal(response.status, 403);
  assert.match(payload.message, /another user|permission/i);

  server.close();
  await once(server, 'close');
  resetTrades();
});

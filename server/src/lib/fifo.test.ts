import assert from 'node:assert/strict';
import test from 'node:test';
import { getAllTradeAllocations, getTradeById } from '../db/tradeRepository.js';
import { InsufficientPositionError, ValidationError } from './errors.js';
import {
  buildAllocationPlan,
  calculateOpenPositionsFromLots,
  calculateRealizedPnLFromAllocations,
  validateLotAllocations
} from './fifo.js';
import { validateTradeInput } from './validation.js';
import { createTradeWithValidation, resetTrades, updateTradeWithValidation } from '../services.js';
import type { TradeLotAllocationRecord, TradeRecord } from '../types.js';

function createTrade(overrides: Partial<TradeRecord>): TradeRecord {
  const id = overrides.id ?? 1;
  const tradeDate = overrides.tradeDate ?? '2025-01-01';

  return {
    id,
    ticker: overrides.ticker ?? 'AAPL',
    tradeDate,
    type: overrides.type ?? 'BUY',
    quantity: overrides.quantity ?? 10,
    price: overrides.price ?? 100,
    fee: overrides.fee ?? 0,
    notes: overrides.notes ?? null,
    currency: overrides.currency ?? 'USD',
    lotSelectionMethod: overrides.lotSelectionMethod ?? 'FIFO',
    createdAt: overrides.createdAt ?? `${tradeDate}T09:30:00.000Z`,
    updatedAt: overrides.updatedAt ?? `${tradeDate}T09:30:00.000Z`,
    allocations: overrides.allocations ?? []
  };
}

function allocationRow(overrides: Partial<TradeLotAllocationRecord>): TradeLotAllocationRecord {
  return {
    id: overrides.id ?? 1,
    sellTradeId: overrides.sellTradeId ?? 99,
    buyTradeId: overrides.buyTradeId ?? 1,
    quantity: overrides.quantity ?? 1,
    createdAt: overrides.createdAt ?? '2025-01-10T09:30:00.000Z',
    buyPriceSnapshot: overrides.buyPriceSnapshot ?? 100,
    buyTradeDateSnapshot: overrides.buyTradeDateSnapshot ?? '2025-01-01'
  };
}

test('FIFO auto allocation builds expected allocations', () => {
  const trades = [
    createTrade({ id: 1, ticker: 'AAPL', type: 'BUY', quantity: 5, price: 100, tradeDate: '2025-01-01' }),
    createTrade({ id: 2, ticker: 'AAPL', type: 'BUY', quantity: 4, price: 105, tradeDate: '2025-01-02', createdAt: '2025-01-02T09:30:00.000Z', updatedAt: '2025-01-02T09:30:00.000Z' }),
    createTrade({ id: 3, ticker: 'AAPL', type: 'SELL', quantity: 6, price: 120, tradeDate: '2025-01-03', createdAt: '2025-01-03T09:30:00.000Z', updatedAt: '2025-01-03T09:30:00.000Z', lotSelectionMethod: 'FIFO' })
  ];

  const allocations = buildAllocationPlan(trades, []);
  assert.deepEqual(
    allocations.map((item) => ({ buyTradeId: item.buyTradeId, quantity: item.quantity })),
    [
      { buyTradeId: 1, quantity: 5 },
      { buyTradeId: 2, quantity: 1 }
    ]
  );
});

test('Specific allocation succeeds with requested lots', () => {
  const trades = [
    createTrade({ id: 1, ticker: 'NVDA', type: 'BUY', quantity: 10, price: 500, tradeDate: '2025-01-01' }),
    createTrade({ id: 2, ticker: 'NVDA', type: 'BUY', quantity: 8, price: 520, tradeDate: '2025-01-02', createdAt: '2025-01-02T09:30:00.000Z', updatedAt: '2025-01-02T09:30:00.000Z' }),
    createTrade({ id: 3, ticker: 'NVDA', type: 'SELL', quantity: 6, price: 610, tradeDate: '2025-01-10', createdAt: '2025-01-10T09:30:00.000Z', updatedAt: '2025-01-10T09:30:00.000Z', lotSelectionMethod: 'SPECIFIC' })
  ];

  const allocations = buildAllocationPlan(
    trades,
    [],
    new Map([[3, [{ buyTradeId: 2, quantity: 6 }]]])
  );

  assert.deepEqual(
    allocations.map((item) => ({ buyTradeId: item.buyTradeId, quantity: item.quantity })),
    [{ buyTradeId: 2, quantity: 6 }]
  );
});

test('Specific allocation quantity total must equal SELL quantity', () => {
  const sellTrade = createTrade({ id: 3, ticker: 'NVDA', type: 'SELL', quantity: 6, tradeDate: '2025-01-10', lotSelectionMethod: 'SPECIFIC' });

  assert.throws(
    () => validateLotAllocations(sellTrade, [{ buyTradeId: 1, quantity: 5 }], [
      {
        buyTradeId: 1,
        ticker: 'NVDA',
        tradeDate: '2025-01-01',
        originalQuantity: 10,
        allocatedQuantity: 0,
        availableQuantity: 10,
        price: 500,
        fee: 1,
        currency: 'USD'
      }
    ]),
    ValidationError
  );
});

test('Specific allocation cannot exceed available lot quantity', () => {
  const sellTrade = createTrade({ id: 3, ticker: 'NVDA', type: 'SELL', quantity: 6, tradeDate: '2025-01-10', lotSelectionMethod: 'SPECIFIC' });

  assert.throws(
    () => validateLotAllocations(sellTrade, [{ buyTradeId: 1, quantity: 7 }], [
      {
        buyTradeId: 1,
        ticker: 'NVDA',
        tradeDate: '2025-01-01',
        originalQuantity: 10,
        allocatedQuantity: 4,
        availableQuantity: 6,
        price: 500,
        fee: 1,
        currency: 'USD'
      }
    ]),
    InsufficientPositionError
  );
});

test('Realized pnl is calculated from persisted allocations', () => {
  const trades = [
    createTrade({ id: 1, ticker: 'AAPL', type: 'BUY', quantity: 10, price: 100, fee: 1, tradeDate: '2025-01-01' }),
    createTrade({ id: 2, ticker: 'AAPL', type: 'SELL', quantity: 4, price: 120, fee: 2, tradeDate: '2025-01-05', createdAt: '2025-01-05T09:30:00.000Z', updatedAt: '2025-01-05T09:30:00.000Z', lotSelectionMethod: 'SPECIFIC' })
  ];
  const allocations = [allocationRow({ sellTradeId: 2, buyTradeId: 1, quantity: 4, buyPriceSnapshot: 100, buyTradeDateSnapshot: '2025-01-01' })];

  const realized = calculateRealizedPnLFromAllocations(trades, allocations);
  assert.equal(realized.matches.length, 1);
  assert.equal(Number(realized.totalRealizedPnL.toFixed(2)), 77.6);
});

test('Updating SELL rebuilds allocations correctly', () => {
  resetTrades();

  const buy1 = createTradeWithValidation(validateTradeInput({
    ticker: 'MSFT',
    tradeDate: '2025-01-01',
    type: 'BUY',
    quantity: 5,
    price: 100,
    fee: 0
  }));
  const buy2 = createTradeWithValidation(validateTradeInput({
    ticker: 'MSFT',
    tradeDate: '2025-01-02',
    type: 'BUY',
    quantity: 5,
    price: 110,
    fee: 0
  }));
  const sell = createTradeWithValidation(validateTradeInput({
    ticker: 'MSFT',
    tradeDate: '2025-01-10',
    type: 'SELL',
    quantity: 4,
    price: 130,
    fee: 1,
    lotSelectionMethod: 'FIFO'
  }));

  const updated = updateTradeWithValidation(sell.id, validateTradeInput({
    ticker: 'MSFT',
    tradeDate: '2025-01-10',
    type: 'SELL',
    quantity: 4,
    price: 130,
    fee: 1,
    lotSelectionMethod: 'SPECIFIC',
    allocations: [{ buyTradeId: buy2.id, quantity: 4 }]
  }));

  const refreshed = getTradeById(updated.id);
  const allocations = getAllTradeAllocations().filter((item) => item.sellTradeId === updated.id);
  const positions = calculateOpenPositionsFromLots([buy1, buy2, updated], allocations);

  assert.equal(refreshed?.lotSelectionMethod, 'SPECIFIC');
  assert.deepEqual(
    allocations.map((item) => ({ buyTradeId: item.buyTradeId, quantity: item.quantity })),
    [{ buyTradeId: buy2.id, quantity: 4 }]
  );
  assert.equal(positions[0]?.lots.find((lot) => lot.buyTradeId === buy1.id)?.availableQuantity, 5);
  assert.equal(positions[0]?.lots.find((lot) => lot.buyTradeId === buy2.id)?.availableQuantity, 1);

  resetTrades();
});

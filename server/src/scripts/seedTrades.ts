import { createTradeWithValidation, resetTrades } from '../services.js';
import { validateTradeInput } from '../lib/validation.js';

resetTrades();

const aaplBuy = createTradeWithValidation(validateTradeInput({
  ticker: 'AAPL',
  tradeDate: '2025-01-08',
  type: 'BUY',
  quantity: 100,
  price: 190,
  fee: 1.5,
  notes: 'Initial AAPL position'
}));

createTradeWithValidation(validateTradeInput({
  ticker: 'AAPL',
  tradeDate: '2025-02-12',
  type: 'SELL',
  quantity: 40,
  price: 198,
  fee: 1.2,
  notes: 'FIFO trim into strength',
  lotSelectionMethod: 'FIFO'
}));

const tslaBuy = createTradeWithValidation(validateTradeInput({
  ticker: 'TSLA',
  tradeDate: '2025-01-15',
  type: 'BUY',
  quantity: 30,
  price: 220,
  fee: 1.1,
  notes: 'Starter TSLA'
}));

createTradeWithValidation(validateTradeInput({
  ticker: 'TSLA',
  tradeDate: '2025-03-03',
  type: 'SELL',
  quantity: 10,
  price: 245,
  fee: 1,
  notes: 'Specific TSLA profit taking',
  lotSelectionMethod: 'SPECIFIC',
  allocations: [{ buyTradeId: tslaBuy.id, quantity: 10 }]
}));

const nvdaBuy1 = createTradeWithValidation(validateTradeInput({
  ticker: 'NVDA',
  tradeDate: '2025-01-22',
  type: 'BUY',
  quantity: 20,
  price: 610,
  fee: 1.3,
  notes: 'AI exposure'
}));

const nvdaBuy2 = createTradeWithValidation(validateTradeInput({
  ticker: 'NVDA',
  tradeDate: '2025-02-10',
  type: 'BUY',
  quantity: 15,
  price: 640,
  fee: 1.1,
  notes: 'Add on breakout'
}));

createTradeWithValidation(validateTradeInput({
  ticker: 'NVDA',
  tradeDate: '2025-03-14',
  type: 'SELL',
  quantity: 18,
  price: 700,
  fee: 1.5,
  notes: 'Specific NVDA scale out',
  lotSelectionMethod: 'SPECIFIC',
  allocations: [
    { buyTradeId: nvdaBuy1.id, quantity: 12 },
    { buyTradeId: nvdaBuy2.id, quantity: 6 }
  ]
}));

const msftBuy1 = createTradeWithValidation(validateTradeInput({
  ticker: 'MSFT',
  tradeDate: '2025-01-28',
  type: 'BUY',
  quantity: 25,
  price: 410,
  fee: 1,
  notes: 'Cloud leader'
}));

createTradeWithValidation(validateTradeInput({
  ticker: 'MSFT',
  tradeDate: '2025-02-25',
  type: 'SELL',
  quantity: 8,
  price: 430,
  fee: 0.9,
  notes: 'FIFO partial exit',
  lotSelectionMethod: 'FIFO'
}));

createTradeWithValidation(validateTradeInput({
  ticker: 'MSFT',
  tradeDate: '2025-03-20',
  type: 'BUY',
  quantity: 12,
  price: 415,
  fee: 1,
  notes: 'Reload after pullback'
}));

console.log(`Seeded trades with allocation support. Example buy trade ids: AAPL ${aaplBuy.id}, NVDA ${nvdaBuy1.id}/${nvdaBuy2.id}, MSFT ${msftBuy1.id}`);

import { createUser, findUserByEmail } from '../db/userRepository.js';
import { validateTradeInput } from '../lib/validation.js';
import { createTradeWithValidation } from '../services.js';
import { hashPassword } from '../utils/password.js';

export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'DemoPass123!';

export async function seedDemoData() {
  const existing = await findUserByEmail(DEMO_EMAIL);
  if (existing) {
    return {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      userId: existing.id,
      seeded: false
    };
  }

  const demoUserId = await createUser({
    email: DEMO_EMAIL,
    passwordHash: await hashPassword(DEMO_PASSWORD),
    name: 'Demo User'
  });

  const aaplBuy = await createTradeWithValidation(demoUserId, validateTradeInput({
    ticker: 'AAPL',
    tradeDate: '2025-01-08',
    type: 'BUY',
    quantity: 100,
    price: 190,
    fee: 1.5,
    notes: 'Initial AAPL position'
  }));

  await createTradeWithValidation(demoUserId, validateTradeInput({
    ticker: 'AAPL',
    tradeDate: '2025-02-12',
    type: 'SELL',
    quantity: 40,
    price: 198,
    fee: 1.2,
    notes: 'FIFO trim into strength',
    lotSelectionMethod: 'FIFO'
  }));

  const tslaBuy = await createTradeWithValidation(demoUserId, validateTradeInput({
    ticker: 'TSLA',
    tradeDate: '2025-01-15',
    type: 'BUY',
    quantity: 30,
    price: 220,
    fee: 1.1,
    notes: 'Starter TSLA'
  }));

  await createTradeWithValidation(demoUserId, validateTradeInput({
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

  const nvdaBuy1 = await createTradeWithValidation(demoUserId, validateTradeInput({
    ticker: 'NVDA',
    tradeDate: '2025-01-22',
    type: 'BUY',
    quantity: 20,
    price: 610,
    fee: 1.3,
    notes: 'AI exposure'
  }));

  const nvdaBuy2 = await createTradeWithValidation(demoUserId, validateTradeInput({
    ticker: 'NVDA',
    tradeDate: '2025-02-10',
    type: 'BUY',
    quantity: 15,
    price: 640,
    fee: 1.1,
    notes: 'Add on breakout'
  }));

  await createTradeWithValidation(demoUserId, validateTradeInput({
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

  const msftBuy1 = await createTradeWithValidation(demoUserId, validateTradeInput({
    ticker: 'MSFT',
    tradeDate: '2025-01-28',
    type: 'BUY',
    quantity: 25,
    price: 410,
    fee: 1,
    notes: 'Cloud leader'
  }));

  await createTradeWithValidation(demoUserId, validateTradeInput({
    ticker: 'MSFT',
    tradeDate: '2025-02-25',
    type: 'SELL',
    quantity: 8,
    price: 430,
    fee: 0.9,
    notes: 'FIFO partial exit',
    lotSelectionMethod: 'FIFO'
  }));

  await createTradeWithValidation(demoUserId, validateTradeInput({
    ticker: 'MSFT',
    tradeDate: '2025-03-20',
    type: 'BUY',
    quantity: 12,
    price: 415,
    fee: 1,
    notes: 'Reload after pullback'
  }));

  return {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    userId: demoUserId,
    seeded: true
  };
}

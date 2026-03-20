import dayjs from 'dayjs';
import type { TradeInput } from '../types/trade';

export function validateTradeInput(input: TradeInput): string | null {
  if (!input.symbol.trim()) return 'Symbol is required.';
  if (!dayjs(input.tradeDate, 'YYYY-MM-DD', true).isValid()) return 'Trade date must be YYYY-MM-DD.';
  if (input.quantity <= 0) return 'Quantity must be positive.';
  if (input.price <= 0) return 'Price must be positive.';
  if (input.fees < 0) return 'Fees cannot be negative.';
  return null;
}

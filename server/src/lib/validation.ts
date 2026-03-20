import dayjs from 'dayjs';
import { z } from 'zod';

export const tradeSchema = z.object({
  symbol: z.string().trim().min(1).max(10).transform((value) => value.toUpperCase()),
  tradeDate: z.string().refine((value) => dayjs(value, 'YYYY-MM-DD', true).isValid(), 'Invalid date'),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.number().positive(),
  price: z.number().positive(),
  fees: z.number().min(0).default(0),
  notes: z.string().max(500).optional().default('')
});

export const tradeIdSchema = z.object({
  id: z.coerce.number().int().positive()
});

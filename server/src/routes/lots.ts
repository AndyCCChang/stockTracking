import { Router } from 'express';
import { validateAvailableLotsQuery } from '../lib/validation.js';
import { getAvailableLotsForTrade } from '../services.js';

const router = Router();

router.get('/lots/available', (req, res) => {
  const query = Object.fromEntries(
    Object.entries(req.query as Record<string, unknown>).map(([key, value]) => [key, typeof value === 'string' ? value : undefined])
  ) as Record<string, string | undefined>;
  const { ticker, tradeDate } = validateAvailableLotsQuery(query);
  res.json(getAvailableLotsForTrade(ticker, tradeDate));
});

export default router;

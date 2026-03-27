import { Router } from 'express';
import { validateAvailableLotsQuery } from '../lib/validation.js';
import { authenticateJWT } from '../middleware/authenticateJWT.js';
import { getAvailableLotsForTrade } from '../services.js';

const router = Router();

router.use(authenticateJWT);

router.get('/lots/available', (req, res) => {
  const query = Object.fromEntries(
    Object.entries(req.query as Record<string, unknown>).map(([key, value]) => [key, typeof value === 'string' ? value : undefined])
  ) as Record<string, string | undefined>;
  const { ticker, tradeDate } = validateAvailableLotsQuery(query);
  res.json(getAvailableLotsForTrade(req.user!.userId, ticker, tradeDate));
});

export default router;

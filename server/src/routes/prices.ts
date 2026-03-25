import { Router } from 'express';
import { ValidationError } from '../lib/errors.js';
import { getLatestPriceQuote } from '../services/priceService.js';

const router = Router();

router.get('/prices/latest', async (req, res, next) => {
  try {
    const ticker = typeof req.query.ticker === 'string' ? req.query.ticker.trim().toUpperCase() : '';
    if (!ticker) {
      throw new ValidationError('ticker query parameter is required');
    }

    res.json(await getLatestPriceQuote(ticker));
  } catch (error) {
    next(error);
  }
});

export default router;

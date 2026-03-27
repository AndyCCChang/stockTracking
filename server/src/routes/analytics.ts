import { Router } from 'express';
import { toCsv } from '../lib/csv.js';
import { validateSummaryYear } from '../lib/validation.js';
import { authenticateJWT } from '../middleware/authenticateJWT.js';
import {
  getDashboardAnalytics,
  getMonthlySummaryAnalytics,
  getPerformanceAnalytics,
  getPositionsAnalytics,
  getRealizedAnalytics,
  getYearlySummaryAnalytics
} from '../services/analyticsService.js';

const router = Router();

router.use(authenticateJWT);

router.get('/dashboard', async (req, res, next) => {
  try {
    res.json(await getDashboardAnalytics(req.user!.userId));
  } catch (error) {
    next(error);
  }
});

router.get('/positions', async (req, res, next) => {
  try {
    res.json(await getPositionsAnalytics(req.user!.userId));
  } catch (error) {
    next(error);
  }
});

router.get('/realized', (req, res, next) => {
  try {
    res.json(getRealizedAnalytics(req.user!.userId));
  } catch (error) {
    next(error);
  }
});

router.get('/performance', (req, res, next) => {
  try {
    res.json(getPerformanceAnalytics(req.user!.userId));
  } catch (error) {
    next(error);
  }
});

router.get('/yearly-summary/export', async (req, res, next) => {
  try {
    const yearlySummary = await getYearlySummaryAnalytics(req.user!.userId);
    const csv = toCsv(
      ['year', 'realizedPnL', 'unrealizedPnL', 'tradeCount', 'grossBuyAmount', 'grossSellAmount', 'returnRate'],
      yearlySummary.map((item) => ({
        year: item.year,
        realizedPnL: item.realizedPnL,
        unrealizedPnL: item.unrealizedPnL,
        tradeCount: item.tradeCount,
        grossBuyAmount: item.grossBuyAmount,
        grossSellAmount: item.grossSellAmount,
        returnRate: item.returnRate
      }))
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="yearly-summary.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

router.get('/yearly-summary', async (req, res, next) => {
  try {
    res.json(await getYearlySummaryAnalytics(req.user!.userId));
  } catch (error) {
    next(error);
  }
});

router.get('/monthly-summary', async (req, res, next) => {
  try {
    const year = validateSummaryYear(typeof req.query.year === 'string' ? req.query.year : undefined);
    res.json(await getMonthlySummaryAnalytics(req.user!.userId, year));
  } catch (error) {
    next(error);
  }
});

export default router;

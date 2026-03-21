import { Router } from 'express';
import { toCsv } from '../lib/csv.js';
import { validateSummaryYear } from '../lib/validation.js';
import {
  getDashboardAnalytics,
  getMonthlySummaryAnalytics,
  getPerformanceAnalytics,
  getPositionsAnalytics,
  getRealizedAnalytics,
  getYearlySummaryAnalytics
} from '../services/analyticsService.js';

const router = Router();

router.get('/dashboard', async (_req, res, next) => {
  try {
    res.json(await getDashboardAnalytics());
  } catch (error) {
    next(error);
  }
});

router.get('/positions', async (_req, res, next) => {
  try {
    res.json(await getPositionsAnalytics());
  } catch (error) {
    next(error);
  }
});

router.get('/realized', (req, res, next) => {
  try {
    res.json(getRealizedAnalytics());
  } catch (error) {
    next(error);
  }
});

router.get('/performance', (req, res, next) => {
  try {
    res.json(getPerformanceAnalytics());
  } catch (error) {
    next(error);
  }
});

router.get('/yearly-summary/export', async (_req, res, next) => {
  try {
    const yearlySummary = await getYearlySummaryAnalytics();
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

router.get('/yearly-summary', async (_req, res, next) => {
  try {
    res.json(await getYearlySummaryAnalytics());
  } catch (error) {
    next(error);
  }
});

router.get('/monthly-summary', async (req, res, next) => {
  try {
    const year = validateSummaryYear(typeof req.query.year === 'string' ? req.query.year : undefined);
    res.json(await getMonthlySummaryAnalytics(year));
  } catch (error) {
    next(error);
  }
});

export default router;

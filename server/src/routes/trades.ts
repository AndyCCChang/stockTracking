import { Router } from 'express';
import { validateTradeFilters, validateTradeId, validateTradeImportRows, validateTradeInput } from '../lib/validation.js';
import { authenticateJWT } from '../middleware/authenticateJWT.js';
import {
  createTradeWithValidation,
  deleteTradeWithValidation,
  exportTradesAsCsv,
  getTrades,
  importTradesWithValidation,
  updateTradeWithValidation
} from '../services.js';

const router = Router();

function normalizeQuery(query: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(query).map(([key, value]) => [key, typeof value === 'string' ? value : Array.isArray(value) ? String(value[0]) : undefined])
  ) as Record<string, string | undefined>;
}

router.use(authenticateJWT);

router.get('/trades', async (req, res, next) => {
  try {
    const filters = validateTradeFilters(normalizeQuery(req.query as Record<string, unknown>));
    res.json(await getTrades(req.user!.userId, filters));
  } catch (error) {
    next(error);
  }
});

router.get('/trades/export', async (req, res, next) => {
  try {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="trades-export.csv"');
    res.send(await exportTradesAsCsv(req.user!.userId));
  } catch (error) {
    next(error);
  }
});

router.post('/trades/import', async (req, res, next) => {
  try {
    const rows = validateTradeImportRows(req.body);
    const result = await importTradesWithValidation(req.user!.userId, rows);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/trades', async (req, res, next) => {
  try {
    const payload = validateTradeInput(req.body);
    const trade = await createTradeWithValidation(req.user!.userId, payload);
    res.status(201).json(trade);
  } catch (error) {
    next(error);
  }
});

router.put('/trades/:id', async (req, res, next) => {
  try {
    const id = validateTradeId(req.params.id);
    const payload = validateTradeInput(req.body);
    const trade = await updateTradeWithValidation(req.user!.userId, id, payload);
    res.json(trade);
  } catch (error) {
    next(error);
  }
});

router.delete('/trades/:id', async (req, res, next) => {
  try {
    const id = validateTradeId(req.params.id);
    await deleteTradeWithValidation(req.user!.userId, id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;

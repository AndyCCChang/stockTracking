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

router.get('/trades', (req, res) => {
  const filters = validateTradeFilters(normalizeQuery(req.query as Record<string, unknown>));
  res.json(getTrades(req.user!.userId, filters));
});

router.get('/trades/export', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="trades-export.csv"');
  res.send(exportTradesAsCsv(req.user!.userId));
});

router.post('/trades/import', (req, res) => {
  const rows = validateTradeImportRows(req.body);
  const result = importTradesWithValidation(req.user!.userId, rows);
  res.status(201).json(result);
});

router.post('/trades', (req, res) => {
  const payload = validateTradeInput(req.body);
  const trade = createTradeWithValidation(req.user!.userId, payload);
  res.status(201).json(trade);
});

router.put('/trades/:id', (req, res) => {
  const id = validateTradeId(req.params.id);
  const payload = validateTradeInput(req.body);
  const trade = updateTradeWithValidation(req.user!.userId, id, payload);
  res.json(trade);
});

router.delete('/trades/:id', (req, res) => {
  const id = validateTradeId(req.params.id);
  deleteTradeWithValidation(req.user!.userId, id);
  res.status(204).send();
});

export default router;

import { Router } from 'express';
import { stringify } from 'csv-stringify/sync';
import type { Trade, TradeInput } from '../types.js';
import { db } from '../db/database.js';
import { calculateMetrics, calculatePositions, calculateRealizedLots, validateNoOversell } from '../lib/tradeMath.js';
import { tradeIdSchema, tradeSchema } from '../lib/validation.js';

const router = Router();

const selectAllTrades = () => db.prepare('SELECT * FROM trades ORDER BY tradeDate ASC, id ASC').all() as Trade[];

function assertTradeBookValid(nextTrades: Trade[]) {
  validateNoOversell(nextTrades);
}

router.get('/trades', (_req, res) => {
  res.json(selectAllTrades());
});

router.post('/trades', (req, res) => {
  const parsed = tradeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid trade payload.' });
  }

  const trade = parsed.data;
  const existingTrades = selectAllTrades();
  const now = new Date().toISOString();
  const draft: Trade = {
    id: Number.MAX_SAFE_INTEGER,
    createdAt: now,
    updatedAt: now,
    ...trade,
    fees: trade.fees ?? 0,
    notes: trade.notes ?? ''
  };
  assertTradeBookValid([...existingTrades, draft]);

  const result = db.prepare(`
    INSERT INTO trades (symbol, tradeDate, side, quantity, price, fees, notes, createdAt, updatedAt)
    VALUES (@symbol, @tradeDate, @side, @quantity, @price, @fees, @notes, @createdAt, @updatedAt)
  `).run(draft as unknown as TradeInput & { createdAt: string; updatedAt: string });

  res.status(201).json(db.prepare('SELECT * FROM trades WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/trades/:id', (req, res) => {
  const idParsed = tradeIdSchema.safeParse(req.params);
  const bodyParsed = tradeSchema.safeParse(req.body);
  if (!idParsed.success || !bodyParsed.success) {
    return res.status(400).json({ message: 'Invalid trade update payload.' });
  }

  const existing = db.prepare('SELECT * FROM trades WHERE id = ?').get(idParsed.data.id) as Trade | undefined;
  if (!existing) {
    return res.status(404).json({ message: 'Trade not found.' });
  }

  const updated: Trade = {
    ...existing,
    ...bodyParsed.data,
    fees: bodyParsed.data.fees ?? 0,
    notes: bodyParsed.data.notes ?? '',
    updatedAt: new Date().toISOString()
  };

  const nextTrades = selectAllTrades().map((trade) => (trade.id === updated.id ? updated : trade));
  assertTradeBookValid(nextTrades);

  db.prepare(`
    UPDATE trades
    SET symbol = @symbol,
        tradeDate = @tradeDate,
        side = @side,
        quantity = @quantity,
        price = @price,
        fees = @fees,
        notes = @notes,
        updatedAt = @updatedAt
    WHERE id = @id
  `).run(updated);

  res.json(db.prepare('SELECT * FROM trades WHERE id = ?').get(updated.id));
});

router.delete('/trades/:id', (req, res) => {
  const idParsed = tradeIdSchema.safeParse(req.params);
  if (!idParsed.success) {
    return res.status(400).json({ message: 'Invalid trade id.' });
  }

  const existing = db.prepare('SELECT * FROM trades WHERE id = ?').get(idParsed.data.id) as Trade | undefined;
  if (!existing) {
    return res.status(404).json({ message: 'Trade not found.' });
  }

  const nextTrades = selectAllTrades().filter((trade) => trade.id !== existing.id);
  assertTradeBookValid(nextTrades);
  db.prepare('DELETE FROM trades WHERE id = ?').run(existing.id);
  res.status(204).send();
});

router.get('/analytics/positions', async (_req, res, next) => {
  try {
    res.json(await calculatePositions(selectAllTrades()));
  } catch (error) {
    next(error);
  }
});

router.get('/analytics/realized', (_req, res, next) => {
  try {
    res.json(calculateRealizedLots(selectAllTrades()));
  } catch (error) {
    next(error);
  }
});

router.get('/analytics/metrics', async (_req, res, next) => {
  try {
    res.json(await calculateMetrics(selectAllTrades()));
  } catch (error) {
    next(error);
  }
});

router.get('/analytics/yearly', (_req, res) => {
  const realized = calculateRealizedLots(selectAllTrades());
  const yearly = realized.reduce<Record<string, number>>((acc, lot) => {
    const year = lot.tradeDate.slice(0, 4);
    acc[year] = (acc[year] ?? 0) + lot.realizedPnL;
    return acc;
  }, {});
  res.json(Object.entries(yearly).map(([year, realizedPnL]) => ({ year, realizedPnL })));
});

router.get('/trades/export', (_req, res) => {
  const csv = stringify(selectAllTrades(), { header: true });
  res.header('Content-Type', 'text/csv');
  res.attachment('trades.csv');
  res.send(csv);
});

router.post('/trades/import', (req, res) => {
  const trades = req.body?.trades;
  if (!Array.isArray(trades)) {
    return res.status(400).json({ message: 'Expected trades array.' });
  }

  const parsedTrades = trades.map((trade) => tradeSchema.safeParse(trade));
  const invalid = parsedTrades.find((item) => !item.success);
  if (invalid && !invalid.success) {
    return res.status(400).json({ message: invalid.error.issues[0]?.message ?? 'Invalid trade import payload.' });
  }

  const validTrades = parsedTrades.filter((item): item is { success: true; data: TradeInput } => item.success).map((item) => item.data);
  const existing = selectAllTrades();
  const now = new Date().toISOString();
  const imported = validTrades.map((item, index) => ({
    ...item,
    id: Number.MAX_SAFE_INTEGER - index,
    createdAt: now,
    updatedAt: now,
    fees: item.fees ?? 0,
    notes: item.notes ?? ''
  })) as Trade[];

  assertTradeBookValid([...existing, ...imported]);
  const insert = db.prepare(`
    INSERT INTO trades (symbol, tradeDate, side, quantity, price, fees, notes, createdAt, updatedAt)
    VALUES (@symbol, @tradeDate, @side, @quantity, @price, @fees, @notes, @createdAt, @updatedAt)
  `);
  const insertMany = db.transaction((rows: Trade[]) => rows.forEach((row) => insert.run(row)));
  insertMany(imported);
  res.status(201).json(selectAllTrades());
});

export default router;

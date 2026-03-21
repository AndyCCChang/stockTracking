import { Router } from 'express';
import { getDatabaseStatus } from '../db/database.js';

const router = Router();

router.get('/health', (_req, res) => {
  const database = getDatabaseStatus();

  res.json({
    status: 'ok',
    service: 'stock-tracking-server',
    database: database.status,
    timestamp: new Date().toISOString()
  });
});

export default router;

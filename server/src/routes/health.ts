import { Router } from 'express';
import { env } from '../config/env.js';
import { getDatabaseStatus } from '../db/database.js';
import { ServiceUnavailableError } from '../lib/errors.js';

const router = Router();

router.get('/health', async (_req, res, next) => {
  try {
    const database = await getDatabaseStatus();

    res.json({
      status: 'ok',
      service: 'stock-tracking-server',
      database: database.status,
      timestamp: new Date().toISOString(),
      runtime: {
        nodeEnv: env.nodeEnv,
        nodeVersion: process.version,
        port: env.port
      },
      services: {
        databaseDriver: database.driver,
        databaseName: database.database,
        corsConfigured: env.corsOrigins.length > 0,
        priceProvider: env.priceProvider,
        message: null
      }
    });
  } catch (error) {
    if (error instanceof ServiceUnavailableError) {
      res.json({
        status: 'degraded',
        service: 'stock-tracking-server',
        database: 'unavailable',
        timestamp: new Date().toISOString(),
        runtime: {
          nodeEnv: env.nodeEnv,
          nodeVersion: process.version,
          port: env.port
        },
        services: {
          databaseDriver: 'pg',
          databaseName: null,
          corsConfigured: env.corsOrigins.length > 0,
          priceProvider: env.priceProvider,
          message: error.message
        }
      });
      return;
    }

    next(error);
  }
});

export default router;

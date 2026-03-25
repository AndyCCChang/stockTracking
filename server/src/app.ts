import express, { type NextFunction, type Request, type Response } from 'express';
import { AppError } from './lib/errors.js';
import analyticsRouter from './routes/analytics.js';
import healthRouter from './routes/health.js';
import lotsRouter from './routes/lots.js';
import pricesRouter from './routes/prices.js';
import tradesRouter from './routes/trades.js';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use('/api', healthRouter);
  app.use('/api', tradesRouter);
  app.use('/api', lotsRouter);
  app.use('/api', pricesRouter);
  app.use('/api', analyticsRouter);

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }

    if (error instanceof Error) {
      res.status(500).json({ message: error.message });
      return;
    }

    res.status(500).json({ message: 'Internal server error' });
  });

  return app;
}

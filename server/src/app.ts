import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { env } from './config/env.js';
import { AppError } from './lib/errors.js';
import analyticsRouter from './routes/analytics.js';
import authRouter from './routes/auth.js';
import healthRouter from './routes/health.js';
import lotsRouter from './routes/lots.js';
import pricesRouter from './routes/prices.js';
import tradesRouter from './routes/trades.js';

function buildCorsOptions() {
  const configuredOrigins = env.corsOrigins;
  const allowAll = configuredOrigins.length === 0;

  return {
    origin(origin: string | undefined, callback: (error: Error | null, allowed?: boolean) => void) {
      if (allowAll || !origin || configuredOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new AppError(`Origin ${origin} is not allowed by CORS`, 403));
    },
    credentials: true
  };
}

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(cors(buildCorsOptions()));
  app.options('*', cors(buildCorsOptions()));
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', healthRouter);
  app.use('/api', authRouter);
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

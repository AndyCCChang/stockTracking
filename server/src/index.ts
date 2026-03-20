import cors from 'cors';
import express from 'express';
import tradeRoutes from './routes/trades.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api', tradeRoutes);
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(400).json({ message: error.message });
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

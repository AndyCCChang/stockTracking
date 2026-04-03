import { createApp } from './app.js';
import { env } from './config/env.js';
import { closeDatabase, getDatabaseStatus, initializeDatabase } from './db/database.js';
import { seedDemoData } from './scripts/seedDemoData.js';

const port = env.port;
const app = createApp();

async function start() {
  await initializeDatabase();

  if (env.databaseMode === 'memory') {
    const result = await seedDemoData();
    if (result.seeded) {
      console.log(`Memory database seeded with demo user ${result.email} / ${result.password}`);
    }
  }

  const database = await getDatabaseStatus();

  app.listen(port, () => {
    console.log(`Server ready on http://localhost:${port}`);
    console.log(`${database.driver} connected: ${database.database}`);
  });
}

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  await closeDatabase();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

start().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});

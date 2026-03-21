import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(currentDir, '../../data');
const databaseFile = path.join(dataDir, 'stock-tracking.sqlite');

mkdirSync(dataDir, { recursive: true });

export const db = new Database(databaseFile);

db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

db.prepare(
  `INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
).run('initializedAt', new Date().toISOString());

export function getDatabaseStatus() {
  db.prepare('SELECT 1').get();
  return {
    file: databaseFile,
    driver: 'better-sqlite3',
    status: 'connected' as const
  };
}

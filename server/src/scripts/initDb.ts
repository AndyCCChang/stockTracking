import { getDatabaseStatus, initializeDatabase } from '../db/database.js';

await initializeDatabase();

const database = await getDatabaseStatus();
console.log(`Database initialized: ${database.database}`);

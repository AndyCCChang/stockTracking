import { getDatabaseStatus, initializeDatabase } from '../db/database.js';

initializeDatabase();

const database = getDatabaseStatus();
console.log(`Database initialized at ${database.file}`);

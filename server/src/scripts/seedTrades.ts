import { resetTrades } from '../services.js';
import { seedDemoData } from './seedDemoData.js';

await resetTrades();

const result = await seedDemoData();
console.log(`Seeded demo user ${result.email} / ${result.password}. User id: ${result.userId}`);

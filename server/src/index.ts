import { createApp } from './app.js';
import { getDatabaseStatus } from './db/database.js';

const port = Number(process.env.PORT ?? 4000);
const app = createApp();
const database = getDatabaseStatus();

app.listen(port, () => {
  console.log(`Server ready on http://localhost:${port}`);
  console.log(`SQLite connected: ${database.file}`);
});

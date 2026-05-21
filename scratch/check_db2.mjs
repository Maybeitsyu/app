import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

// List all tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables);

// Check row counts
for (const t of tables) {
  try {
    const count = db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get();
    console.log(`  ${t.name}: ${count.cnt} rows`);
  } catch(e) {
    console.log(`  ${t.name}: ERROR - ${e.message}`);
  }
}

db.close();

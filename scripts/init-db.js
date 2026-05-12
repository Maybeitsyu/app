import path from 'node:path';
import Database from 'better-sqlite3';
import { initializeSchema } from '../electron/schema.js';

const dbPath = path.resolve(process.cwd(), 'agridb.db');

const db = new Database(dbPath);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
initializeSchema(db);

db.close();

console.log(`Database initialized: ${dbPath}`);

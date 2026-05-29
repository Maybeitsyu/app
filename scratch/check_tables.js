import Database from 'better-sqlite3';

const dbPath = 'agridbfgh.db';
const db = new Database(dbPath);

try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log("Tables in agridbfgh.db:", tables);
} catch (error) {
    console.error("Error inspecting tables:", error);
}

db.close();

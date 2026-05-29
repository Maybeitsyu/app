import { app } from 'electron';
import Database from 'better-sqlite3';
import path from 'path';

const dataDir = path.join(app.getPath('userData'), 'data');
const dbPath = path.join(dataDir, 'agridb.db');
const db = new Database(dbPath);

const pCount = db.prepare("SELECT COUNT(*) as count FROM products").get().count;
const bCount = db.prepare("SELECT COUNT(*) as count FROM batches").get().count;
const mCount = db.prepare("SELECT COUNT(*) as count FROM inventory_movements").get().count;

console.log(`Products: ${pCount}, Batches: ${bCount}, Movements: ${mCount}`);

if (pCount > 0) {
    console.log("A sample product:");
    console.log(db.prepare("SELECT * FROM products LIMIT 1").get());
}
if (bCount > 0) {
    console.log("A sample batch:");
    console.log(db.prepare("SELECT * FROM batches LIMIT 1").get());
}

db.close();

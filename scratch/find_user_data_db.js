import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const dataDir = path.join(app.getPath('userData'), 'data');
const dbPath = path.join(dataDir, 'agridb.db');

console.log("userData dir:", app.getPath('userData'));
console.log("Database path exists:", fs.existsSync(dbPath));

if (fs.existsSync(dbPath)) {
    const db = new Database(dbPath);
    try {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        console.log("Tables in user data agridb.db:", tables);
        
        // Let's test the product listing query!
        let sql = `
          SELECT p.id, p.name, 
            (SELECT json_group_array(json_object('batch_number', b.batch_number, 'date', b.date, 'remaining_qty', b.remaining_qty, 'srp', b.srp, 'unit_cost', b.unit_cost)) FROM batches b WHERE b.product_id = p.id AND b.remaining_qty > 0 ORDER BY b.date ASC, b.created_at ASC) AS active_batches
          FROM products p LIMIT 5
        `;
        const rows = db.prepare(sql).all();
        console.log("Query test output (first 5):");
        rows.forEach(r => {
            console.log(`Product: ${r.name}, Batches: ${r.active_batches}`);
        });
    } catch (e) {
        console.error("Query failed:", e);
    }
    db.close();
} else {
    console.log("Database not found in user data!");
}

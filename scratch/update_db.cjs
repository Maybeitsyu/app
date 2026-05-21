const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve('C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db');
const db = new Database(dbPath);

// Update Walk Inn record
const updateWalkInn = db.prepare(`UPDATE sales SET vat_exempt_amount = 0 WHERE si_number = 'WALK INN' AND date = '2026-01-12'`);
const walkResult = updateWalkInn.run();
console.log('Walk Inn rows updated:', walkResult.changes);

// Update SI 0213 A/R record
const updateSI0213 = db.prepare(`UPDATE sales SET vat_exempt_amount = 0 WHERE si_number = 'SI 0213' AND date = '2026-01-30' AND status = 'A/R'`);
const siResult = updateSI0213.run();
console.log('SI 0213 rows updated:', siResult.changes);

// Verify totals
const realTotal = db.prepare('SELECT SUM(input_vat + vat_exempt_amount) as total FROM sales').get().total;
console.log('New Real DB Total:', realTotal);

db.close();

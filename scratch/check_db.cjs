const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve('C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db');
const db = new Database(dbPath, { readonly: true });

const total = db.prepare("SELECT SUM(input_vat + vat_exempt_amount) as total FROM sales").get();
console.log('Current DB Total (input_vat + vat_exempt_amount):', total.total);

const total2 = db.prepare("SELECT SUM(gross_amount) as total FROM sales").get();
console.log('Current DB Total (gross_amount):', total2.total);

const walkInn = db.prepare("SELECT id, si_number, date, gross_amount, input_vat, vat_exempt_amount, status FROM sales WHERE si_number='WALK INN' AND date='2026-01-12'").all();
console.log('\n--- Walk Inn 2026-01-12 ---');
console.log(walkInn);

const si0213 = db.prepare("SELECT id, si_number, date, gross_amount, input_vat, vat_exempt_amount, status FROM sales WHERE si_number='SI 0213' AND date='2026-01-30'").all();
console.log('\n--- SI 0213 2026-01-30 ---');
console.log(si0213);

// Check if there's a separate report calculation
const vatExemptTotal = db.prepare("SELECT SUM(vat_exempt_amount) as total FROM sales").get();
console.log('\nTotal vat_exempt_amount:', vatExemptTotal.total);

const inputVatTotal = db.prepare("SELECT SUM(input_vat) as total FROM sales").get();
console.log('Total input_vat:', inputVatTotal.total);

db.close();

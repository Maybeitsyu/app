import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

const walkInn = db.prepare("SELECT id, si_number, date, gross_amount, input_vat, vat_exempt_amount, status FROM sales WHERE si_number='WALK INN' AND date='2026-01-12'").all();
console.log('\n--- Walk Inn 2026-01-12 ---');
console.log(walkInn);

const si0213 = db.prepare("SELECT id, si_number, date, gross_amount, input_vat, vat_exempt_amount, status FROM sales WHERE si_number='SI 0213' AND date='2026-01-30'").all();
console.log('\n--- SI 0213 2026-01-30 ---');
console.log(si0213);

const total = db.prepare('SELECT SUM(input_vat + vat_exempt_amount) as total FROM sales').get().total;
console.log('\nNew Real DB Total:', total);

db.close();

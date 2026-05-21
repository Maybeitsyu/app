import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

const total = db.prepare('SELECT SUM(input_vat + vat_exempt_amount) as total FROM sales').get().total;
console.log('Total sales sum:', total);

const totalWithoutVatExempt = db.prepare('SELECT SUM(input_vat) as total FROM sales').get().total;
console.log('Total input_vat sum:', totalWithoutVatExempt);

db.close();

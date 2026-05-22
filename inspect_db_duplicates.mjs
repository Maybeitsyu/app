import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const dbPath = path.join(process.env.APPDATA, 'AgriLedger', 'data', 'agridb.db');
const db = new Database(dbPath, { readonly: true });

console.log('DB Path:', dbPath);
const total = db.prepare('SELECT COUNT(*) AS cnt FROM purchases').get().cnt;
console.log('Total purchases:', total);

const dupRows = db.prepare(`
  SELECT date, supplier_name, receipt_number, expense_category, gross_amount, COUNT(*) AS cnt
  FROM purchases
  GROUP BY date, supplier_name, receipt_number, expense_category, gross_amount
  HAVING cnt > 1
  ORDER BY cnt DESC, expense_category
  LIMIT 50
`).all();
console.log('Duplicate groups (same date/supplier/receipt/category/gross):', dupRows.length);
dupRows.forEach((row) => {
  console.log(row);
});

const sumByCategory = db.prepare(`
  SELECT expense_category AS category, COUNT(*) AS cnt, SUM(gross_amount) AS total
  FROM purchases
  GROUP BY expense_category
  ORDER BY total DESC
`).all();
console.log('\nCategory summary:');
sumByCategory.forEach(r => console.log(r));

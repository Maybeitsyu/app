import { DatabaseSync } from 'node:sqlite';

const DB_PATH = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(DB_PATH, { open: true });

// Quick current state check
const total = db.prepare(`SELECT COUNT(*) as cnt, SUM(gross_amount) as total FROM purchases`).get();
console.log(`Total purchases rows: ${total.cnt}, total gross: ${Number(total.total).toFixed(2)}`);

// January 2026 by category RIGHT NOW
console.log('\n--- Jan 2026 by Category RIGHT NOW ---');
const jan = db.prepare(`
  SELECT expense_category, COUNT(*) as cnt, SUM(gross_amount) as total
  FROM purchases
  WHERE date BETWEEN '2026-01-01' AND '2026-01-31'
  GROUP BY expense_category
  ORDER BY total DESC
`).all();
jan.forEach(r => console.log(`  ${r.expense_category}: ${r.cnt} rows, ${Number(r.total).toFixed(2)}`));

// Check if duplicates still exist
const dupes = db.prepare(`
  SELECT COUNT(*) as cnt
  FROM (
    SELECT date, supplier_name, receipt_number, expense_category, gross_amount
    FROM purchases
    GROUP BY date, supplier_name, receipt_number, expense_category, gross_amount
    HAVING COUNT(*) > 1
  )
`).get();
console.log(`\nDuplicate groups remaining: ${dupes.cnt}`);

db.close();

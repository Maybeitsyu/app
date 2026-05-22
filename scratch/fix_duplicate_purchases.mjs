import { DatabaseSync } from 'node:sqlite';

const DB_PATH = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(DB_PATH, { open: true });

// Snapshot before
const before = db.prepare(`SELECT COUNT(*) as cnt, SUM(gross_amount) as total FROM purchases`).get();
console.log(`BEFORE: ${before.cnt} rows, gross total = ${Number(before.total).toFixed(2)}`);

// Show month totals before
const monthsBefore = db.prepare(`
  SELECT strftime('%Y-%m', date) as month, COUNT(*) as rows, SUM(gross_amount) as total
  FROM purchases
  WHERE date >= '2026-01-01'
  GROUP BY month ORDER BY month
`).all();
console.log('\nMonthly totals BEFORE:');
monthsBefore.forEach(r => console.log(`  ${r.month}: ${r.rows} rows, ${Number(r.total).toFixed(2)}`));

// De-duplicate: keep the row with the lowest rowid for each unique combination
// (date, supplier_name, receipt_number, expense_category, gross_amount)
const deleteResult = db.prepare(`
  DELETE FROM purchases
  WHERE rowid NOT IN (
    SELECT MIN(rowid)
    FROM purchases
    GROUP BY date, supplier_name, receipt_number, expense_category, gross_amount
  )
`).run();

console.log(`\nDeleted ${deleteResult.changes} duplicate rows.`);

// Snapshot after
const after = db.prepare(`SELECT COUNT(*) as cnt, SUM(gross_amount) as total FROM purchases`).get();
console.log(`AFTER: ${after.cnt} rows, gross total = ${Number(after.total).toFixed(2)}`);

// Monthly totals after
const monthsAfter = db.prepare(`
  SELECT strftime('%Y-%m', date) as month, COUNT(*) as rows, SUM(gross_amount) as total
  FROM purchases
  WHERE date >= '2026-01-01'
  GROUP BY month ORDER BY month
`).all();
console.log('\nMonthly totals AFTER:');
monthsAfter.forEach(r => console.log(`  ${r.month}: ${r.rows} rows, ${Number(r.total).toFixed(2)}`));

// Verify no more duplicates
const remaining = db.prepare(`
  SELECT COUNT(*) as cnt
  FROM (
    SELECT date, supplier_name, receipt_number, expense_category, gross_amount
    FROM purchases
    GROUP BY date, supplier_name, receipt_number, expense_category, gross_amount
    HAVING COUNT(*) > 1
  )
`).get();
console.log(`\nRemaining duplicate groups: ${remaining.cnt}`);

// Jan 2026 by category after fix
console.log('\n--- Jan 2026 by Category (after fix) ---');
const jan = db.prepare(`
  SELECT expense_category, COUNT(*) as cnt, SUM(gross_amount) as total
  FROM purchases
  WHERE date BETWEEN '2026-01-01' AND '2026-01-31'
  GROUP BY expense_category
  ORDER BY total DESC
`).all();
jan.forEach(r => console.log(`  ${r.expense_category}: ${r.cnt} rows, ${Number(r.total).toFixed(2)}`));

db.close();
console.log('\nDone.');

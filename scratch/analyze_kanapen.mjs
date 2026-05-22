import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

console.log('=== All March 2026 KANAPEN Sales ===');

const rows = db.prepare(`
  SELECT 
    s.date,
    s.si_number,
    si.qty,
    si.unit_price,
    si.costing,
    si.total_cost,
    (si.qty * si.costing) as expected_total_cost,
    (si.total_cost - (si.qty * si.costing)) as diff
  FROM sale_items si
  INNER JOIN sales s ON si.sale_id = s.id
  LEFT JOIN products p ON si.product_id = p.id
  WHERE s.status NOT IN ('FAILED', 'Return')
    AND s.date >= '2026-03-01' AND s.date <= '2026-03-31'
    AND p.name = 'KANAPEN'
  ORDER BY s.date, s.si_number
`).all();

console.log(`Date       | SI Number  | Qty | Price     | Costing   | Total Cost | Expected  | Diff`);
console.log('-------------------------------------------------------------------------------------');
rows.forEach(r => {
  const diffStr = Math.abs(r.diff) > 0.01 ? `₱${r.diff.toFixed(2)}` : '0.00';
  console.log(`${r.date} | ${(r.si_number || '').padEnd(10)} | ${r.qty.toString().padEnd(3)} | ₱${r.unit_price.toFixed(2).padEnd(9)} | ₱${r.costing.toFixed(2).padEnd(9)} | ₱${r.total_cost.toFixed(2).padEnd(10)} | ₱${r.expected_total_cost.toFixed(2).padEnd(9)} | ${diffStr}`);
});

db.close();

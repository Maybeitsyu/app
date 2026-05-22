import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

console.log('=== Checking all March 2026 sale items for qty * costing != total_cost ===');

const rows = db.prepare(`
  SELECT 
    s.date,
    s.si_number,
    p.name as product_name,
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
`).all();

let totalDiff = 0;
let anomalyCount = 0;

rows.forEach(r => {
  const expected = r.qty * r.costing;
  const actual = r.total_cost;
  const diff = actual - expected;
  
  if (Math.abs(diff) > 0.001) {
    anomalyCount++;
    totalDiff += diff;
    console.log(`Anomaly #${anomalyCount}:`);
    console.log(`  Date: ${r.date} | SI: "${r.si_number}" | Product: ${r.product_name}`);
    console.log(`  Qty: ${r.qty} | Costing: ${r.costing} | Total Cost: ${r.total_cost}`);
    console.log(`  Expected (Qty * Costing): ${expected.toFixed(4)}`);
    console.log(`  Difference (Actual - Expected): ${diff.toFixed(4)}`);
    console.log('--------------------------------------------------');
  }
});

console.log(`Total Anomalies Found: ${anomalyCount}`);
console.log(`Sum of Differences: ₱${totalDiff.toLocaleString('en-PH', { minimumFractionDigits: 4 })}`);

db.close();

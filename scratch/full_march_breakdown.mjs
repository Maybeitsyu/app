import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

console.log('=== FULL MARCH 2026 COGS BREAKDOWN ===\n');

// 1. All SHIPPINGFEE rows
console.log('--- SHIPPINGFEE Rows in March 2026 ---');
const shippingRows = db.prepare(`
  SELECT 
    s.date,
    s.si_number,
    si.qty,
    si.unit_price,
    si.costing,
    si.total_cost,
    (si.qty * si.costing) as expected
  FROM sale_items si
  INNER JOIN sales s ON si.sale_id = s.id
  LEFT JOIN products p ON si.product_id = p.id
  WHERE s.status NOT IN ('FAILED', 'Return')
    AND s.date >= '2026-03-01' AND s.date <= '2026-03-31'
    AND UPPER(p.name) LIKE '%SHIPPING%'
  ORDER BY s.date, s.si_number
`).all();

let shippingTotal = 0;
shippingRows.forEach(r => {
  shippingTotal += r.total_cost;
  console.log(`  ${r.date} | SI: "${r.si_number}" | Qty:${r.qty} | Price:₱${r.unit_price} | Costing:₱${r.costing} | TotalCost:₱${r.total_cost}`);
});
console.log(`  => TOTAL SHIPPING COGS: ₱${shippingTotal.toFixed(2)}`);

// 2. Summary: what if shipping COGS were 0?
console.log('\n--- What if SHIPPINGFEE were excluded from COGS? ---');
const allMarchCogs = db.prepare(`
  SELECT COALESCE(SUM(si.total_cost), 0) as total
  FROM sale_items si
  INNER JOIN sales s ON si.sale_id = s.id
  LEFT JOIN products p ON si.product_id = p.id
  WHERE s.status NOT IN ('FAILED', 'Return')
    AND s.date >= '2026-03-01' AND s.date <= '2026-03-31'
`).get().total;

const marchCogsNoShipping = db.prepare(`
  SELECT COALESCE(SUM(si.total_cost), 0) as total
  FROM sale_items si
  INNER JOIN sales s ON si.sale_id = s.id
  LEFT JOIN products p ON si.product_id = p.id
  WHERE s.status NOT IN ('FAILED', 'Return')
    AND s.date >= '2026-03-01' AND s.date <= '2026-03-31'
    AND UPPER(p.name) NOT LIKE '%SHIPPING%'
`).get().total;

console.log(`  Full March COGS (with shipping):    ₱${allMarchCogs.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
console.log(`  March COGS (without shipping):      ₱${marchCogsNoShipping.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
console.log(`  Shipping contributes:               ₱${shippingTotal.toFixed(2)}`);

// 3. Check what DB would total if we also fix the 2 known anomalies
const dufamoxgFix = -4083.31;  // if qty=0, total_cost should be 0
const dairysolutionsFix = +3731.54; // if qty=2, total_cost should be 7463.08 (currently 3731.54)

const correctedTotal = allMarchCogs + dufamoxgFix + dairysolutionsFix;
console.log('\n--- Hypothetical Corrections ---');
console.log(`  Current DB total:                   ₱${allMarchCogs.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
console.log(`  Fix DUFAMOXG (qty=0, total_cost→0): -₱4,083.31`);
console.log(`  Fix DAIRYSOLUTIONS WALKINN (qty=2, total_cost→7463.08): +₱3,731.54`);
console.log(`  After corrections:                  ₱${correctedTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
console.log(`  User's Excel:                       ₱1,475,611.12`);
console.log(`  Remaining gap after corrections:    ₱${(correctedTotal - 1475611.12).toFixed(2)}`);

// 4. What if both fixes AND shipping are excluded?
const correctedNoShipping = marchCogsNoShipping + dufamoxgFix + dairysolutionsFix;
console.log('\n--- Corrections + Exclude Shipping ---');
console.log(`  After corrections (no shipping):    ₱${correctedNoShipping.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
console.log(`  User's Excel:                       ₱1,475,611.12`);
console.log(`  Gap:                                ₱${(correctedNoShipping - 1475611.12).toFixed(2)}`);

// 5. Rows where total_cost does NOT match qty * costing (all March)
console.log('\n--- All rows where total_cost != qty * costing ---');
const allRows = db.prepare(`
  SELECT 
    s.date,
    s.si_number,
    p.name as product_name,
    si.qty,
    si.costing,
    si.total_cost,
    (si.qty * si.costing) as expected,
    (si.total_cost - si.qty * si.costing) as diff
  FROM sale_items si
  INNER JOIN sales s ON si.sale_id = s.id
  LEFT JOIN products p ON si.product_id = p.id
  WHERE s.status NOT IN ('FAILED', 'Return')
    AND s.date >= '2026-03-01' AND s.date <= '2026-03-31'
`).all();

let sumDiff = 0;
let anomalyCount = 0;
allRows.forEach(r => {
  if (Math.abs(r.diff) > 0.01) {
    anomalyCount++;
    sumDiff += r.diff;
    console.log(`  [ANOMALY] ${r.date} | "${r.si_number}" | ${r.product_name} | Qty=${r.qty} × Costing=${r.costing} = Expected ₱${r.expected.toFixed(2)} | Actual TotalCost=₱${r.total_cost.toFixed(2)} | Diff=₱${r.diff.toFixed(2)}`);
  }
});
if (anomalyCount === 0) console.log('  None found.');
console.log(`  Total anomalies: ${anomalyCount} | Net COGS inflation: ₱${sumDiff.toFixed(2)}`);

db.close();

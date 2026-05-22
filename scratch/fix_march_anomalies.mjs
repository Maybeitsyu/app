import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

console.log('=== FIXING 2 CONFIRMED DB ANOMALIES IN MARCH 2026 ===\n');

// ---- Bug 1: DUFAMOXG 2026-03-06 ----
// Customer = "EXPIRED" → this is an expired/written-off stock entry
// Qty = 0, gross_amount = 0, profit = -4083.31
// total_cost = 4083.31 (wrong — should be 0 since qty = 0)
// Fix: set total_cost = 0 and profit = 0 in sale_items,
//      and set profit = 0 in sales table
const dufamoxgItemId = '348d3c27-5ab3-4474-b61b-08bdbe42e896';
const dufamoxgSaleId = '82a6be18-9375-45a6-8c09-eddcb0bc0b90';

console.log('--- Bug 1: DUFAMOXG (Expired stock) ---');
console.log('  Before: total_cost=4083.31, profit=-4083.31');
console.log('  Fix: total_cost=0, profit=0 (qty=0 means zero COGS)');

db.prepare(`UPDATE sale_items SET total_cost = 0, profit = 0 WHERE id = ?`).run(dufamoxgItemId);
db.prepare(`UPDATE sales SET profit = 0 WHERE id = ?`).run(dufamoxgSaleId);
console.log('  ✓ DUFAMOXG sale_item and sale updated');

// ---- Bug 2: DAIRYSOLUTIONS WALKINN 2026-03-28 ----
// Qty = 2, Costing = 3731.54
// total_cost = 3731.54 (only 1 unit — should be 2 × 3731.54 = 7463.08)
// Fix: set total_cost = 7463.08 and profit = gross_amount - total_cost
const dairysolutionsItemId = 'bb55ecb4-3101-45d3-bc36-d4f8b16edef2';
const dairysolutionsSaleId  = '32df7792-ba02-44b1-83b5-0fc7a395e9ec';
const correctTotalCost = 2 * 3731.54; // 7463.08
const grossAmount = 11000;
const correctProfit = grossAmount - correctTotalCost; // 3536.92

console.log('\n--- Bug 2: DAIRYSOLUTIONS WALKINN 2026-03-28 ---');
console.log('  Before: Qty=2, total_cost=3731.54 (only 1 unit worth)');
console.log(`  Fix: total_cost=${correctTotalCost.toFixed(2)} (2 × 3731.54), profit=${correctProfit.toFixed(2)}`);

db.prepare(`UPDATE sale_items SET total_cost = ?, profit = ? WHERE id = ?`).run(correctTotalCost, correctProfit, dairysolutionsItemId);
db.prepare(`UPDATE sales SET profit = ? WHERE id = ?`).run(correctProfit, dairysolutionsSaleId);
console.log('  ✓ DAIRYSOLUTIONS sale_item and sale updated');

// ---- Verify the new total ----
const newTotal = db.prepare(`
  SELECT SUM(si.total_cost) as total
  FROM sale_items si
  INNER JOIN sales s ON si.sale_id = s.id
  WHERE s.status NOT IN ('FAILED', 'Return')
    AND s.date >= '2026-03-01' AND s.date <= '2026-03-31'
`).get().total;

console.log(`\n=== VERIFICATION ===`);
console.log(`  Old DB total (March COGS): ₱1,478,611.12`);
console.log(`  New DB total (March COGS): ₱${newTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
console.log(`  Change: ₱${(newTotal - 1478611.12).toFixed(2)}`);
console.log(`  User's Excel total:        ₱1,475,611.12`);
console.log(`  Remaining gap:             ₱${(newTotal - 1475611.12).toFixed(2)}`);

db.close();

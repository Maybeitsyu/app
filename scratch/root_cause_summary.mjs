import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

console.log('=== Investigating SI0244 SHIPPINGFEE row ===\n');

// Get the full sale record for SI0244
const si0244Sale = db.prepare(`
  SELECT 
    s.id, s.date, s.si_number, s.status, s.remarks,
    s.gross_amount, s.profit, s.input_vat, s.output_vat,
    s.channel, s.company_name,
    c.name as customer_name
  FROM sales s
  LEFT JOIN customers c ON s.customer_id = c.id
  WHERE s.si_number = 'SI0244'
`).all();

console.log('SI0244 Sales records:');
si0244Sale.forEach(s => console.log(JSON.stringify(s, null, 2)));

// Get all items for SI0244
console.log('\nSI0244 Sale Items:');
const si0244Items = db.prepare(`
  SELECT 
    si.id, si.qty, si.unit_price, si.costing, si.total_cost, si.profit,
    p.name as product_name
  FROM sale_items si
  INNER JOIN sales s ON si.sale_id = s.id
  LEFT JOIN products p ON si.product_id = p.id
  WHERE s.si_number = 'SI0244'
  ORDER BY p.name
`).all();

si0244Items.forEach(item => {
  console.log(`  Product: ${item.product_name} | Qty:${item.qty} | Price:₱${item.unit_price} | Costing:₱${item.costing} | TotalCost:₱${item.total_cost}`);
});

console.log('\n\n=== Investigating the DUFAMOXG row ===\n');
// Get all info on the DUFAMOXG sale
const dufamoxg = db.prepare(`
  SELECT 
    s.id, s.date, s.si_number, s.status, s.remarks,
    s.gross_amount, s.profit, s.channel, s.company_name,
    c.name as customer_name,
    si.qty, si.unit_price, si.costing, si.total_cost,
    p.name as product_name, p.cost, p.average_cost
  FROM sale_items si
  INNER JOIN sales s ON si.sale_id = s.id
  LEFT JOIN products p ON si.product_id = p.id
  LEFT JOIN customers c ON s.customer_id = c.id
  WHERE s.date = '2026-03-06' AND p.name = 'DUFAMOXG'
`).get();

console.log('DUFAMOXG March 6 record:');
console.log(JSON.stringify(dufamoxg, null, 2));
console.log(`\n  Note: 583.33 × 7 = ${(583.33 * 7).toFixed(2)} — so total_cost suggests this was actually QTY=7`);
console.log(`  But the DB shows QTY=0 and GROSS_AMOUNT=0 — meaning price×qty = 0 too`);
console.log(`  Likely: the Excel row had Qty column blank/0, but TOTAL COST cell had formula = 7×583.33`);
console.log(`  The import took TOTAL COST directly from Excel (₱4,083.31) without recalculating qty×costing`);

console.log('\n\n=== Investigating DAIRYSOLUTIONS WALKINN 2026-03-28 ===\n');
const dairysolutions = db.prepare(`
  SELECT 
    s.id, s.date, s.si_number, s.status, s.remarks,
    s.gross_amount, s.profit, s.channel, s.company_name,
    c.name as customer_name,
    si.qty, si.unit_price, si.costing, si.total_cost,
    p.name as product_name
  FROM sale_items si
  INNER JOIN sales s ON si.sale_id = s.id
  LEFT JOIN products p ON si.product_id = p.id
  LEFT JOIN customers c ON s.customer_id = c.id
  WHERE s.date = '2026-03-28' AND s.si_number = 'WALKINN' AND p.name = 'DAIRYSOLUTIONS'
`).get();

console.log('DAIRYSOLUTIONS WALKINN March 28 record:');
console.log(JSON.stringify(dairysolutions, null, 2));
console.log(`\n  DB: Qty=2, Costing=3731.54 → Expected total = 2 × 3731.54 = ₱${(2 * 3731.54).toFixed(2)}`);
console.log(`  Actual total_cost stored: ₱${dairysolutions.total_cost} (only 1 unit's worth)`);
console.log(`  Missing from DB: ₱${(2 * 3731.54 - dairysolutions.total_cost).toFixed(2)}`);

console.log('\n\n=== SUMMARY: ROOT CAUSE OF DISCREPANCY ===');
console.log('\n  DB March COGS:                                   ₱1,478,611.12');
console.log('  User\'s Excel March COGS:                         ₱1,475,611.12');
console.log('  Difference:                                      ₱3,000.00\n');
console.log('  CONFIRMED DATA BUGS in DB:');
console.log('  ┌─────────────────────────────────────────────────────────────┐');
console.log('  │ Bug 1: DUFAMOXG 2026-03-06                                  │');
console.log('  │   Qty=0 but TotalCost=₱4,083.31 (should be ₱0)             │');
console.log('  │   DB is OVER by ₱4,083.31                                   │');
console.log('  ├─────────────────────────────────────────────────────────────┤');
console.log('  │ Bug 2: DAIRYSOLUTIONS WALKINN 2026-03-28                    │');
console.log('  │   Qty=2 × Costing=₱3,731.54 but TotalCost=₱3,731.54        │');
console.log('  │   DB is UNDER by ₱3,731.54 (only 1 unit counted)           │');
console.log('  └─────────────────────────────────────────────────────────────┘');
console.log('  Net impact of 2 bugs: +₱4,083.31 - ₱3,731.54 = +₱351.77 too high in DB');
console.log('\n  After correcting both bugs: ₱1,478,611.12 - ₱4,083.31 + ₱3,731.54 = ₱1,478,259.35');
console.log('  Still gap vs user\'s Excel: ₱1,478,259.35 - ₱1,475,611.12 = ₱2,648.23');
console.log('\n  The remaining ₱2,648.23 CANNOT be traced without the original Excel import file.');
console.log('  Possible causes: some rows in DB have costings that differ from the original Excel values.');

db.close();

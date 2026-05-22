import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

console.log('═══════════════════════════════════════════════════════════════');
console.log('SEARCHING FOR REMAINING ₱2,648.23 DISCREPANCY');
console.log('═══════════════════════════════════════════════════════════════\n');

// Get all March 2026 sales items
const marchItems = db.prepare(`
  SELECT 
    s.id as sale_id,
    s.date,
    s.si_number,
    s.status,
    s.remarks,
    p.name as product_name,
    si.qty,
    si.unit_price,
    si.costing,
    si.total_cost,
    (si.qty * si.costing) as calculated_cost,
    (si.total_cost - (si.qty * si.costing)) as variance
  FROM sale_items si
  INNER JOIN sales s ON si.sale_id = s.id
  LEFT JOIN products p ON si.product_id = p.id
  WHERE s.status NOT IN ('FAILED', 'Return')
    AND s.date >= '2026-03-01' AND s.date <= '2026-03-31'
  ORDER BY ABS(variance) DESC
`).all();

console.log(`Total March 2026 items: ${marchItems.length}\n`);

// Find anomalies
const anomalies = marchItems.filter(item => Math.abs(item.variance) > 0.01);

console.log(`ANOMALIES FOUND: ${anomalies.length}\n`);

if (anomalies.length > 0) {
  // Group by variance amount to find the ₱2,648.23
  const varianceMap = {};
  anomalies.forEach(a => {
    const v = a.variance.toFixed(2);
    if (!varianceMap[v]) varianceMap[v] = [];
    varianceMap[v].push(a);
  });

  console.log('VARIANCES GROUPED BY AMOUNT:');
  Object.entries(varianceMap)
    .sort((a, b) => Math.abs(parseFloat(b[0])) - Math.abs(parseFloat(a[0])))
    .forEach(([amount, items]) => {
      console.log(`\n  ₱${amount} variance (${items.length} item${items.length > 1 ? 's' : ''})`);
      items.forEach(item => {
        console.log(`    • ${item.product_name} | SI: ${item.si_number} | Date: ${item.date}`);
        console.log(`      qty=${item.qty}, costing=₱${item.costing.toFixed(2)}`);
        console.log(`      total_cost (DB)=₱${item.total_cost.toFixed(2)}, calc=₱${item.calculated_cost.toFixed(2)}`);
      });
    });
} else {
  console.log('✓ NO ANOMALIES FOUND - Database is consistent!\n');
}

// Calculate totals
const totalFromDB = marchItems.reduce((sum, r) => sum + (r.total_cost || 0), 0);
const totalVariance = marchItems.reduce((sum, r) => sum + (r.variance || 0), 0);

console.log('\n' + '═'.repeat(63));
console.log('TOTAL VARIANCE SUMMARY:');
console.log(`  Sum of all variances: ₱${totalVariance.toFixed(2)}`);
console.log(`  Database total_cost:  ₱${totalFromDB.toFixed(2)}`);
console.log(`  Expected (corrected): ₱1,478,259.35`);
console.log(`  Gap to Excel:         ₱1,475,611.12`);
console.log('═'.repeat(63));

// Check for specific amounts that could add up to ₱2,648.23
console.log('\nLOOKING FOR COMBINATIONS THAT SUM TO ₱2,648.23:');
const target = 2648.23;
let found = false;

for (let i = 0; i < anomalies.length; i++) {
  for (let j = i + 1; j < anomalies.length; j++) {
    const sum = Math.abs(anomalies[i].variance) + Math.abs(anomalies[j].variance);
    if (Math.abs(sum - target) < 0.01) {
      console.log(`  Found pair: ₱${anomalies[i].variance.toFixed(2)} + ₱${anomalies[j].variance.toFixed(2)} = ₱${sum.toFixed(2)}`);
      found = true;
    }
  }
}

if (!found && anomalies.length > 0) {
  console.log(`  No pair combination found. Largest single anomaly: ₱${Math.max(...anomalies.map(a => Math.abs(a.variance))).toFixed(2)}`);
}

db.close();

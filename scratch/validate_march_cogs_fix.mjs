import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use the same database as the app (in data/ folder)
const dbPath = path.join(__dirname, '..', 'data', 'agridb.db');
const db = new Database(dbPath, { readonly: true });

console.log('═══════════════════════════════════════════════════════════════');
console.log('MARCH 2026 COGS VALIDATION REPORT');
console.log('═══════════════════════════════════════════════════════════════\n');

// Get March 2026 sales data
const marchSales = db.prepare(`
  SELECT 
    sale_id,
    product_name,
    qty,
    costing,
    total_cost,
    (qty * costing) as calculated_cost,
    (total_cost - (qty * costing)) as variance,
    DATE(sale_date) as sale_date,
    company
  FROM sales
  WHERE strftime('%Y-%m', sale_date) = '2026-03'
  ORDER BY sale_date
`).all();

console.log(`Total Sales Records for March 2026: ${marchSales.length}\n`);

// Calculate totals
const totalCost = marchSales.reduce((sum, r) => sum + (r.total_cost || 0), 0);
const calculatedTotal = marchSales.reduce((sum, r) => sum + (r.qty * r.costing), 0);
const variance = totalCost - calculatedTotal;

console.log('TOTALS:');
console.log(`  Database total_cost column:        ₱${totalCost.toFixed(2)}`);
console.log(`  Calculated (qty × costing):        ₱${calculatedTotal.toFixed(2)}`);
console.log(`  Variance:                          ₱${variance.toFixed(2)}`);
console.log(`\n  Expected after fix:                ₱1,478,259.35`);
console.log(`  Target Excel file:                 ₱1,475,611.12`);
console.log(`  Remaining gap:                     ₱2,648.23\n`);

// Find any anomalies (where total_cost != qty * costing)
const anomalies = marchSales.filter(r => Math.abs(r.variance) > 0.01);

if (anomalies.length > 0) {
  console.log(`⚠️  ANOMALIES DETECTED: ${anomalies.length} records with variance\n`);
  anomalies.forEach(r => {
    console.log(`  Product: ${r.product_name}`);
    console.log(`    Date: ${r.sale_date}, Company: ${r.company}`);
    console.log(`    qty: ${r.qty}, costing: ₱${r.costing.toFixed(2)}`);
    console.log(`    total_cost (DB): ₱${r.total_cost.toFixed(2)}`);
    console.log(`    Calculated: ₱${(r.qty * r.costing).toFixed(2)}`);
    console.log(`    Variance: ₱${r.variance.toFixed(2)}`);
    console.log();
  });
} else {
  console.log('✓ NO ANOMALIES: All records are mathematically consistent!\n');
}

// Summary by company
console.log('BREAKDOWN BY COMPANY:');
const byCompany = {};
marchSales.forEach(r => {
  if (!byCompany[r.company]) {
    byCompany[r.company] = { count: 0, total: 0 };
  }
  byCompany[r.company].count += 1;
  byCompany[r.company].total += r.total_cost;
});

Object.entries(byCompany).sort().forEach(([company, data]) => {
  console.log(`  ${company}: ${data.count} records, ₱${data.total.toFixed(2)}`);
});

console.log('\n═══════════════════════════════════════════════════════════════');

db.close();

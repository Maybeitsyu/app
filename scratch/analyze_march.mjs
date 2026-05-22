import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

console.log('--- March 2026 DB Sales Items Analysis ---');

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
    si.total_cost
  FROM sale_items si
  INNER JOIN sales s ON si.sale_id = s.id
  LEFT JOIN products p ON si.product_id = p.id
  WHERE s.status NOT IN ('FAILED', 'Return')
    AND s.date >= '2026-03-01' AND s.date <= '2026-03-31'
  ORDER BY s.date, s.si_number
`).all();

console.log(`Loaded ${marchItems.length} active items for March 2026.`);

// Let's write them to a JSON file for deep analysis
fs.writeFileSync('scratch/march_db_items.json', JSON.stringify(marchItems, null, 2), 'utf8');
console.log('Wrote items to scratch/march_db_items.json');

// Check for exact 3000 differences or total_cost values
console.log('\n--- Checking for total_cost equal to 3000 or multiples in March ---');
let found3000 = false;
marchItems.forEach(item => {
  if (Math.abs(item.total_cost - 3000) < 0.01) {
    console.log(`Found item with total_cost=3000: SI=${item.si_number}, Date=${item.date}, Product="${item.product_name}", Qty=${item.qty}, Costing=${item.costing}, TotalCost=${item.total_cost}, Status=${item.status}, Remarks="${item.remarks}"`);
    found3000 = true;
  }
});
if (!found3000) {
  console.log('No single item has total_cost = 3,000.00.');
}

// Let's check for any anomalies where Qty * Costing != TotalCost
console.log('\n--- Checking for anomalies (Qty * Costing != TotalCost) in March ---');
let anomaliesCount = 0;
marchItems.forEach(item => {
  const expected = Number((item.qty * item.costing).toFixed(2));
  if (Math.abs(item.total_cost - expected) > 0.01) {
    console.log(`Anomaly: SI=${item.si_number}, Date=${item.date}, Product="${item.product_name}", Qty=${item.qty}, Costing=${item.costing}, DB TotalCost=${item.total_cost}, Expected=${expected}`);
    anomaliesCount++;
  }
});
console.log(`Total anomalies in March: ${anomaliesCount}`);

db.close();

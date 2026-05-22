import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

console.log('--- DB COGS by Company (May 2026) ---');
const companies = ['Batangas Dairy Farmtech Inc.', 'Dairy Solutions OPC'];

for (const company of companies) {
  const result = db.prepare(`
    SELECT 
      COALESCE(SUM(si.total_cost), 0) as total_cogs,
      COUNT(DISTINCT s.id) as sale_count,
      COUNT(si.id) as item_count
    FROM sale_items si
    INNER JOIN sales s ON si.sale_id = s.id
    WHERE s.status NOT IN ('FAILED', 'Return')
      AND s.company_name = ?
      AND s.date >= '2026-05-01' AND s.date <= '2026-05-31'
  `).get(company);
  
  console.log(`Company: "${company}"`);
  console.log(`  Total COGS:   ₱${result.total_cogs.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`  Sale Rows:    ${result.sale_count}`);
  console.log(`  Item Rows:    ${result.item_count}`);
}

const totalMay = db.prepare(`
  SELECT 
    COALESCE(SUM(si.total_cost), 0) as total_cogs,
    COUNT(DISTINCT s.id) as sale_count,
    COUNT(si.id) as item_count
  FROM sale_items si
  INNER JOIN sales s ON si.sale_id = s.id
  WHERE s.status NOT IN ('FAILED', 'Return')
    AND s.date >= '2026-05-01' AND s.date <= '2026-05-31'
`).get();

console.log(`\nAll Companies combined (May 2026):`);
console.log(`  Total COGS:   ₱${totalMay.total_cogs.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`  Sale Rows:    ${totalMay.sale_count}`);
console.log(`  Item Rows:    ${totalMay.item_count}`);

db.close();

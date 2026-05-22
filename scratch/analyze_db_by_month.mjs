import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

console.log('--- DB COGS Breakdown by Month and Company ---');

const results = db.prepare(`
  SELECT 
    strftime('%Y-%m', s.date) as year_month,
    s.company_name,
    COALESCE(SUM(si.total_cost), 0) as total_cogs,
    COUNT(DISTINCT s.id) as sale_count,
    COUNT(si.id) as item_count
  FROM sale_items si
  INNER JOIN sales s ON si.sale_id = s.id
  WHERE s.status NOT IN ('FAILED', 'Return')
  GROUP BY year_month, s.company_name
  ORDER BY year_month, s.company_name
`).all();

results.forEach(row => {
  console.log(`Month: ${row.year_month} | Company: "${row.company_name}"`);
  console.log(`  Total COGS: ₱${row.total_cogs.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
  console.log(`  Sales count: ${row.sale_count} | Items count: ${row.item_count}`);
});

db.close();

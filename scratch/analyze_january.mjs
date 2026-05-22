import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

console.log('--- January 2026 DB COGS Breakdown ---');

const result = db.prepare(`
  SELECT 
    COALESCE(SUM(si.total_cost), 0) as total_cogs,
    COUNT(DISTINCT s.id) as sale_count,
    COUNT(si.id) as item_count
  FROM sale_items si
  INNER JOIN sales s ON si.sale_id = s.id
  WHERE s.status NOT IN ('FAILED', 'Return')
    AND s.date >= '2026-01-01' AND s.date <= '2026-01-31'
`).get();

console.log(`Total COGS for January 2026: ₱${result.total_cogs.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`Sale count:                  ${result.sale_count}`);
console.log(`Item count:                  ${result.item_count}`);

db.close();

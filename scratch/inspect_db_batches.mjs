import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

console.log('--- Checking March 2026 sales import timestamps ---');

const timestamps = db.prepare(`
  SELECT 
    created_at,
    COUNT(*) as c,
    SUM(gross_amount) as total_gross
  FROM sales
  WHERE date >= '2026-03-01' AND date <= '2026-03-31'
  GROUP BY created_at
  ORDER BY created_at DESC
`).all();

timestamps.forEach(t => {
  console.log(`Timestamp: ${t.created_at} | Count: ${t.c} | Total Gross: ₱${t.total_gross.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
});

db.close();

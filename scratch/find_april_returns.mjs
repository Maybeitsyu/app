import { DatabaseSync } from 'node:sqlite';
const dbPath = 'C:/Users/ufuni/AppData/Roaming/AgriLedger/data/agridb.db';
const db = new DatabaseSync(dbPath, { readonly: true });
const rows = db.prepare(`
SELECT s.si_number, s.date, s.status, s.remarks, p.name AS product_name, si.qty, si.unit_price, si.costing, si.total_cost
FROM sale_items si
INNER JOIN sales s ON si.sale_id = s.id
LEFT JOIN products p ON si.product_id = p.id
WHERE s.date >= '2026-04-01' AND s.date <= '2026-04-30' AND s.status = 'Return'
ORDER BY s.date, s.si_number
`).all();
console.log('RETURN ROW COUNT', rows.length);
console.log(JSON.stringify(rows, null, 2));
db.close();

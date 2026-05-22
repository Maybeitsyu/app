import { DatabaseSync } from 'node:sqlite';
const dbPath = 'C:/Users/ufuni/AppData/Roaming/AgriLedger/data/agridb.db';
const db = new DatabaseSync(dbPath, { readonly: true });
const rows = db.prepare(`
SELECT s.id AS sale_id,
       s.si_number,
       s.date,
       s.status,
       s.remarks,
       si.id AS item_id,
       si.product_id,
       si.qty,
       si.unit,
       si.unit_price,
       si.costing,
       si.shipping_fee,
       si.total_cost,
       p.name AS product_name
FROM sale_items si
INNER JOIN sales s ON si.sale_id = s.id
LEFT JOIN products p ON si.product_id = p.id
WHERE s.date >= '2026-04-01' AND s.date <= '2026-04-30' AND s.status NOT IN ('FAILED','Return')
ORDER BY si.total_cost DESC, s.date, s.si_number
LIMIT 200
`).all();
console.log('COUNT', rows.length);
console.log('TOTAL COGS', rows.reduce((sum, r) => sum + r.total_cost, 0).toFixed(2));
console.log('TOP 50 ROWS BY total_cost:');
console.log(JSON.stringify(rows.slice(0, 50).map(r => ({si: r.si_number, date: r.date, status: r.status, remarks: r.remarks, product: r.product_name, qty: r.qty, unit_price: r.unit_price, costing: r.costing, shipping_fee: r.shipping_fee, total_cost: r.total_cost})), null, 2));
db.close();

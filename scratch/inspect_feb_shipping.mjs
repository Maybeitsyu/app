import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = path.join(process.env.APPDATA, 'AgriLedger', 'data', 'agridb.db');
const db = new DatabaseSync(dbPath, { readonly: true });
const custRows = db.prepare('SELECT id, name FROM customers').all();
const customerMap = new Map(custRows.map(r => [r.id, r.name]));

const rows = db.prepare(`
  SELECT s.id as sale_id, s.date, s.receipt_number, s.si_number, p.name as product_name, si.qty, si.unit_price, si.costing, si.total_cost, s.customer_id, s.status
  FROM sale_items si
  JOIN sales s ON si.sale_id = s.id
  LEFT JOIN products p ON si.product_id = p.id
  WHERE s.date >= ? AND s.date <= ? AND p.name = 'SHIPPINGFEE'
  ORDER BY s.date
`).all('2026-02-01', '2026-02-28');

for (const row of rows) {
  console.log(JSON.stringify({
    date: row.date,
    receipt: row.receipt_number,
    si: row.si_number,
    product: row.product_name,
    qty: row.qty,
    costing: row.costing,
    total_cost: row.total_cost,
    customer: customerMap.get(row.customer_id),
    status: row.status
  }));
}

db.close();

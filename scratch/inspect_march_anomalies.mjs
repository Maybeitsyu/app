import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

console.log('=== Inspecting DUFAMOXG Anomaly ===');
const dufamoxg = db.prepare(`
  SELECT 
    s.id as sale_id,
    s.date,
    s.si_number,
    s.status,
    s.remarks,
    s.gross_amount as s_gross,
    s.profit as s_profit,
    si.id as item_id,
    si.qty,
    si.unit_price,
    si.gross_amount as si_gross,
    si.costing as si_costing,
    si.total_cost as si_total_cost,
    si.profit as si_profit
  FROM sale_items si
  INNER JOIN sales s ON si.sale_id = s.id
  LEFT JOIN products p ON si.product_id = p.id
  WHERE s.date = '2026-03-06' AND p.name = 'DUFAMOXG'
`).get();

console.log(dufamoxg);

console.log('\n=== Inspecting DAIRYSOLUTIONS Anomaly ===');
const dairysolutions = db.prepare(`
  SELECT 
    s.id as sale_id,
    s.date,
    s.si_number,
    s.status,
    s.remarks,
    s.gross_amount as s_gross,
    s.profit as s_profit,
    si.id as item_id,
    si.qty,
    si.unit_price,
    si.gross_amount as si_gross,
    si.costing as si_costing,
    si.total_cost as si_total_cost,
    si.profit as si_profit
  FROM sale_items si
  INNER JOIN sales s ON si.sale_id = s.id
  LEFT JOIN products p ON si.product_id = p.id
  WHERE s.date = '2026-03-28' AND s.si_number = 'WALKINN' AND p.name = 'DAIRYSOLUTIONS'
`).get();

console.log(dairysolutions);

db.close();

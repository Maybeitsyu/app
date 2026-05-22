import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

console.log('=== March 2026 Sales Aggregated by Product ===');

const productsAgg = db.prepare(`
  SELECT 
    p.name as product_name,
    p.cost as product_cost,
    p.average_cost as product_avg_cost,
    SUM(si.qty) as total_qty,
    SUM(si.total_cost) as total_cost,
    AVG(si.costing) as avg_costing_in_sales
  FROM sale_items si
  INNER JOIN sales s ON si.sale_id = s.id
  LEFT JOIN products p ON si.product_id = p.id
  WHERE s.status NOT IN ('FAILED', 'Return')
    AND s.date >= '2026-03-01' AND s.date <= '2026-03-31'
  GROUP BY p.id
  ORDER BY total_cost DESC
`).all();

console.log(`Product Name | Qty Sold | Avg Costing in Sales | Total Cost | Product Cost in Master | Product Avg Cost in Master`);
console.log('-----------------------------------------------------------------------------------------------------------------');
productsAgg.forEach(p => {
  console.log(`${p.product_name.padEnd(25)} | ${p.total_qty.toString().padEnd(8)} | ₱${p.avg_costing_in_sales.toFixed(2).padEnd(19)} | ₱${p.total_cost.toFixed(2).padEnd(9)} | ₱${p.product_cost.toFixed(2).padEnd(21)} | ₱${p.product_avg_cost.toFixed(2)}`);
});

const totalMarchCogs = productsAgg.reduce((sum, p) => sum + p.total_cost, 0);
console.log('-----------------------------------------------------------------------------------------------------------------');
console.log(`TOTAL MARCH COGS: ₱${totalMarchCogs.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);

db.close();

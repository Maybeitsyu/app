const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'agridb.db');
const db = new Database(dbPath);

const products = db.prepare('SELECT id, code, name, stock_qty, reorder_point FROM products').all();
console.log('Products:', JSON.stringify(products, null, 2));

const batches = db.prepare('SELECT product_id, remaining_qty FROM batches WHERE remaining_qty > 0').all();
console.log('Active Batches:', JSON.stringify(batches, null, 2));

const lowStockQuery = `
  SELECT p.id, p.name, p.stock_qty, p.reorder_point, (COALESCE(SUM(b.remaining_qty), 0) + p.stock_qty) AS current_stock
  FROM products p
  LEFT JOIN batches b ON b.product_id = p.id AND b.remaining_qty > 0
  GROUP BY p.id
  HAVING current_stock <= p.reorder_point
`;
const lowStock = db.prepare(lowStockQuery).all();
console.log('Low Stock Results:', JSON.stringify(lowStock, null, 2));

db.close();

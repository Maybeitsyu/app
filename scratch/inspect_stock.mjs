import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';

const dbPath = path.join(process.env.APPDATA, 'AgriLedger', 'data', 'agridb.db');
console.log('DB Path:', dbPath);

try {
  const db = new Database(dbPath, { readonly: true });

  // 1. Get products where stock_qty > 0
  const products = db.prepare('SELECT id, code, name, stock_qty FROM products WHERE stock_qty > 0').all();
  console.log('\n--- Products with stock_qty > 0 ---');
  console.log(products);

  // 2. Get legacy batches
  const legacyBatches = db.prepare(`
    SELECT b.id, b.product_id, p.name, b.batch_number, b.remaining_qty, b.created_at
    FROM batches b
    JOIN products p ON b.product_id = p.id
    WHERE b.batch_number LIKE 'LEGACY-%'
    ORDER BY p.name, b.created_at
  `).all();
  console.log('\n--- Legacy Batches ---');
  console.log(legacyBatches);

  db.close();
} catch (err) {
  console.error('Error reading database:', err);
}

import Database from 'better-sqlite3';

const dbPath = process.env.APPDATA + '\\AgriLedger\\data\\agridb.db';
const db = new Database(dbPath);

console.log('Updating sale_items...');
const updateSaleItems = db.prepare(`
  UPDATE sale_items 
  SET profit = round(gross_amount - total_cost, 2)
`);
const result1 = updateSaleItems.run();
console.log(`Updated ${result1.changes} sale items.`);

console.log('Updating sales...');
const updateSales = db.prepare(`
  UPDATE sales
  SET profit = round(
    COALESCE((SELECT SUM(profit) FROM sale_items WHERE sale_id = sales.id), 0) +
    (shipping_fee - shipping_cost),
    2
  )
`);
const result2 = updateSales.run();
console.log(`Updated ${result2.changes} sales.`);

db.close();
console.log('Database profit calculations successfully updated!');

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve('C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db');
console.log('Opening real DB at:', dbPath);

try {
  const db = new Database(dbPath, { readonly: true });
  
  console.log('\n=== DETAIL OF SALE fd6227be-c0ec-45cc-af41-1e4d67e8b2ce (Walk Inn) ===');
  const sale1 = db.prepare("SELECT * FROM sales WHERE id = 'fd6227be-c0ec-45cc-af41-1e4d67e8b2ce'").get();
  console.log('Sale:', JSON.stringify(sale1, null, 2));
  
  const items1 = db.prepare("SELECT * FROM sale_items WHERE sale_id = 'fd6227be-c0ec-45cc-af41-1e4d67e8b2ce'").all();
  console.log('Items:', JSON.stringify(items1, null, 2));

  console.log('\n=== DETAIL OF SALE 7abb58b0-3fee-4036-bc31-6bce87b5d893 (SI 0213) ===');
  const sale2 = db.prepare("SELECT * FROM sales WHERE id = '7abb58b0-3fee-4036-bc31-6bce87b5d893'").get();
  console.log('Sale:', JSON.stringify(sale2, null, 2));
  
  const items2 = db.prepare("SELECT * FROM sale_items WHERE sale_id = '7abb58b0-3fee-4036-bc31-6bce87b5d893'").all();
  console.log('Items:', JSON.stringify(items2, null, 2));

} catch (e) {
  console.error(e.stack);
}

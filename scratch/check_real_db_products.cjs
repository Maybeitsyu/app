const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve('C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db');
console.log('Opening real DB at:', dbPath);

try {
  const db = new Database(dbPath, { readonly: true });
  
  const products = db.prepare("SELECT id, code, name, category, unit, cost, srp, is_vat_exempt FROM products WHERE name IN ('DAIRY SOLUTIONS', 'SHORT VACUUM TUBE')").all();
  console.log('Products:', JSON.stringify(products, null, 2));

} catch (e) {
  console.error(e.stack);
}

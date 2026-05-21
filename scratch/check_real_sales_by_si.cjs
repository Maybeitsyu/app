const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve('C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db');
console.log('Opening real DB at:', dbPath);

try {
  const db = new Database(dbPath, { readonly: true });
  
  console.log('\n=== ALL SALES WITH SI LIKE SI 0213 ===');
  const sales1 = db.prepare("SELECT id, date, si_number, company_name, gross_amount, input_vat, vat_exempt_amount, status, created_at FROM sales WHERE si_number LIKE '%0213%'").all();
  console.log(JSON.stringify(sales1, null, 2));

  console.log('\n=== ALL SALES WITH SI LIKE WALK INN ===');
  const sales2 = db.prepare("SELECT id, date, si_number, company_name, gross_amount, input_vat, vat_exempt_amount, status, created_at FROM sales WHERE si_number LIKE '%WALK INN%'").all();
  console.log(JSON.stringify(sales2, null, 2));

} catch (e) {
  console.error(e.stack);
}

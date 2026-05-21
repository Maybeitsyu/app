const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve('C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db');
console.log('Opening real DB at:', dbPath);

if (!fs.existsSync(dbPath)) {
  console.log('Database file does not exist at this path!');
  process.exit(1);
}

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Total sales rows
  const count = db.prepare('SELECT COUNT(*) as count FROM sales').get().count;
  const sum = db.prepare('SELECT SUM(input_vat + vat_exempt_amount) as total FROM sales').get().total;
  const filteredSum = db.prepare("SELECT SUM(input_vat + vat_exempt_amount) as total FROM sales WHERE status NOT IN ('FAILED', 'Return')").get().total;

  console.log(`Total sales row count in DB: ${count}`);
  console.log(`Total sales sum (all): ${sum}`);
  console.log(`Total sales sum (excluding FAILED/Return): ${filteredSum}`);

  // Let's dump all sales to a file to inspect it
  const allSales = db.prepare("SELECT id, date, si_number, company_name, gross_amount, input_vat, vat_exempt_amount, status, created_at FROM sales").all();
  fs.writeFileSync('scratch/real_db_sales.json', JSON.stringify(allSales, null, 2), 'utf8');
  console.log('Wrote all sales to scratch/real_db_sales.json');

  // Let's check for any sale with sum of input_vat + vat_exempt_amount = 2940
  const match2940 = allSales.filter(s => Math.abs((s.input_vat + s.vat_exempt_amount) - 2940) < 0.01);
  console.log('\nSales matching 2940:', match2940);

  // Let's check if there are duplicate SI numbers
  const siCounts = {};
  allSales.forEach(s => {
    if (s.si_number) {
      siCounts[s.si_number] = (siCounts[s.si_number] || 0) + 1;
    }
  });
  const dups = Object.entries(siCounts).filter(([si, c]) => c > 1);
  console.log('\nDuplicate SI numbers:', dups);

} catch (e) {
  console.error(e.stack);
}

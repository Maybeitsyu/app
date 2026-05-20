const db = require('better-sqlite3')('agridb.db');

const grossSum = db.prepare("SELECT SUM(gross_amount) as total FROM sales WHERE status NOT IN ('FAILED', 'Return')").get().total;
const netSum = db.prepare("SELECT SUM(gross_amount - output_vat) as total FROM sales WHERE status NOT IN ('FAILED', 'Return')").get().total;
const inputVatSum = db.prepare("SELECT SUM(input_vat + vat_exempt_amount) as total FROM sales WHERE status NOT IN ('FAILED', 'Return')").get().total;

console.log('Gross Sum:', grossSum);
console.log('Gross - Output VAT:', netSum);
console.log('Input VAT + Exempt:', inputVatSum);

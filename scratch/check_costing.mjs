import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const db = new DatabaseSync(dbPath);

const totalCosting = db.prepare('SELECT SUM(costing) as total FROM sales').get().total;
const totalTotalCost = db.prepare('SELECT SUM(total_cost) as total FROM sales').get().total;

console.log('SUM(costing):', totalCosting);
console.log('SUM(total_cost):', totalTotalCost);

// Look for a 3000 difference maybe in one row? Or just dump everything to a file to analyze
const allSales = db.prepare('SELECT si_number, date, gross_amount, costing, total_cost FROM sales').all();

let total = 0;
for (const sale of allSales) {
  total += sale.costing;
}

console.log('Calculated from rows:', total);

db.close();

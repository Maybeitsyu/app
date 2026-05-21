const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve('C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db');
const db = new Database(dbPath, { readonly: true });

console.log('=== COMPARING REAL DB vs FRESH IMPORT ===\n');

// Sum by category in real DB
const realTotal = db.prepare("SELECT SUM(input_vat + vat_exempt_amount) as total FROM sales").get().total;
console.log('Real DB Total:', realTotal);

// Check the 2 discrepant records
const walkInn = db.prepare("SELECT gross_amount, input_vat, vat_exempt_amount, status FROM sales WHERE si_number='WALK INN' AND date='2026-01-12'").get();
const si0213AR = db.prepare("SELECT gross_amount, input_vat, vat_exempt_amount, status FROM sales WHERE si_number='SI 0213' AND date='2026-01-30' AND status='A/R'").get();

console.log('\n--- Walk Inn 2026-01-12 in REAL DB ---');
console.log(walkInn);
console.log('Contributes to total:', walkInn.input_vat + walkInn.vat_exempt_amount);

console.log('\n--- SI 0213 2026-01-30 (A/R) in REAL DB ---');
console.log(si0213AR);
console.log('Contributes to total:', si0213AR.input_vat + si0213AR.vat_exempt_amount);

console.log('\n--- WHAT THE EXCEL SOURCE SAYS (no VAT exempt column filled in those rows) ---');
console.log('Walk Inn: gross=1020, input_vat should be 910.71, vat_exempt=0 (NOT VAT exempt in Excel)');
console.log('SI 0213:  gross=1920, input_vat should be 1714.29, vat_exempt=0 (NOT VAT exempt in Excel)');

const excelExpectedWalkInn = 1020 / 1.12 * (1/1.12) * 1.12; // net of vat
const netWalkInn = 1020 / 1.12;
const netSI0213 = 1920 / 1.12;

console.log('\n--- DIFFERENCE CALCULATION ---');
// Real DB Walk Inn contributes 1020 (vat_exempt) 
// Excel would contribute 1020/1.12 = 910.71 (input_vat = net of vat)
const excelWalkInn = Math.round(1020 / 1.12 * 100) / 100;
const excelSI0213 = Math.round(1920 / 1.12 * 100) / 100;
console.log(`Walk Inn: DB contributes ${walkInn.input_vat + walkInn.vat_exempt_amount} vs Excel expected ${excelWalkInn}`);
console.log(`  Difference: ${(walkInn.input_vat + walkInn.vat_exempt_amount) - excelWalkInn}`);

console.log(`SI 0213:  DB contributes ${si0213AR.input_vat + si0213AR.vat_exempt_amount} vs Excel expected ${excelSI0213}`);
console.log(`  Difference: ${(si0213AR.input_vat + si0213AR.vat_exempt_amount) - excelSI0213}`);

const totalDiff = (walkInn.input_vat + walkInn.vat_exempt_amount - excelWalkInn) + (si0213AR.input_vat + si0213AR.vat_exempt_amount - excelSI0213);
console.log(`\nTotal difference explained: ${Math.round(totalDiff * 100) / 100}`);
console.log(`Actual discrepancy: 2260342.01 - 2257402.01 = ${2260342.01 - 2257402.01}`);

db.close();

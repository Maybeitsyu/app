import ExcelJS from 'exceljs';
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const excelPath = 'C:\\projct ni client\\app\\example xl\\agriledger back new.xlsx';

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(excelPath);
const marchSheet = workbook.getWorksheet('MARCH SALES');
if (!marchSheet) {
  throw new Error('MARCH SALES sheet not found');
}

const headers = [];
marchSheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
  const value = cell.value;
  headers[colNumber] = value ? String(value).trim() : '';
});

const normalizeKey = (row) => {
  const date = String(row['DATE'] || '').substring(0, 10);
  const product = String(row['PRODUCT'] || '').trim().toUpperCase();
  const qty = parseFloat(row['QTY']) || 0;
  const costing = parseFloat(row['COSTING']) || 0;
  const totalCost = parseFloat(row['TOTALCOST'] || row['TOTAL COST'] || row['TOTAL COSTS'] || 0) || 0;
  const customer = String(row['CUSTOMER'] || '').trim().toUpperCase();
  return { date, product, qty, costing, totalCost, customer };
};

const excelRows = [];
marchSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
  if (rowNumber === 1) return;
  const data = {};
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const header = headers[colNumber];
    if (header) data[header] = cell.value;
  });
  excelRows.push(normalizeKey(data));
});

const excelMap = new Map();
for (const row of excelRows) {
  const key = `${row.date}|${row.product}|${row.qty}|${row.costing}|${row.totalCost}|${row.customer}`;
  excelMap.set(key, (excelMap.get(key) || 0) + 1);
}

const db = new DatabaseSync(dbPath);
const dbRows = db.prepare(`
  SELECT si.qty, si.costing, si.total_cost, s.date as sale_date, p.name as product_name, s.customer_id, s.si_number, s.remarks, s.status
  FROM sale_items si
  JOIN sales s ON si.sale_id = s.id
  LEFT JOIN products p ON si.product_id = p.id
  WHERE s.status NOT IN ('FAILED', 'Return')
    AND s.date >= '2026-03-01' AND s.date <= '2026-03-31'
  ORDER BY s.date, s.si_number
`).all();

db.close();

const normalizeDbRow = (row) => {
  const date = String(row.sale_date || '').substring(0, 10);
  const product = String(row.product_name || '').trim().toUpperCase();
  const qty = parseFloat(row.qty) || 0;
  const costing = parseFloat(row.costing) || 0;
  const totalCost = parseFloat(row.total_cost) || 0;
  const customer = String(row.customer_id || '').trim().toUpperCase();
  return { date, product, qty, costing, totalCost, customer };
};

const dbMap = new Map();
for (const row of dbRows) {
  const normalized = normalizeDbRow(row);
  const key = `${normalized.date}|${normalized.product}|${normalized.qty}|${normalized.costing}|${normalized.totalCost}|${normalized.customer}`;
  dbMap.set(key, (dbMap.get(key) || 0) + 1);
}

const matches = [];
const onlyInExcel = new Map(excelMap);
const onlyInDb = new Map(dbMap);

for (const [key, count] of excelMap.entries()) {
  if (dbMap.has(key)) {
    const matched = Math.min(count, dbMap.get(key));
    matches.push({ key, count: matched });
    const remainingExcel = count - matched;
    const remainingDb = dbMap.get(key) - matched;
    if (remainingExcel > 0) onlyInExcel.set(key, remainingExcel);
    else onlyInExcel.delete(key);
    if (remainingDb > 0) onlyInDb.set(key, remainingDb);
    else onlyInDb.delete(key);
  }
}

const parseKey = (key) => {
  const [date, product, qty, costing, totalCost, customer] = key.split('|');
  return { date, product, qty, costing, totalCost, customer };
};

const sumValues = (map) => {
  let qty = 0;
  let totalCost = 0;
  let calc = 0;
  for (const [key, count] of map.entries()) {
    const { qty: q, costing, totalCost: t } = parseKey(key);
    const qtyN = parseFloat(q) || 0;
    const costN = parseFloat(costing) || 0;
    const totalN = parseFloat(t) || 0;
    qty += qtyN * count;
    totalCost += totalN * count;
    calc += qtyN * costN * count;
  }
  return { qty, totalCost, calc };
};

const excelTotals = sumValues(excelMap);
const dbTotals = sumValues(dbMap);
const onlyExcelTotals = sumValues(onlyInExcel);
const onlyDbTotals = sumValues(onlyInDb);

console.log('March 2026 comparison');
console.log(`  Excel rows: ${excelRows.length}`);
console.log(`  DB rows: ${dbRows.length}`);
console.log(`  Excel TOTALCOST sum: ₱${excelTotals.totalCost.toFixed(2)}`);
console.log(`  DB TOTAL_COST sum: ₱${dbTotals.totalCost.toFixed(2)}`);
console.log(`  Difference: ₱${(dbTotals.totalCost - excelTotals.totalCost).toFixed(2)}\n`);

console.log(`Rows only in Excel: ${onlyInExcel.size}`);
console.log(`Rows only in DB: ${onlyInDb.size}\n`);

const printMap = (label, map, limit = 20) => {
  console.log(`--- ${label} ---`);
  let i = 0;
  for (const [key, count] of map.entries()) {
    if (i++ >= limit) break;
    console.log(`count=${count} ${key}`);
  }
  if (map.size === 0) console.log('  none');
  console.log();
};

printMap('ONLY IN EXCEL', onlyInExcel);
printMap('ONLY IN DB', onlyInDb);

console.log(`Only-in-Excel total cost: ₱${onlyExcelTotals.totalCost.toFixed(2)}`);
console.log(`Only-in-DB total cost: ₱${onlyDbTotals.totalCost.toFixed(2)}`);

const dbExcess = dbTotals.totalCost - excelTotals.totalCost;
console.log(`\nDifference check: ₱${dbExcess.toFixed(2)} (should be ~₱3000.00)`);

if (onlyInDb.size > 0) {
  console.log('\nTop DB-only entries:');
  for (const [key, count] of onlyInDb.entries()) {
    if (count > 0) {
      console.log(`  count=${count} ${key}`);
    }
  }
}

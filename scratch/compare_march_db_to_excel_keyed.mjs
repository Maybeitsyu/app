import ExcelJS from 'exceljs';
import { DatabaseSync } from 'node:sqlite';

const dbPath = 'C:\\Users\\ufuni\\AppData\\Roaming\\AgriLedger\\data\\agridb.db';
const excelPath = 'C:\\projct ni client\\app\\example xl\\agriledger back new.xlsx';

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(excelPath);
const marchSheet = workbook.getWorksheet('MARCH SALES');
if (!marchSheet) throw new Error('MARCH SALES sheet not found');

const headers = [];
marchSheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
  headers[colNumber] = cell.value ? String(cell.value).trim() : '';
});

const field = (row, name) => {
  const idx = headers.findIndex(h => h && h.toUpperCase().replace(/\s+/g, '').includes(name));
  return idx > 0 ? row.getCell(idx).value : undefined;
};

const normalizeExcel = (row) => {
  const dateRaw = field(row, 'DATE');
  const date = dateRaw ? String(dateRaw).substring(0, 10) : '';
  const product = String(field(row, 'PRODUCT') || '').trim().toUpperCase();
  const qty = parseFloat(field(row, 'QTY')) || 0;
  const costing = parseFloat(field(row, 'COSTING')) || 0;
  const totalCost = parseFloat(field(row, 'TOTALCOST')) || parseFloat(field(row, 'TOTAL COST')) || 0;
  return { date, product, qty, costing, totalCost };
};

const excelRows = [];
marchSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
  if (rowNumber === 1) return;
  excelRows.push(normalizeExcel(row));
});

const key = (r) => `${r.date}|${r.product}|${r.qty}|${r.costing.toFixed(2)}|${r.totalCost.toFixed(2)}`;
const excelMap = new Map();
for (const r of excelRows) {
  const k = key(r);
  excelMap.set(k, (excelMap.get(k) || 0) + 1);
}

const db = new DatabaseSync(dbPath);
const dbRows = db.prepare(`
  SELECT si.qty, si.costing, si.total_cost, s.date as sale_date, p.name as product_name
  FROM sale_items si
  JOIN sales s ON si.sale_id = s.id
  LEFT JOIN products p ON si.product_id = p.id
  WHERE s.status NOT IN ('FAILED', 'Return')
    AND s.date >= '2026-03-01' AND s.date <= '2026-03-31'
`).all();
db.close();

const normalizeDb = (row) => {
  const date = String(row.sale_date || '').substring(0, 10);
  const product = String(row.product_name || '').trim().toUpperCase();
  const qty = parseFloat(row.qty) || 0;
  const costing = parseFloat(row.costing) || 0;
  const totalCost = parseFloat(row.total_cost) || 0;
  return { date, product, qty, costing, totalCost };
};

const dbMap = new Map();
for (const r of dbRows) {
  const n = normalizeDb(r);
  const k = key(n);
  dbMap.set(k, (dbMap.get(k) || 0) + 1);
}

const onlyExcel = new Map(excelMap);
const onlyDb = new Map(dbMap);
for (const [k, count] of excelMap.entries()) {
  if (dbMap.has(k)) {
    const matched = Math.min(count, dbMap.get(k));
    const exRem = count - matched;
    const dbRem = dbMap.get(k) - matched;
    if (exRem > 0) onlyExcel.set(k, exRem); else onlyExcel.delete(k);
    if (dbRem > 0) onlyDb.set(k, dbRem); else onlyDb.delete(k);
  }
}

const sum = (map) => {
  let totalCost = 0;
  let count = 0;
  for (const [k, c] of map.entries()) {
    const parts = k.split('|');
    totalCost += parseFloat(parts[4]) * c;
    count += c;
  }
  return { totalCost, count };
};

const excelTotals = sum(excelMap);
const dbTotals = sum(dbMap);
const onlyExcelTotals = sum(onlyExcel);
const onlyDbTotals = sum(onlyDb);

console.log('March 2026 item key comparison');
console.log(`  Excel rows: ${excelRows.length}`);
console.log(`  DB rows: ${dbRows.length}`);
console.log(`  Excel sum: ₱${excelTotals.totalCost.toFixed(2)}`);
console.log(`  DB sum: ₱${dbTotals.totalCost.toFixed(2)}`);
console.log(`  Difference: ₱${(dbTotals.totalCost - excelTotals.totalCost).toFixed(2)}\n`);
console.log(`Unmatched Excel rows: ${onlyExcel.size}, sum ₱${onlyExcelTotals.totalCost.toFixed(2)}`);
console.log(`Unmatched DB rows: ${onlyDb.size}, sum ₱${onlyDbTotals.totalCost.toFixed(2)}\n`);

const print = (title, map, limit=20) => {
  console.log(`--- ${title} ---`);
  let i=0;
  for (const [k, c] of map.entries()) {
    if (i++ >= limit) break;
    console.log(`count=${c} ${k}`);
  }
  if (map.size === 0) console.log('none');
  console.log();
};

print('ONLY IN EXCEL', onlyExcel);
print('ONLY IN DB', onlyDb);

console.log(`Only DB total cost: ₱${onlyDbTotals.totalCost.toFixed(2)}`);
console.log(`Only Excel total cost: ₱${onlyExcelTotals.totalCost.toFixed(2)}`);

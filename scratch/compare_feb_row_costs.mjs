import ExcelJS from 'exceljs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = path.join(process.env.APPDATA, 'AgriLedger', 'data', 'agridb.db');
const excelPath = path.resolve('example xl', 'agriledger back new.xlsx');
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(excelPath);
const sheet = workbook.getWorksheet('SALES FEB 2026');
if (!sheet) throw new Error('SALES FEB 2026 sheet not found');

const headers = [];
sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, idx) => {
  headers[idx] = cell.value ? String(cell.value).trim() : '';
});

const normalize = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const findCol = (names) => headers.findIndex(h => names.some(n => normalize(h) === normalize(n)));

const cols = {
  date: findCol(['DATE']),
  product: findCol(['PRODUCT']),
  qty: findCol(['QTY', 'QUANTITY']),
  unitPrice: findCol(['UNIT PRICE', 'UNITPRICE', 'PRICE']),
  costing: findCol(['COSTING', 'UNIT COST']),
  totalCost: findCol(['TOTAL COST', 'TOTALCOST']),
  status: findCol(['STATUS']),
  customer: findCol(['CUSTOMER']),
  receipt: findCol(['RECEIPT #', 'RECEIPT#', 'RECEIPT']),
  siNumber: findCol(['SI NO.', 'SINO.', 'SINO', 'SI NO', 'SI'])
};

const parseVal = (cell) => {
  const raw = cell.value;
  if (raw === null || raw === undefined || raw === '') return 0;
  const str = typeof raw === 'string' ? raw : String(raw);
  return parseFloat(str.replace(/[^0-9.-]+/g, '')) || 0;
};

const formatDateValue = (val) => {
  if (!val && val !== 0) return '';
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  const parsed = new Date(val);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return String(val).substring(0, 10);
};

const key = (row) => {
  return [row.date, row.receipt, row.siNumber, row.product, row.qty.toFixed(2), row.costing.toFixed(2), row.totalCost.toFixed(2), row.unitPrice.toFixed(2), row.customer, row.status].join('|');
};

const excelMap = new Map();
const excelRows = [];

sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
  if (rowNumber === 1) return;
  const data = {
    date: formatDateValue(row.getCell(cols.date).value),
    product: String(row.getCell(cols.product).value || '').trim().toUpperCase(),
    qty: parseVal(row.getCell(cols.qty)),
    unitPrice: parseVal(row.getCell(cols.unitPrice)),
    costing: parseVal(row.getCell(cols.costing)),
    totalCost: parseVal(row.getCell(cols.totalCost)),
    status: String(row.getCell(cols.status).value || '').trim().toUpperCase(),
    customer: String(row.getCell(cols.customer).value || '').trim().toUpperCase(),
    receipt: String(row.getCell(cols.receipt).value || '').trim().toUpperCase(),
    siNumber: String(row.getCell(cols.siNumber).value || '').trim().toUpperCase()
  };
  if (!data.date) return;
  if (['FAILED', 'RETURN'].includes(data.status)) return;
  const k = key(data);
  excelRows.push(data);
  excelMap.set(k, (excelMap.get(k) || 0) + 1);
});

const db = new DatabaseSync(dbPath, { readonly: true });
const dbRows = db.prepare(`
  SELECT s.date as sale_date, s.receipt_number, s.si_number, p.name as product_name, si.qty, si.unit_price, si.costing, si.total_cost, s.status, s.customer_id
  FROM sale_items si
  JOIN sales s ON si.sale_id = s.id
  LEFT JOIN products p ON si.product_id = p.id
  WHERE s.date >= ? AND s.date <= ? AND s.status NOT IN ('FAILED', 'Return')
`).all('2026-02-01', '2026-02-28');

const customerMap = new Map();
const custRows = db.prepare('SELECT id, name FROM customers').all();
custRows.forEach(r => customerMap.set(r.id, r.name.toUpperCase()));

const dbMap = new Map();
const dbEntries = [];
for (const row of dbRows) {
  const data = {
    date: String(row.sale_date || '').substring(0, 10),
    product: String(row.product_name || '').trim().toUpperCase(),
    qty: parseVal({ value: row.qty }),
    unitPrice: parseVal({ value: row.unit_price }),
    costing: parseVal({ value: row.costing }),
    totalCost: parseVal({ value: row.total_cost }),
    status: String(row.status || '').trim().toUpperCase(),
    customer: String(customerMap.get(row.customer_id) || '').trim().toUpperCase(),
    receipt: String(row.receipt_number || '').trim().toUpperCase(),
    siNumber: String(row.si_number || '').trim().toUpperCase()
  };
  const k = key(data);
  dbEntries.push(data);
  dbMap.set(k, (dbMap.get(k) || 0) + 1);
}

db.close();

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

const sumMap = (map) => {
  let cost = 0;
  let count = 0;
  for (const [k, c] of map.entries()) {
    const parts = k.split('|');
    cost += parseFloat(parts[5] || 0) * c; // costing replaced by total cost? Wait key includes costing as index 5? We need better.
    count += c;
  }
  return { count };
};

console.log('Excel row count:', excelRows.length);
console.log('DB row count:', dbEntries.length);
console.log('Unmatched Excel keys:', onlyExcel.size);
console.log('Unmatched DB keys:', onlyDb.size);

const printMatches = (label, map, limit = 20) => {
  console.log(`--- ${label} ---`);
  let i = 0;
  for (const [k, count] of map.entries()) {
    if (i++ >= limit) break;
    console.log(`count=${count} ${k}`);
  }
  if (map.size === 0) console.log('  none');
  console.log();
};

printMatches('ONLY IN EXCEL', onlyExcel);
printMatches('ONLY IN DB', onlyDb);

const errorRows = [];
for (const row of dbEntries) {
  const k = key(row);
  if (!excelMap.has(k)) continue;
  const matchingExcel = excelRows.find(e => key(e) === k);
  if (matchingExcel && Math.abs(matchingExcel.totalCost - row.totalCost) > 0.01) {
    errorRows.push({ excel: matchingExcel, db: row, diff: row.totalCost - matchingExcel.totalCost });
  }
}

console.log('Potential mismatched rows:', errorRows.length);
errorRows.slice(0, 20).forEach((r, idx) => {
  console.log(`${idx + 1}: ${r.excel.date} ${r.excel.product} qty=${r.excel.qty} cost=${r.excel.costing} excelTotal=${r.excel.totalCost.toFixed(2)} dbTotal=${r.db.totalCost.toFixed(2)} diff=${r.diff.toFixed(2)} receipt=${r.excel.receipt} si=${r.excel.siNumber}`);
});

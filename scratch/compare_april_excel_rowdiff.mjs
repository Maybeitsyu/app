import ExcelJS from 'exceljs';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const excelPath = path.resolve('example xl', 'agriledger back new.xlsx');
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(excelPath);
const sheet = workbook.getWorksheet('SALES APRIL 2026');
if (!sheet) throw new Error('No SALES APRIL 2026 sheet found');

const headers = [];
sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, idx) => {
  headers[idx] = cell.value ? String(cell.value).trim() : '';
});
const normalize = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const findCol = (names) => headers.findIndex((h) => names.some((n) => normalize(h) === normalize(n)));
const dateCol = findCol(['DATE']);
const siCol = findCol(['SI NO.', 'SI NO', 'SI_NUMBER', 'SI NUMBER', 'SI']);
const productCol = findCol(['PRODUCT', 'PRODUCT NAME']);
const qtyCol = findCol(['QTY', 'QUANTITY']);
const grossCol = findCol(['GROSS AMOUNT', 'GROSSAMOUNT', 'GROSS']);
const totalCostCol = findCol(['TOTAL COST', 'TOTALCOST']);
const remarksCol = findCol(['REMARKS', 'STATUS']);

const parseVal = (cell) => {
  const raw = cell.value;
  if (raw === null || raw === undefined || raw === '') return 0;
  const str = typeof raw === 'string' ? raw : String(raw);
  return parseFloat(str.replace(/[^0-9.-]+/g, '')) || 0;
};
const getString = (cell) => {
  if (!cell || cell.value === null || cell.value === undefined) return '';
  let val = cell.value;
  if (typeof val === 'object') {
    if (val.result !== undefined) val = val.result;
    else if (val.richText !== undefined) val = val.richText.map(rt => rt.text).join('');
  }
  return String(val).trim();
};

const rows = [];
sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
  if (rowNumber === 1) return;
  const dateVal = row.getCell(dateCol).value;
  if (!dateVal) return;
  const parsedDate = new Date(dateVal);
  if (Number.isNaN(parsedDate.getTime())) return;
  const date = parsedDate.toISOString().slice(0, 10);
  if (!date.startsWith('2026-04-')) return;

  const product = getString(row.getCell(productCol));
  if (!product) return;
  const key = [date, getString(row.getCell(siCol)), product.toUpperCase(), parseVal(row.getCell(qtyCol)), parseVal(row.getCell(grossCol))].join('||');
  rows.push({ key, date, si: getString(row.getCell(siCol)), product, qty: parseVal(row.getCell(qtyCol)), gross: parseVal(row.getCell(grossCol)), totalCost: parseVal(row.getCell(totalCostCol)), remarks: getString(row.getCell(remarksCol)), rowNumber });
});

const excelMap = new Map();
rows.forEach(r => {
  const entry = excelMap.get(r.key) || { rows: [], sumCost: 0 };
  entry.rows.push(r);
  entry.sumCost += r.totalCost;
  excelMap.set(r.key, entry);
});

const dbPath = path.join(process.env.APPDATA, 'AgriLedger', 'data', 'agridb.db');
const db = new DatabaseSync(dbPath, { readonly: true });
const dbRows = db.prepare(`
SELECT s.si_number AS si, s.date, p.name AS product_name, si.qty, si.unit_price, si.total_cost, s.remarks
FROM sale_items si
INNER JOIN sales s ON si.sale_id = s.id
LEFT JOIN products p ON si.product_id = p.id
WHERE s.date >= ? AND s.date <= ? AND s.status NOT IN ('FAILED','Return')
ORDER BY s.date, s.si_number
`).all('2026-04-01', '2026-04-30');

db.close();

const dbList = dbRows.map(r => {
  const key = [r.date, String(r.si || '').trim(), String(r.product_name || '').toUpperCase(), r.qty, r.unit_price * r.qty || 0].join('||');
  return { key, ...r };
});

let dbTotal = 0;
const missing = [];
for (const r of dbList) {
  dbTotal += r.total_cost;
  const entry = excelMap.get(r.key);
  if (!entry) {
    missing.push({ reason: 'no matching excel key', ...r });
  } else {
    const idx = entry.rows.findIndex(e => Math.abs(e.totalCost - r.total_cost) < 0.01);
    if (idx === -1) {
      missing.push({ reason: 'cost mismatch', db: r, excelRows: entry.rows });
    }
  }
}

console.log('DB row count', dbList.length, 'Excel raw row count', rows.length);
console.log('DB total', dbTotal.toFixed(2));
console.log('Unique Excel keys', excelMap.size);
console.log('Missing/mismatch count', missing.length);
console.log(JSON.stringify(missing.slice(0, 50), null, 2));

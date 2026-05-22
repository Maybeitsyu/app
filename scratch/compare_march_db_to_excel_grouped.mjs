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

const findHeaderIndex = (name) => headers.findIndex(h => h && h.toUpperCase().replace(/\s+/g, '').includes(name));
const idxDate = findHeaderIndex('DATE');
const idxProduct = findHeaderIndex('PRODUCT');
const idxQty = findHeaderIndex('QTY');
const idxCosting = findHeaderIndex('COSTING');
const idxTotal = findHeaderIndex('TOTALCOST');

const parseExcelDate = (value) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? s.slice(0, 10) : parsed.toISOString().slice(0, 10);
};

const normalizeExcel = (row) => {
  const date = parseExcelDate(row.getCell(idxDate).value);
  const product = String(row.getCell(idxProduct).value || '').trim().toUpperCase();
  const qty = parseFloat(row.getCell(idxQty).value) || 0;
  const costing = parseFloat(row.getCell(idxCosting).value) || 0;
  const totalCost = parseFloat(row.getCell(idxTotal).value) || 0;
  return { date, product, qty, costing, totalCost };
};

const excelRows = [];
marchSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
  if (rowNumber === 1) return;
  excelRows.push(normalizeExcel(row));
});

const groupKey = (r) => `${r.date}|${r.product}|${r.qty}|${r.costing.toFixed(2)}`;
const spreadsheetGroup = new Map();
for (const r of excelRows) {
  const key = groupKey(r);
  const existing = spreadsheetGroup.get(key) || { count: 0, totalCost: 0 };
  spreadsheetGroup.set(key, { count: existing.count + 1, totalCost: existing.totalCost + r.totalCost });
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

const dbGroup = new Map();
for (const row of dbRows) {
  const r = normalizeDb(row);
  const key = groupKey(r);
  const existing = dbGroup.get(key) || { count: 0, totalCost: 0 };
  dbGroup.set(key, { count: existing.count + 1, totalCost: existing.totalCost + r.totalCost });
}

const allKeys = new Set([...spreadsheetGroup.keys(), ...dbGroup.keys()]);
const diffs = [];
let totalExcel = 0;
let totalDb = 0;
for (const [key, val] of spreadsheetGroup.entries()) totalExcel += val.totalCost;
for (const [key, val] of dbGroup.entries()) totalDb += val.totalCost;

for (const key of allKeys) {
  const left = spreadsheetGroup.get(key) || { count: 0, totalCost: 0 };
  const right = dbGroup.get(key) || { count: 0, totalCost: 0 };
  if (left.count !== right.count || Math.abs(left.totalCost - right.totalCost) > 0.01) {
    diffs.push({ key, left, right, delta: right.totalCost - left.totalCost });
  }
}

diffs.sort((a,b) => Math.abs(b.delta) - Math.abs(a.delta));

console.log('GROUPED COMPARISON BY DATE|PRODUCT|QTY|COSTING');
console.log(`Excel rows: ${excelRows.length}, DB rows: ${dbRows.length}`);
console.log(`Excel total: ₱${totalExcel.toFixed(2)}, DB total: ₱${totalDb.toFixed(2)}, diff: ₱${(totalDb-totalExcel).toFixed(2)}\n`);

console.log('Top mismatching groups:');
for (const diff of diffs.slice(0, 30)) {
  const [date, product, qty, costing] = diff.key.split('|');
  console.log(`date=${date} product=${product} qty=${qty} costing=${Number(costing).toFixed(2)} | Excel count=${diff.left.count} total=₱${diff.left.totalCost.toFixed(2)} | DB count=${diff.right.count} total=₱${diff.right.totalCost.toFixed(2)} | delta=₱${diff.delta.toFixed(2)}`);
}

console.log('\nMismatch count:', diffs.length);

const significant = diffs.filter(d => Math.abs(d.delta) > 1);
console.log('Significant mismatches (>₱1):', significant.length);
for (const diff of significant.slice(0, 20)) {
  const [date, product, qty, costing] = diff.key.split('|');
  console.log(`  ${date} ${product} qty=${qty} cost=${costing} delta=₱${diff.delta.toFixed(2)} counts Excel=${diff.left.count} DB=${diff.right.count}`);
}

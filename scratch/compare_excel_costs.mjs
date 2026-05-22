import ExcelJS from 'exceljs';
import path from 'node:path';
import fs from 'node:fs';

const excelPath = path.resolve('example xl', 'agriledger back new.xlsx');
if (!fs.existsSync(excelPath)) {
  throw new Error(`Excel file not found: ${excelPath}`);
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(excelPath);
const sheet = workbook.getWorksheet('SALES FEB 2026') || workbook.getWorksheet('SALES 2026') || workbook.worksheets[0];
if (!sheet) throw new Error('No sheet found in Excel');

const headers = [];
sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, idx) => {
  headers[idx] = cell.value ? String(cell.value).trim() : '';
});

const normalize = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const findCol = (names) => headers.findIndex((h) => names.some((n) => normalize(h) === normalize(n)));
const dateCol = findCol(['DATE']);
const qtyCol = findCol(['QTY']);
const costingCol = findCol(['COSTING', 'UNIT COST']);
const totalCostCol = findCol(['TOTAL COST', 'TOTALCOST']);
const unitPriceCol = findCol(['UNIT PRICE', 'UNITPRICE']);

if ([dateCol, qtyCol, costingCol, totalCostCol, unitPriceCol].some((c) => c === -1)) {
  console.error('Missing required columns', { dateCol, qtyCol, costingCol, totalCostCol, unitPriceCol });
  process.exit(1);
}

const parseVal = (cell) => {
  const raw = cell.value;
  if (raw === null || raw === undefined || raw === '') return 0;
  const str = typeof raw === 'string' ? raw : String(raw);
  return parseFloat(str.replace(/[^0-9.-]+/g, '')) || 0;
};

const mismatches = [];
let totalCostSum = 0;

sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
  if (rowNumber === 1) return;
  const dateVal = row.getCell(dateCol).value;
  if (!dateVal) return;
  const qty = parseVal(row.getCell(qtyCol));
  const costing = parseVal(row.getCell(costingCol));
  const totalCost = parseVal(row.getCell(totalCostCol));
  const expected = Math.round((qty * costing) * 100) / 100;
  const diff = Math.round((totalCost - expected) * 100) / 100;
  if (Math.abs(diff) > 0.001) {
    mismatches.push({ row: rowNumber, qty, costing, totalCost, expected, diff });
  }
  totalCostSum += totalCost;
});

console.log(JSON.stringify({ totalRows: sheet.rowCount - 1, mismatches: mismatches.slice(0, 100), totalCostSum: totalCostSum.toFixed(2) }, null, 2));

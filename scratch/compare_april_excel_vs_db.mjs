import ExcelJS from 'exceljs';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const excelPath = path.resolve('example xl', 'agriledger back new.xlsx');
if (!fs.existsSync(excelPath)) {
  throw new Error(`Excel file not found: ${excelPath}`);
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(excelPath);
const sheet = workbook.getWorksheet('SALES APRIL 2026');
if (!sheet) throw new Error('No SALES APRIL 2026 sheet found in Excel');

const headers = [];
sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, idx) => {
  headers[idx] = cell.value ? String(cell.value).trim() : '';
});

const normalize = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const findCol = (names) => headers.findIndex((h) => names.some((n) => normalize(h) === normalize(n)));
const dateCol = findCol(['DATE']);
const siCol = findCol(['SI NO.', 'SI NO', 'SI_NUMBER', 'SI NUMBER', 'SI']);
const productCol = findCol(['PRODUCT', 'PRODUCT NAME']);
const totalCostCol = findCol(['TOTAL COST', 'TOTALCOST']);
const remarksCol = findCol(['REMARKS', 'STATUS']);
const grossCol = findCol(['GROSS AMOUNT', 'GROSSAMOUNT', 'GROSS']);

if ([dateCol, productCol, totalCostCol].some((c) => c === -1)) {
  console.error('Missing required columns', { dateCol, productCol, totalCostCol, siCol, remarksCol });
  process.exit(1);
}

const parseVal = (cell) => {
  const raw = cell.value;
  if (raw === null || raw === undefined || raw === '') return 0;
  const str = typeof raw === 'string' ? raw : String(raw);
  return parseFloat(str.replace(/[^0-9.-]+/g, '')) || 0;
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

  const product = String(row.getCell(productCol).value || '').trim();
  if (!product) return;
  const totalCost = parseVal(row.getCell(totalCostCol));
  const si = siCol !== -1 ? String(row.getCell(siCol).value || '').trim() : '';
  const remarks = remarksCol !== -1 ? String(row.getCell(remarksCol).value || '').trim() : '';
  const gross = grossCol !== -1 ? parseVal(row.getCell(grossCol)) : 0;

  rows.push({ rowNumber, date, si, product, remarks, gross, totalCost });
});

const excelTotal = rows.reduce((sum, r) => sum + r.totalCost, 0);
const excelReturnTotal = rows.filter(r => /RETURN|REFUND|CANCEL|VOID/i.test(r.remarks) || /RETURN/i.test(r.product)).reduce((sum, r) => sum + r.totalCost, 0);

const dbPath = path.join(process.env.APPDATA, 'AgriLedger', 'data', 'agridb.db');
const db = new DatabaseSync(dbPath, { readonly: true });
const dbTotalRow = db.prepare(`SELECT COALESCE(SUM(si.total_cost), 0) AS total_cogs FROM sale_items si INNER JOIN sales s ON si.sale_id = s.id WHERE s.date >= ? AND s.date <= ? AND s.status NOT IN ('FAILED','Return')`).get('2026-04-01', '2026-04-30');
const dbTotal = dbTotalRow.total_cogs;

console.log('Excel rows count:', rows.length);
console.log('Excel total_cost sum:', excelTotal.toFixed(2));
console.log('Excel return/refund line total:', excelReturnTotal.toFixed(2));
console.log('DB total COGS (not FAILED/Return):', dbTotal.toFixed(2));
console.log('DIFF (DB - Excel):', (dbTotal - excelTotal).toFixed(2));
console.log('First 50 Excel rows:');
console.log(JSON.stringify(rows.slice(0, 50), null, 2));

db.close();

import ExcelJS from 'exceljs';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const excelPath = path.resolve('example xl', 'agriledger back new.xlsx');
if (!fs.existsSync(excelPath)) throw new Error(`Excel file not found: ${excelPath}`);

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(excelPath);
const sheet = workbook.getWorksheet('SALES FEB 2026') || workbook.getWorksheet('SALES 2026') || workbook.worksheets[0];
if (!sheet) throw new Error('No sheet found');

const headers = [];
sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, idx) => {
  headers[idx] = cell.value ? String(cell.value).trim() : '';
});
const normalize = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const findCol = (names) => headers.findIndex((h) => names.some((n) => normalize(h) === normalize(n)));
const dateCol = findCol(['DATE']);
const siCol = findCol(['SI NO.', 'SI NO', 'SI_NUMBER', 'SI NUMBER', 'SI']);
const totalCostCol = findCol(['TOTAL COST', 'TOTALCOST']);
const costingCol = findCol(['COSTING', 'UNIT COST']);

if ([dateCol, siCol, totalCostCol, costingCol].some((c) => c === -1)) {
  console.error('Missing columns', { dateCol, siCol, totalCostCol, costingCol });
  process.exit(1);
}

const siTargets = new Set(['SI0233', 'SI0229', 'SI0217', 'SI0228']);
const excelRows = [];
const parseVal = (cell) => {
  const raw = cell.value;
  if (raw === null || raw === undefined || raw === '') return 0;
  const str = typeof raw === 'string' ? raw : String(raw);
  return parseFloat(str.replace(/[^0-9.-]+/g, '')) || 0;
};

sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
  if (rowNumber === 1) return;
  const dateVal = row.getCell(dateCol).value;
  if (!dateVal) return;
  const parsedDate = new Date(dateVal);
  if (Number.isNaN(parsedDate.getTime())) return;
  const date = parsedDate.toISOString().slice(0, 10);
  if (!date.startsWith('2026-02-')) return;
  const si = String(row.getCell(siCol).value || '').trim();
  if (!siTargets.has(si)) return;
  excelRows.push({
    row: rowNumber,
    si,
    totalCost: parseVal(row.getCell(totalCostCol)),
    costing: parseVal(row.getCell(costingCol)),
    values: row.values.slice(1).map((v) => (v === null || v === undefined ? '' : String(v)))
  });
});

const dbPath = path.join(process.env.APPDATA, 'AgriLedger', 'data', 'agridb.db');
const db = new DatabaseSync(dbPath, { readonly: true });
const dbItems = db.prepare(`SELECT s.si_number AS si, s.date, si.qty, si.costing, si.total_cost, si.gross_amount FROM sale_items si INNER JOIN sales s ON si.sale_id = s.id WHERE s.date >= ? AND s.date <= ? AND s.status NOT IN ('FAILED','Return') AND s.si_number IN (?,?,?,?) ORDER BY s.si_number, si.total_cost DESC`).all('2026-02-01', '2026-02-28', 'SI0233', 'SI0229', 'SI0217', 'SI0228');

db.close();

console.log(JSON.stringify({ excelRows, dbItems }, null, 2));

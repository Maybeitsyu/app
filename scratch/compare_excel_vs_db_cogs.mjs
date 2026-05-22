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
const sheet = workbook.getWorksheet('SALES FEB 2026') || workbook.getWorksheet('SALES 2026') || workbook.worksheets[0];
if (!sheet) throw new Error('No sheet found in Excel');

const headers = [];
sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, idx) => {
  headers[idx] = cell.value ? String(cell.value).trim() : '';
});

const normalize = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const findCol = (names) => headers.findIndex((h) => names.some((n) => normalize(h) === normalize(n)));
const dateCol = findCol(['DATE']);
const siCol = findCol(['SI NO.', 'SI NO', 'SI_NUMBER', 'SI NUMBER', 'SI']);
const totalCostCol = findCol(['TOTAL COST', 'TOTALCOST']);

if ([dateCol, siCol, totalCostCol].some((c) => c === -1)) {
  console.error('Missing required columns', { dateCol, siCol, totalCostCol });
  process.exit(1);
}

const parseVal = (cell) => {
  const raw = cell.value;
  if (raw === null || raw === undefined || raw === '') return 0;
  const str = typeof raw === 'string' ? raw : String(raw);
  return parseFloat(str.replace(/[^0-9.-]+/g, '')) || 0;
};

const excelBySi = new Map();
sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
  if (rowNumber === 1) return;
  const dateVal = row.getCell(dateCol).value;
  if (!dateVal) return;
  const parsedDate = new Date(dateVal);
  if (Number.isNaN(parsedDate.getTime())) return;
  const date = parsedDate.toISOString().slice(0, 10);
  if (!date.startsWith('2026-02-')) return;
  const si = String(row.getCell(siCol).value || '').trim();
  const totalCost = parseVal(row.getCell(totalCostCol));
  const prev = excelBySi.get(si) || 0;
  excelBySi.set(si, prev + totalCost);
});

const dbPath = path.join(process.env.APPDATA, 'AgriLedger', 'data', 'agridb.db');
const db = new DatabaseSync(dbPath, { readonly: true });
const dbRows = db.prepare(`SELECT s.si_number AS si, COALESCE(SUM(si.total_cost),0) AS total_cogs FROM sale_items si INNER JOIN sales s ON si.sale_id = s.id WHERE s.date >= ? AND s.date <= ? AND s.status NOT IN ('FAILED','Return') GROUP BY s.si_number ORDER BY total_cogs DESC`).all('2026-02-01', '2026-02-28');

db.close();

const results = dbRows.map((row) => {
  const excelTotal = excelBySi.has(row.si) ? excelBySi.get(row.si) : 0;
  return { si: row.si, dbCogs: Number(row.total_cogs.toFixed(2)), excelCogs: Number(excelTotal.toFixed(2)), diff: Number((row.total_cogs - excelTotal).toFixed(2)) };
});

const mismatched = results.filter((r) => Math.abs(r.diff) > 0.01);

console.log(JSON.stringify({ totalInvoices: results.length, mismatchedCount: mismatched.length, mismatched: mismatched.slice(0, 100) }, null, 2));

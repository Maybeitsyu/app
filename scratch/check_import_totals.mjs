import ExcelJS from 'exceljs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = path.join(process.env.APPDATA, 'AgriLedger', 'data', 'agridb.db');
const excelPath = path.resolve('example xl', 'agriledger back new.xlsx');
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(excelPath);
const sheet = workbook.getWorksheet('SALES FEB 2026') || workbook.getWorksheet('SALES 2026') || workbook.worksheets[0];
if (!sheet) throw new Error('No sheet found in Excel');

const headers = [];
sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, idx) => {
  headers[idx] = cell.value ? String(cell.value).trim() : '';
});

const findCol = (names) => {
  const normalize = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return headers.findIndex(h => names.some(n => normalize(h) === normalize(n)));
};

const dateCol = findCol(['DATE']);
const inputVatCol = findCol(['INPUT VAT', 'INPUTVAT']);
const vatExemptCol = findCol(['VAT EXEMPT SALES', 'VATEXEMPTSALES', 'VATEXEMPT']);
const costCol = findCol(['TOTAL COST', 'TOTALCOST', 'TOTAL_COST']);

if (dateCol === -1) throw new Error('DATE column not found');
if (inputVatCol === -1) throw new Error('INPUT VAT column not found');
if (vatExemptCol === -1) throw new Error('VAT EXEMPT SALES column not found');
if (costCol === -1) throw new Error('TOTAL COST column not found');

const sales = [];
const costs = [];

sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
  if (rowNumber === 1) return;
  const date = row.getCell(dateCol).value;
  if (!date) return;
  const parseVal = (cell) => {
    const raw = cell.value;
    if (raw === null || raw === undefined || raw === '') return 0;
    const str = typeof raw === 'string' ? raw : String(raw);
    return parseFloat(str.replace(/[^0-9.-]+/g, '')) || 0;
  };
  sales.push(parseVal(row.getCell(inputVatCol)) + parseVal(row.getCell(vatExemptCol)));
  costs.push(parseVal(row.getCell(costCol)));
});

const excelSales = sales.reduce((sum, v) => sum + v, 0);
const excelCOGS = costs.reduce((sum, v) => sum + v, 0);

const db = new DatabaseSync(dbPath, { readonly: true });
const salesRow = db.prepare('SELECT COALESCE(SUM(input_vat + vat_exempt_amount), 0) AS total_sales FROM sales WHERE date >= ? AND date <= ? AND status NOT IN (\'FAILED\', \'Return\')').get('2026-02-01', '2026-02-28');
const cogsRow = db.prepare('SELECT COALESCE(SUM(total_cost), 0) AS total_cogs FROM sale_items si INNER JOIN sales s ON si.sale_id = s.id WHERE s.date >= ? AND s.date <= ? AND s.status NOT IN (\'FAILED\', \'Return\')').get('2026-02-01', '2026-02-28');

db.close();

console.log('EXCEL sales total (Feb 2026)', excelSales.toFixed(2));
console.log('EXCEL cogs total', excelCOGS.toFixed(2));
console.log('DB sales total', salesRow.total_sales.toFixed(2));
console.log('DB cogs total', cogsRow.total_cogs.toFixed(2));
console.log('DIFF sales', (salesRow.total_sales - excelSales).toFixed(2));
console.log('DIFF cogs', (cogsRow.total_cogs - excelCOGS).toFixed(2));

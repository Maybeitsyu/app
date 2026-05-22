import ExcelJS from 'exceljs';
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile('example xl/agriledger back new.xlsx');
const sheet = workbook.getWorksheet('SALES APRIL 2026');
const row = sheet.getRow(176);
const values = row.values;
console.log(JSON.stringify(values, null, 2));
const headers = sheet.getRow(1).values;
console.log('HEADERS', JSON.stringify(headers, null, 2));

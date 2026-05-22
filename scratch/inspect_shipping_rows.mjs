import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile('C:\\projct ni client\\app\\example xl\\agriledger back new.xlsx');
const sheet = workbook.getWorksheet('MARCH SALES');
if (!sheet) {
  console.error('MARCH SALES not found');
  process.exit(1);
}
const header = sheet.getRow(1).values.map((v) => {
  if (v && typeof v === 'object') return v.result ?? v.text ?? '';
  return v;
}).slice(1);
console.log('headers:', header);
const rows = [12,45,78,83,87,107,163];
for (const r of rows) {
  const row = sheet.getRow(r).values.map((v) => {
    if (v && typeof v === 'object') return v.result ?? v.text ?? v;
    return v;
  }).slice(1);
  console.log('row', r, row.map((x) => (x === undefined ? '' : x)).join(' | '));
}

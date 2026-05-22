import ExcelJS from 'exceljs';
const bookPath = 'example xl/agriledger back new.xlsx';
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(bookPath);
console.log(workbook.worksheets.map(ws => ws.name).join('\n'));

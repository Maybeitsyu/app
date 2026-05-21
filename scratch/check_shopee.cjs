const ExcelJS = require('exceljs');
const path = require('path');

async function run() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.resolve('example xl/agriledger back up.xlsx'));
  const sheet = workbook.getWorksheet('SALES MAY 2026');
  
  const row = sheet.getRow(3);
  row.eachCell({includeEmpty: true}, (cell, colNumber) => {
    console.log(`Col ${colNumber}: ${cell.value}`);
  });
}
run();

const ExcelJS = require('exceljs');

async function checkRawDates() {
  const filePath = 'example xl/agriledger back up.xlsx';
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet('SALES MAY 2026');
  if (!sheet) { console.log('Sheet not found'); return; }

  console.log('Row | Raw Value | Type | is Date Instance');
  for (let i = 2; i <= 20; i++) {
    const cell = sheet.getRow(i).getCell(1);
    console.log(`${i} | ${cell.value} | ${cell.type} | ${cell.value instanceof Date}`);
  }
}

checkRawDates().catch(console.error);

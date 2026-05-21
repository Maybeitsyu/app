const ExcelJS = require('exceljs');

async function viewRows() {
  const filePath = 'example xl/agriledger back up.xlsx';
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('SALES MAY 2026');

  // Let's print headers first to map column indices
  let headers = [];
  for (let col = 1; col <= sheet.columnCount; col++) {
    headers[col] = sheet.getRow(1).getCell(col).value;
  }
  console.log('Headers:', headers);

  const printRow = (rowNum) => {
    const row = sheet.getRow(rowNum);
    console.log(`\n=== ROW ${rowNum} ===`);
    for (let col = 1; col <= headers.length; col++) {
      if (headers[col]) {
        console.log(`Col ${col} (${headers[col]}): value="${row.getCell(col).value}" type=${row.getCell(col).type}`);
      }
    }
  };

  printRow(74);
  printRow(172);
}

viewRows().catch(console.error);

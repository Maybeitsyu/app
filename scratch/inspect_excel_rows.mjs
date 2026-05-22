import ExcelJS from 'exceljs';

const excelPath = 'example xl/example.xlsx';

async function run() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  
  const sheet = workbook.getWorksheet('1ST QTR SALES 2026');
  
  console.log('--- Finding DUFAMOXG in Excel sheet ---');
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const rowVals = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      let v = cell.value;
      if (v && typeof v === 'object' && v.result !== undefined) v = v.result;
      rowVals[colNumber] = v;
    });
    const rowStr = rowVals.join(' | ');
    if (rowStr.toUpperCase().includes('DUFAMOX')) {
      console.log(`Row ${r}:`, rowVals.slice(1, 16).join(' | '));
    }
  }
}

run().catch(console.error);

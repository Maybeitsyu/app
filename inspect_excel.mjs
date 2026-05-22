import ExcelJS from 'exceljs';
import path from 'path';

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path.join('example xl', 'example.xlsx'));

const sheets = wb.worksheets;
console.log('Sheets:', sheets.map(s => s.name));

sheets.forEach(sheet => {
  console.log(`\n=== ${sheet.name} ===`);
  const row1 = sheet.getRow(1).values;
  console.log('Row 1:', row1);
  
  if (sheet.name.includes('EXP')) {
    console.log('Headers row 2:');
    const headers = sheet.getRow(2).values;
    console.log(headers);
    console.log('Header count:', headers ? headers.length : 0);
    
    console.log('\nFirst 3 data rows (starting row 3):');
    for (let i = 3; i <= 5; i++) {
      const row = sheet.getRow(i);
      if (row.hasValues) {
        console.log(`Row ${i}:`, row.values);
      }
    }
  }
});

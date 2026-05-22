import ExcelJS from 'exceljs';
import fs from 'fs';

const excelPath = 'example xl/example.xlsx';

async function run() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  
  console.log('Successfully loaded example.xlsx!');
  
  const sheetNames = workbook.worksheets.map(w => w.name);
  console.log('Sheets:', sheetNames);
  
  // Let's inspect '1ST QTR SALES 2026' sheet
  const sheet = workbook.getWorksheet('1ST QTR SALES 2026');
  if (!sheet) {
    console.log('Sheet 1ST QTR SALES 2026 not found!');
    return;
  }
  
  console.log(`\nAnalyzing sheet: "${sheet.name}"`);
  console.log(`Row count: ${sheet.rowCount}`);
  
  // Let's print the first 10 rows' values to understand its structure safely
  console.log('\n--- First 10 rows structure ---');
  for (let i = 1; i <= Math.min(sheet.rowCount, 15); i++) {
    const row = sheet.getRow(i);
    const vals = [];
    // Safely iterate cells without triggering index out of bounds
    for (let c = 1; c <= 30; c++) {
      try {
        const cell = row.getCell(c);
        let v = cell ? cell.value : null;
        if (v && typeof v === 'object' && v.result !== undefined) {
          v = v.result;
        }
        vals.push(v);
      } catch (e) {
        vals.push(null);
      }
    }
    // Trim trailing nulls for cleaner output
    while (vals.length > 0 && vals[vals.length - 1] === null) {
      vals.pop();
    }
    console.log(`Row ${i}:`, vals.join(' | '));
  }
}

run().catch(console.error);
